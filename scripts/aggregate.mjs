// Cross-graph aggregator. Walks every `ok` entry in the registry, fetches the
// graph body, and emits a single `site/stats.json` summarising:
//
//   - totals.{entries, nodes, edges}
//   - kinds:     [{ kind, count, entries }] across all graphs
//   - languages: [{ language, entries }] (unique-per-entry counts)
//   - concepts:  [{ term, entries, samples }] tokenized from labels/names,
//                kept only when shared by >= 2 entries.
//
// Designed to be safe with zero `ok` entries -> emits empty arrays + zero
// totals. Never throws (per-entry fetch errors are swallowed and skipped).
//
// Exports `aggregate({ registry, fetchImpl, now })` for testing without
// network access.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { loadRegistry } from './shard.mjs';

const SCHEMA_VERSION = 1;
const CONCEPTS_CAP = 50;
const SAMPLES_CAP = 3;
const MIN_TERM_LEN = 3;
// Per-fetch timeout. A single hung producer must not block the entire
// aggregator run. 30s is generous for a 50MB raw.githubusercontent.com fetch
// while still being short enough that one failure surfaces in CI logs.
const FETCH_TIMEOUT_MS = 30_000;
// Hard cap on how much body we are willing to parse, mirroring sync.mjs.
const MAX_BODY_BYTES = 50 * 1024 * 1024;
// Parallel fetches across producers. Bounded so we don't overrun the GitHub
// raw.githubusercontent.com per-IP edge while still cutting wall-clock time
// proportionally to the registry size.
const FETCH_CONCURRENCY = 6;
// Skip tokenization for adversarially long labels — a 4096-char label with
// thousands of repeated tokens can dominate the run for no signal value.
const MAX_LABEL_LEN = 256;

// Tiny stopword list (per spec). Intentionally small -- broad blocking lists
// hurt recall on a graph of code concepts where domain terms matter.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that',
  'from', 'into', 'your', 'our', 'use', 'uses', 'used'
]);

