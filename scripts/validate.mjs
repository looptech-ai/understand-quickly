import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMAS_DIR = 'schemas';
const META_PATH = join(SCHEMAS_DIR, 'meta.schema.json');

function loadAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function loadFormatSchemas() {
  const out = {};
  for (const f of readdirSync(SCHEMAS_DIR)) {
    if (f === 'meta.schema.json' || !f.endsWith('.json')) continue;
    const full = join(SCHEMAS_DIR, f);
    if (!statSync(full).isFile()) continue;
    const id = f.replace(/\.json$/, '');
    out[id] = JSON.parse(readFileSync(full, 'utf8'));
  }
  return out;
}

export function validateRegistry(registry) {
  const ajv = loadAjv();
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
  const validate = ajv.compile(meta);
  const ok = validate(registry);
  if (!ok) {
    return { ok: false, errors: validate.errors.map(e => ({ message: `${e.instancePath} ${e.message}` })) };
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
    return { ok: false, errors: [{ message: `unknown format ${format}` }] };
  }
  const ajv = loadAjv();
  const validate = ajv.compile(schemas[format]);
  const ok = validate(body);
  return ok
    ? { ok: true, errors: [] }
    : { ok: false, errors: validate.errors.slice(0, 5).map(e => ({ message: `${e.instancePath} ${e.message}` })) };
}

export async function fetchAndValidate(entry, fetchImpl = fetch) {
  const head = await fetchImpl(entry.graph_url, { method: 'HEAD' });
  if (!head.ok) {
    return { ok: false, errors: [{ message: `HEAD ${entry.graph_url} returned ${head.status}` }] };
  }
  const sizeHeader = head.headers.get('content-length');
  const size = sizeHeader ? Number(sizeHeader) : null;
  if (size !== null && size > 50 * 1024 * 1024) {
    return { ok: false, errors: [{ message: `oversize: ${size} bytes` }] };
  }
  const res = await fetchImpl(entry.graph_url);
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
  const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
  const r = validateRegistry(registry);
  if (!r.ok) {
    console.error('REGISTRY INVALID:');
    for (const e of r.errors) console.error(`  - ${e.message}`);
    process.exit(1);
  }

  const changedIds = new Set((process.env.CHANGED_IDS || '').split(',').filter(Boolean));
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
