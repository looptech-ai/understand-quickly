import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry } from './shard.mjs';

const SCHEMAS_DIR = 'schemas';
const META_PATH = join(SCHEMAS_DIR, 'meta.schema.json');

let _ajv = null;
let _formatSchemas = null;
const _formatValidators = new Map();
let _metaValidator = null;

function loadAjv() {
  if (_ajv) return _ajv;
  // strict:'log' surfaces unknown keywords without crashing — catches schema
  // typos in CI without breaking older fixtures that pre-date a keyword bump.
  _ajv = new Ajv({ allErrors: true, strict: 'log' });
  addFormats(_ajv);
  return _ajv;
}

function loadFormatSchemas() {
  if (_formatSchemas) return _formatSchemas;
  const out = {};
  for (const f of readdirSync(SCHEMAS_DIR)) {
    if (f === 'meta.schema.json' || !f.endsWith('.json')) continue;
    const full = join(SCHEMAS_DIR, f);
    if (!statSync(full).isFile()) continue;
    const id = f.replace(/\.json$/, '');
    out[id] = JSON.parse(readFileSync(full, 'utf8'));
  }
  _formatSchemas = out;
  return out;
}

function describeValidationError(format, err) {
  // Surface a short human-friendly hint for the most common producer mistakes.
  // ajv messages are accurate but cryptic; the wrapped form is what we surface
  // in CI comments and the registry's `last_error` column.
  const path = err.instancePath || '(root)';
  const msg = err.message || 'failed';
  const hint = err.params?.missingProperty
    ? ` (missing required property "${err.params.missingProperty}")`
    : '';
  return `${path} ${msg}${hint}`;
}

export function validateRegistry(registry) {
  if (!_metaValidator) {
    const ajv = loadAjv();
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
    _metaValidator = ajv.compile(meta);
  }
  const ok = _metaValidator(registry);
  if (!ok) {
    return { ok: false, errors: _metaValidator.errors.map(e => ({ message: describeValidationError('meta', e) })) };
  }
  const seen = new Set();
  for (const e of registry.entries) {
    if (seen.has(e.id)) {
      return { ok: false, errors: [{ message: `duplicate id ${e.id}` }] };
    }
    seen.add(e.id);
  }
  return { ok: true, errors: [] };
}

export function validateGraph(format, body) {
  const schemas = loadFormatSchemas();
  if (!schemas[format]) {
    return {
      ok: false,
      errors: [{
        message: `unknown format "${format}". Known formats: ${Object.keys(schemas).sort().join(', ')}. To register a new one, see docs/integrations/protocol.md §7.`
      }]
    };
  }
  let validate = _formatValidators.get(format);
  if (!validate) {
    validate = loadAjv().compile(schemas[format]);
    _formatValidators.set(format, validate);
  }
  const ok = validate(body);
  if (ok) return { ok: true, errors: [] };
  // Top error becomes the headline; the rest are kept for debugging. Limited
  // to 5 because Ajv's allErrors mode can produce dozens for one shape mismatch.
  const errors = validate.errors.slice(0, 5).map(e => ({
    message: describeValidationError(format, e)
  }));
  errors.unshift({
    message: `Graph does not match \`${format}\` schema. See https://github.com/looptech-ai/understand-quickly/blob/main/schemas/${format}.json`
  });
  return { ok: false, errors };
}

// Retry network-failure-class errors. We retry on:
//   - thrown errors (TLS, DNS, ECONNRESET, abort, etc.)
//   - 5xx and 408/429 (server-side transient)
// 4xx (404, 410, etc.) are NOT retried — those are deterministic producer
// faults and should fail fast with a clear message.
async function fetchWithRetry(fetchImpl, url, opts = {}, { maxRetries = 3, baseDelay = 200 } = {}) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await fetchImpl(url, opts);
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < maxRetries) {
      // Linear backoff with a small ceiling — registry has dozens of entries
      // and exponential would compound long-tail latency.
      await new Promise(r => setTimeout(r, baseDelay * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchAndValidate(entry, fetchImpl = fetch) {
  let head;
  try {
    head = await fetchWithRetry(fetchImpl, entry.graph_url, { method: 'HEAD' });
  } catch (e) {
    return { ok: false, errors: [{ message: `HEAD ${entry.graph_url} failed: ${e?.message || e}` }] };
  }
  if (!head.ok) {
    return { ok: false, errors: [{ message: `HEAD ${entry.graph_url} returned ${head.status}` }] };
  }
  const sizeHeader = head.headers.get('content-length');
  const size = sizeHeader ? Number(sizeHeader) : null;
  if (size !== null && size > 50 * 1024 * 1024) {
    return { ok: false, errors: [{ message: `oversize: ${size} bytes` }] };
  }
  let res;
  try {
    res = await fetchWithRetry(fetchImpl, entry.graph_url);
  } catch (e) {
    return { ok: false, errors: [{ message: `GET ${entry.graph_url} failed: ${e?.message || e}` }] };
  }
  if (!res.ok) return { ok: false, errors: [{ message: `GET ${entry.graph_url} returned ${res.status}` }] };
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ message: `invalid JSON: ${e.message}` }] };
  }
  return validateGraph(entry.format, body);
}

async function main() {
  // Read via the sharded loader so PR-time validation also covers any shards
  // that exist on disk. If there are no shards (the common case today) this
  // behaves identically to a plain `readFileSync('registry.json')`.
  const registry = loadRegistry({ root: process.cwd() });
  const r = validateRegistry(registry);
  if (!r.ok) {
    console.error('REGISTRY INVALID:');
    for (const e of r.errors) console.error(`  - ${e.message}`);
    process.exit(1);
  }

  // CHANGED_IDS is set from a `git diff` in CI. Validate the shape so a
  // malformed value (or an attacker-controlled fork PR env) can't OOM the
  // process or smuggle empty strings past the size cap.
  const ID_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const rawIds = (process.env.CHANGED_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (rawIds.length > 1000) {
    console.error(`CHANGED_IDS has ${rawIds.length} entries (cap 1000); refusing to validate`);
    process.exit(1);
  }
  const changedIds = new Set(rawIds.filter(id => ID_RE.test(id)));
  const subset = changedIds.size > 0
    ? registry.entries.filter(e => changedIds.has(e.id))
    : registry.entries;

  let failed = 0;
  for (const e of subset) {
    const v = await fetchAndValidate(e);
    if (!v.ok) {
      failed++;
      console.error(`ENTRY ${e.id}:`);
      for (const err of v.errors) console.error(`  - ${err.message}`);
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`OK: ${subset.length} entries validated`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