// Tokenize one string into lowercase a-z words of length >= MIN_TERM_LEN.
// Unicode and digits are intentionally excluded so we get a focused set of
// English-ish concept words from labels/names.
function tokenize(s) {
  if (typeof s !== 'string') return [];
  if (s.length > MAX_LABEL_LEN) return [];
  const out = [];
  const re = /[a-z]+/g;
  const lower = s.toLowerCase();
  let m;
  while ((m = re.exec(lower)) !== null) {
    const tok = m[0];
    if (tok.length < MIN_TERM_LEN) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

// Pull labels/names off whatever graph shape we got. We tolerate every
// first-class wire format here -- the aggregator runs after sync but we don't
// want it to refuse a body just because its format string is unfamiliar.
function* iterNodeLabels(body) {
  if (Array.isArray(body?.nodes)) {
    for (const n of body.nodes) {
      if (typeof n?.label === 'string') yield n.label;
      if (typeof n?.name === 'string') yield n.name;
    }
  }
  if (Array.isArray(body?.graph?.nodes)) {
    for (const n of body.graph.nodes) {
      if (typeof n?.label === 'string') yield n.label;
      if (typeof n?.name === 'string') yield n.name;
    }
  }
}

// Languages per entry (unique within the entry). We re-derive these from the
// body rather than trusting `entry.languages` so the aggregator works even on
// pre-stats registries.
function languagesFromBody(format, body) {
  const out = new Set();
  const push = (v) => { if (typeof v === 'string' && v) out.add(v.toLowerCase()); };

  if (format === 'gitnexus@1' && Array.isArray(body?.graph?.nodes)) {
    for (const n of body.graph.nodes) push(n?.properties?.language);
    if (Array.isArray(body?.metadata?.languages)) {
      for (const l of body.metadata.languages) push(l);
    }
  } else if (format === 'code-review-graph@1') {
    const sl = body?.stats?.languages;
    if (Array.isArray(sl)) for (const l of sl) push(l);
    else if (sl && typeof sl === 'object') for (const k of Object.keys(sl)) push(k);
  }
  return out;
}

// Kinds per entry: count(kind) -> number, with kind lowercased.
function kindsFromBody(format, body) {
  const counts = new Map();
  const bump = (k) => {
    if (typeof k !== 'string' || !k) return;
    const lk = k.toLowerCase();
    counts.set(lk, (counts.get(lk) || 0) + 1);
  };
  if (format === 'gitnexus@1' && Array.isArray(body?.graph?.nodes)) {
    for (const n of body.graph.nodes) bump(n?.label);
  } else if (Array.isArray(body?.nodes)) {
    for (const n of body.nodes) bump(n?.kind);
  }
  return counts;
}

function edgeCount(format, body) {
  if (format === 'gitnexus@1') return Array.isArray(body?.graph?.links) ? body.graph.links.length : 0;
  return Array.isArray(body?.edges) ? body.edges.length : 0;
}

function nodeCount(format, body) {
  if (format === 'gitnexus@1') return Array.isArray(body?.graph?.nodes) ? body.graph.nodes.length : 0;
  return Array.isArray(body?.nodes) ? body.nodes.length : 0;
}

async function fetchBody(entry, fetchImpl) {
  // Per-fetch timeout via AbortController so a single hung producer can't
  // wedge the aggregator. The undici fetch in Node 20 honors `signal`.
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(entry.graph_url, controller ? { signal: controller.signal } : undefined);
    if (!res || !res.ok) return null;
    const len = res.headers && typeof res.headers.get === 'function'
      ? Number(res.headers.get('content-length'))
      : NaN;
    // Refuse oversized bodies pre-buffer. A producer claiming 200 OK on a
    // 500MB body would otherwise OOM the aggregator before sync.mjs marked
    // them oversize on the next run.
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) return null;
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Fixed-size worker pool. Plain Promise.all with a slice would balloon to
// `okEntries.length` parallel sockets — fine at 10 entries, lethal at 1000.
async function mapWithConcurrency(items, concurrency, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function pull() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => pull());
  await Promise.all(workers);
  return out;
}

/**
 * Pure aggregator entrypoint. Drives sync without touching disk so tests can
 * inject `fetchImpl` and a deterministic `now`.
 *
 * @param {object}   args
 * @param {object}   args.registry    Registry object (with `entries`).
 * @param {Function} [args.fetchImpl] fetch impl (defaults to global fetch).
 * @param {Function} [args.now]       Time source (defaults to `() => new Date()`).
 * @returns {Promise<object>} The stats.json payload.
 */
export async function aggregate({
  registry,
  fetchImpl = fetch,
  now = () => new Date()
} = {}) {
  const okEntries = (registry?.entries || []).filter(e => e?.status === 'ok' && e?.graph_url);

  let totalNodes = 0;
  let totalEdges = 0;

  // kind -> { count, entries:Set<id> }
  const kindAgg = new Map();
  // language -> Set<id>
  const langAgg = new Map();
  // term -> Set<id>
  const termAgg = new Map();
  // term -> ordered list of entry ids (for samples)
  const termSamples = new Map();

  let countedEntries = 0;

  // Fetch in parallel (bounded), then fold into the aggregators serially so
  // counts stay deterministic regardless of arrival order.
  const bodies = await mapWithConcurrency(
    okEntries,
    FETCH_CONCURRENCY,
    (e) => fetchBody(e, fetchImpl)
  );

  for (let i = 0; i < okEntries.length; i++) {
    const e = okEntries[i];
    const body = bodies[i];
    if (body == null) continue;

    countedEntries++;
    totalNodes += nodeCount(e.format, body);
    totalEdges += edgeCount(e.format, body);

    const kinds = kindsFromBody(e.format, body);
    for (const [kind, count] of kinds) {
      let agg = kindAgg.get(kind);
      if (!agg) { agg = { count: 0, entries: new Set() }; kindAgg.set(kind, agg); }
      agg.count += count;
      agg.entries.add(e.id);
    }

    const langs = languagesFromBody(e.format, body);
    for (const lang of langs) {
      let s = langAgg.get(lang);
      if (!s) { s = new Set(); langAgg.set(lang, s); }
      s.add(e.id);
    }

    const seenInEntry = new Set();
    for (const label of iterNodeLabels(body)) {
      for (const tok of tokenize(label)) {
        if (seenInEntry.has(tok)) continue;
        seenInEntry.add(tok);
        let s = termAgg.get(tok);
        if (!s) { s = new Set(); termAgg.set(tok, s); }
        s.add(e.id);
        let samples = termSamples.get(tok);
        if (!samples) { samples = []; termSamples.set(tok, samples); }
        if (samples.length < SAMPLES_CAP && !samples.includes(e.id)) samples.push(e.id);
      }
    }
  }

  const kinds = [...kindAgg.entries()]
    .map(([kind, { count, entries }]) => ({ kind, count, entries: entries.size }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  const languages = [...langAgg.entries()]
    .map(([language, set]) => ({ language, entries: set.size }))
    .sort((a, b) => b.entries - a.entries || a.language.localeCompare(b.language));

  const concepts = [...termAgg.entries()]
    .filter(([, set]) => set.size >= 2)
    .map(([term, set]) => ({
      term,
      entries: set.size,
      samples: (termSamples.get(term) || []).slice(0, SAMPLES_CAP)
    }))
    .sort((a, b) => b.entries - a.entries || a.term.localeCompare(b.term))
    .slice(0, CONCEPTS_CAP);

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: now().toISOString(),
    totals: { entries: countedEntries, nodes: totalNodes, edges: totalEdges },
    kinds,
    languages,
    concepts
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    registry: get('--registry', 'registry.json'),
    out: get('--out', 'site/stats.json')
  };
}

async function main() {
  const { registry: regPath, out: outPath } = parseArgs(process.argv);

  const absReg = resolve(regPath);
  let registry;
  if (basename(absReg) === 'registry.json') {
    registry = loadRegistry({ root: dirname(absReg) });
  } else {
    registry = JSON.parse(readFileSync(regPath, 'utf8'));
  }

  const stats = await aggregate({ registry });

  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(stats, null, 2) + '\n');
  console.log(`wrote ${outPath} (entries=${stats.totals.entries} kinds=${stats.kinds.length} langs=${stats.languages.length} concepts=${stats.concepts.length})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
