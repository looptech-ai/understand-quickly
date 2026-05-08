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

// Structural caps applied post-JSON-parse to defend against adversarial graphs
// (poisoned labels, schema bombs). Tunables live next to the extractors so all
// graph-shape limits sit in one place.
const MAX_NODES = 100_000;
const MAX_EDGES = 500_000;
const MAX_LABEL_LEN = 4096;
const MAX_TREE_DEPTH = 32;
// 40-hex git sha. Anything else (e.g. `main`, short shas, refs) is rejected so
// `source_sha` always satisfies the schema's `^[a-f0-9]{40}$` pattern.
const SHA_RE = /^[a-f0-9]{40}$/;

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

/**
 * Sniff the producer-supplied source-repo commit sha out of a validated graph
 * body. Each first-class format keeps this in a slightly different place; we
 * inspect the documented locations and accept the first 40-hex match found.
 *
 * Returns `null` when:
 *   - the format is unknown or has no convention (`generic@1`),
 *   - none of the candidate paths held a value, or
 *   - the value found wasn't a 40-hex sha (e.g. `"main"` or a short sha).
 *
 * Defensive against arbitrary body shapes — never throws.
 */
export function extractSourceSha(format, body) {
  if (!body || typeof body !== 'object') return null;
  const candidates = [];
  if (format === 'understand-anything@1') {
    candidates.push(body?.metadata?.source_sha, body?.metadata?.commit);
  } else if (format === 'gitnexus@1') {
    candidates.push(
      body?.metadata?.commit,
      body?.metadata?.repo?.commit,
      body?.graph?.metadata?.commit
    );
  } else if (format === 'code-review-graph@1') {
    candidates.push(body?.metadata?.commit, body?.stats?.commit);
  } else {
    // generic@1 + unknown formats: no producer convention.
    return null;
  }
  for (const c of candidates) {
    if (typeof c === 'string' && SHA_RE.test(c)) return c;
  }
  return null;
}

/**
 * Compute the maximum tree depth of a parsed JSON value. Iterative DFS with
 * an explicit stack — recursion would blow the call stack on a hostile body
 * before we ever hit the depth check. Returns the deepest level reached, or
 * stops early once `cap` is exceeded (we only need to know "too deep").
 *
 * Root is depth 1. A schema bomb of nested arrays/objects is exactly what we
 * want to catch here.
 */
function maxDepth(value, cap = MAX_TREE_DEPTH + 1) {
  if (value === null || typeof value !== 'object') return 1;
  let max = 1;
  // stack of [node, depth]
  const stack = [[value, 1]];
  while (stack.length > 0) {
    const [n, d] = stack.pop();
    if (d > max) max = d;
    if (max > cap) return max;
    if (Array.isArray(n)) {
      for (const child of n) {
        if (child !== null && typeof child === 'object') stack.push([child, d + 1]);
      }
    } else {
      for (const k of Object.keys(n)) {
        const child = n[k];
        if (child !== null && typeof child === 'object') stack.push([child, d + 1]);
      }
    }
  }
  return max;
}

// Per-format accessors for the structural caps. We only need to count and
// scan what the format declares as nodes/edges/labels — anything else lives
// in metadata or extension blocks and isn't part of the attack surface.
function nodesEdgesFor(format, body) {
  if (format === 'gitnexus@1') {
    return {
      nodes: Array.isArray(body?.graph?.nodes) ? body.graph.nodes : [],
      edges: Array.isArray(body?.graph?.links) ? body.graph.links : []
    };
  }
  return {
    nodes: Array.isArray(body?.nodes) ? body.nodes : [],
    edges: Array.isArray(body?.edges) ? body.edges : []
  };
}

function* iterLabelsForCap(format, body) {
  const { nodes, edges } = nodesEdgesFor(format, body);
  for (const n of nodes) {
    if (typeof n?.label === 'string') yield n.label;
    if (typeof n?.name === 'string') yield n.name;
    if (typeof n?.kind === 'string') yield n.kind;
  }
  for (const e of edges) {
    if (typeof e?.label === 'string') yield e.label;
    if (typeof e?.kind === 'string') yield e.kind;
    if (typeof e?.type === 'string') yield e.type;
  }
}

/**
 * Adversarial-graph defense: structural caps applied post-parse so a body
 * that's small in bytes but pathological in shape still fails closed.
 *
 * Returns:
 *   - `{ ok: true }`                       — body is within limits.
 *   - `{ ok: false, status, error }`       — first cap that tripped, with
 *                                            the entry status and error
 *                                            string sync.mjs should use.
 *
 * Order matters: depth is checked first because a schema bomb would otherwise
 * blow the stack on any field-by-field inspection.
 */
export function validateBodyLimits(body, format) {
  if (body === null || typeof body !== 'object') return { ok: true };

  // 1) Schema bomb (nested object/array depth).
  const depth = maxDepth(body, MAX_TREE_DEPTH + 1);
  if (depth > MAX_TREE_DEPTH) {
    return { ok: false, status: 'invalid', error: 'schema bomb' };
  }

  const { nodes, edges } = nodesEdgesFor(format, body);

  // 2) Node count.
  if (nodes.length > MAX_NODES) {
    return { ok: false, status: 'oversize', error: 'too many nodes' };
  }
  // 3) Edge count.
  if (edges.length > MAX_EDGES) {
    return { ok: false, status: 'oversize', error: 'too many edges' };
  }

  // 4) Per-label length cap.
  for (const label of iterLabelsForCap(format, body)) {
    if (label.length > MAX_LABEL_LEN) {
      return { ok: false, status: 'invalid', error: 'label too long' };
    }
  }

  return { ok: true };
}

// Re-export internals for tests / aggregator reuse.
export const __internal = {
  countBy,
  topKinds,
  dedupeLowerSort,
  maxDepth,
  MAX_NODES,
  MAX_EDGES,
  MAX_LABEL_LEN,
  MAX_TREE_DEPTH
};
