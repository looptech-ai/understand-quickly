// Per-format graph stats extractors.
//
// `extractStats(format, body)` returns `{ nodes_count, edges_count, top_kinds,
// languages }` for first-class formats, derived from a *validated* graph body.
//
// All four fields are optional on the registry entry — the caller (sync.mjs)
// merges them in on `status: 'ok'` and clears them otherwise. Unknown formats
// return `{}` so the sync pipeline simply skips stats without failing.
//
// Field shapes (mirrored in schemas/meta.schema.json):
//   - nodes_count: integer >= 0
//   - edges_count: integer >= 0
//   - top_kinds:  [{ kind: string, count: integer }] sorted desc, capped at 10
//   - languages:  string[] lowercased + deduped, capped at 10

const TOP_KINDS_CAP = 10;
const LANGUAGES_CAP = 10;

function countBy(items, keyFn) {
  const counts = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (typeof k !== 'string' || k.length === 0) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

function topKinds(counts, cap = TOP_KINDS_CAP) {
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    .slice(0, cap);
}

function dedupeLowerSort(values, cap = LANGUAGES_CAP) {
  const seen = new Set();
  for (const v of values) {
    if (typeof v !== 'string' || v.length === 0) continue;
    seen.add(v.toLowerCase());
  }
  return [...seen].sort().slice(0, cap);
}

function understandAnythingStats(body) {
  const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
  const edges = Array.isArray(body?.edges) ? body.edges : [];
  return {
    nodes_count: nodes.length,
    edges_count: edges.length,
    top_kinds: topKinds(countBy(nodes, n => n?.kind)),
    languages: []
  };
}

function gitnexusStats(body) {
  const nodes = Array.isArray(body?.graph?.nodes) ? body.graph.nodes : [];
  const links = Array.isArray(body?.graph?.links) ? body.graph.links : [];

  // top_kinds from node.label, lowercased.
  const counts = countBy(nodes, n => (typeof n?.label === 'string' ? n.label.toLowerCase() : null));

  // languages from node.properties.language plus body.metadata.languages.
  const langs = [];
  for (const n of nodes) {
    const lang = n?.properties?.language;
    if (typeof lang === 'string') langs.push(lang);
  }
  const meta = body?.metadata?.languages;
  if (Array.isArray(meta)) {
    for (const l of meta) if (typeof l === 'string') langs.push(l);
  }

  return {
    nodes_count: nodes.length,
    edges_count: links.length,
    top_kinds: topKinds(counts),
    languages: dedupeLowerSort(langs)
  };
}

function codeReviewGraphStats(body) {
  const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
  const edges = Array.isArray(body?.edges) ? body.edges : [];

  const counts = countBy(nodes, n => (typeof n?.kind === 'string' ? n.kind.toLowerCase() : null));

  // languages from body.stats.languages (object → keys). Code-review-graph's
  // wire shape is actually an array, but the spec asks for "object → keys"
  // to be tolerant of either; if it's already an array we use it directly.
  const statsLangs = body?.stats?.languages;
  let langs = [];
  if (Array.isArray(statsLangs)) {
    langs = statsLangs;
  } else if (statsLangs && typeof statsLangs === 'object') {
    langs = Object.keys(statsLangs);
  }

  return {
    nodes_count: nodes.length,
    edges_count: edges.length,
    top_kinds: topKinds(counts),
    languages: dedupeLowerSort(langs)
  };
}

function genericStats(body) {
  const nodes = Array.isArray(body?.nodes) ? body.nodes : [];
  const edges = Array.isArray(body?.edges) ? body.edges : [];
  return {
    nodes_count: nodes.length,
    edges_count: edges.length,
    top_kinds: [],
    languages: []
  };
}

const EXTRACTORS = {
  'understand-anything@1': understandAnythingStats,
  'gitnexus@1': gitnexusStats,
  'code-review-graph@1': codeReviewGraphStats,
  'generic@1': genericStats
};

/**
 * Extract per-entry stats from a validated graph body.
 *
 * @param {string} format  Format id (e.g. `understand-anything@1`).
 * @param {object} body    Parsed graph body.
 * @returns {object}       `{ nodes_count, edges_count, top_kinds, languages }`
 *                         for known formats. Returns `{}` for unknown formats
 *                         so the caller can skip stats without failing the
 *                         sync.
 */
export function extractStats(format, body) {
  const fn = EXTRACTORS[format];
  if (!fn) return {};
  try {
    return fn(body);
  } catch {
    // Defensive: any unexpected shape just yields no stats — the sync run
    // shouldn't fail because a single graph had a surprising sub-shape.
    return {};
  }
}

// Re-export internals for tests / aggregator reuse.
export const __internal = { countBy, topKinds, dedupeLowerSort };
