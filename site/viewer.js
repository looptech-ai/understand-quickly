// understand-quickly — graph viewer.
// Lazy-loads vis-network from a pinned CDN, fetches the entry's graph_url,
// normalizes node/edge shapes per format, and renders an in-pane
// force-directed graph using a node-type color palette.

const VIS_NETWORK_URL =
  'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';

let visLoader = null;
let currentNetwork = null;
let currentContainer = null;

const PREFERS_REDUCED = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- node-type colour palette ----------------------------------------
// Mirrors the --node-* tokens in styles.css. Resolved here so the canvas
// (which does not consume CSS variables) uses the same colors.
const NODE_COLORS = {
  file:      '#4a7c9b',
  function:  '#5a9e6f',
  class:     '#8b6fb0',
  module:    '#c9a06c',
  concept:   '#b07a8a',
  service:   '#a78bfa',
  table:     '#6ee7b7',
  schema:    '#fcd34d',
  endpoint:  '#fdba74',
  pipeline:  '#fda4af',
  entity:    '#7ba4c9',
  config:    '#5eead4',
  document:  '#7dd3fc',
  resource:  '#a5b4fc',
  claim:     '#6fb07a',
  article:   '#d4a574',
  topic:     '#c9b06c',
  source:    '#8a8a8a',
};
const FALLBACK_COLOR = '#6b5f53'; // --color-text-muted

// Aliases for label/kind strings produced by the various formats.
const KIND_ALIASES = {
  // gitnexus types (Project, Package, ...)
  project:   'module',
  package:   'module',
  method:    'function',
  community: 'concept',
  process:   'pipeline',
  route:     'endpoint',
  tool:      'service',
  interface: 'class',
  enum:      'schema',
  type:      'schema',
  // code-review-graph kinds
  test:      'function',
};

function resolveKind(raw) {
  if (raw == null) return null;
  const lower = String(raw).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NODE_COLORS, lower)) return lower;
  if (Object.prototype.hasOwnProperty.call(KIND_ALIASES, lower)) return KIND_ALIASES[lower];
  return null;
}

// Darken a hex color toward black by `pct` (0..1) for the node stroke.
function darkenHex(hex, pct = 0.40) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  r = Math.max(0, Math.round(r * (1 - pct)));
  g = Math.max(0, Math.round(g * (1 - pct)));
  b = Math.max(0, Math.round(b * (1 - pct)));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function loadVisNetwork() {
  if (window.vis?.Network) return Promise.resolve(window.vis);
  if (visLoader) return visLoader;
  visLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VIS_NETWORK_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.vis?.Network) resolve(window.vis);
      else reject(new Error('vis-network loaded but global `vis` not present'));
    };
    script.onerror = () => reject(new Error('Failed to load vis-network from CDN'));
    document.head.appendChild(script);
  });
  return visLoader;
}

// ---- format detection + normalization ----------------------------------

/** Detect format from the registry entry first; fall back to graph shape. */
function detectFormat(entry, graph) {
  const declared = entry?.format;
  if (declared === 'understand-anything@1') return 'understand-anything@1';
  if (declared === 'gitnexus@1') return 'gitnexus@1';
  if (declared === 'code-review-graph@1') return 'code-review-graph@1';
  if (declared === 'generic@1') return 'generic@1';

  // Shape heuristics
  if (graph && graph.graph && Array.isArray(graph.graph.nodes) && Array.isArray(graph.graph.links)) {
    return 'gitnexus@1';
  }
  if (graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)) {
    const sample = graph.nodes.find(Boolean);
    if (sample) {
      if (sample.kind && /^(File|Class|Function|Type|Test)$/i.test(sample.kind)) {
        return 'code-review-graph@1';
      }
      if (sample.kind && /^(file|function|class|module|concept)$/i.test(sample.kind)) {
        return 'understand-anything@1';
      }
    }
    return 'generic@1';
  }
  return 'generic@1';
}

function normalizeUnderstandAnything(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  const nodes = graph.nodes
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      label: n.label ?? String(n.id),
      title: [n.kind, n.path, n.summary].filter(Boolean).join('\n'),
      _kind: n.kind ?? null,
    }));
  const edges = graph.edges
    .filter((e) => e && e.from != null && e.to != null)
    .map((e) => ({
      from: String(e.from),
      to: String(e.to),
      label: e.kind,
    }));
  return { nodes, edges };
}

function normalizeGitNexus(graph) {
  const inner = graph?.graph;
  if (!inner || !Array.isArray(inner.nodes) || !Array.isArray(inner.links)) return null;
  const nodes = inner.nodes
    .filter((n) => n && n.id != null)
    .map((n) => {
      const kind = n.label ?? n.type ?? null; // gitnexus uses `label` for the type
      const display = n.properties?.name ?? n.name ?? String(n.id);
      return {
        id: String(n.id),
        label: display,
        title: [kind, n.properties?.path, n.properties?.summary].filter(Boolean).join('\n'),
        _kind: kind,
      };
    });
  const edges = inner.links
    .filter((e) => e && e.source != null && e.target != null)
    .map((e) => ({
      from: String(e.source),
      to: String(e.target),
      label: e.type ?? e.kind ?? e.label,
    }));
  return { nodes, edges };
}

function normalizeCodeReviewGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  const nodes = graph.nodes
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      label: n.name ?? n.qualified_name ?? String(n.id),
      title: [n.kind, n.qualified_name, n.file_path].filter(Boolean).join('\n'),
      _kind: n.kind ?? null,
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e) => {
      const fromRaw = e.from ?? e.source;
      const toRaw = e.to ?? e.target;
      return {
        from: String(fromRaw),
        to: String(toRaw),
        label: e.kind ?? e.type,
      };
    });
  // code-review-graph edges reference nodes by qualified_name; map back to id.
  const qmap = new Map();
  graph.nodes.forEach((n) => {
    if (!n) return;
    if (n.qualified_name) qmap.set(String(n.qualified_name), String(n.id));
  });
  for (const ed of edges) {
    if (qmap.has(ed.from)) ed.from = qmap.get(ed.from);
    if (qmap.has(ed.to)) ed.to = qmap.get(ed.to);
  }
  return { nodes, edges };
}

function normalizeGeneric(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  const nodes = graph.nodes
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      label: n.label ?? n.name ?? String(n.id),
      title: n.title ?? n.kind ?? n.type ?? '',
      _kind: n.kind ?? n.type ?? null,
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e) => ({
      from: String(e.from ?? e.source),
      to: String(e.to ?? e.target),
      label: e.kind ?? e.type ?? e.label,
    }));
  return { nodes, edges };
}

function normalize(format, graph) {
  switch (format) {
    case 'understand-anything@1': return normalizeUnderstandAnything(graph);
    case 'gitnexus@1':            return normalizeGitNexus(graph);
    case 'code-review-graph@1':   return normalizeCodeReviewGraph(graph);
    case 'generic@1':             return normalizeGeneric(graph);
    default:                      return normalizeGeneric(graph);
  }
}

// ---- public API ---------------------------------------------------------

/**
 * Render the graph for `entry` into `container`. Returns {legend} so the
 * app can show a per-color legend.
 */
export async function openGraph(entry, container) {
  currentContainer = container;

  if (currentNetwork) {
    try { currentNetwork.destroy(); } catch (_) { /* noop */ }
    currentNetwork = null;
  }
  container.replaceChildren();

  const [graph, vis] = await Promise.all([
    fetchGraph(entry.graph_url),
    loadVisNetwork(),
  ]);

  const format = detectFormat(entry, graph);
  const normalized = normalize(format, graph);
  if (!normalized || normalized.nodes.length === 0) {
    throw new Error(
      `Couldn't recognize the graph shape for format "${format}". ` +
      'Expected nodes/edges (or graph.nodes/graph.links for gitnexus@1).',
    );
  }

  const { vNodes, vEdges, legend } = decorate(normalized);
  renderNetwork(vis, container, { nodes: vNodes, edges: vEdges });
  return { legend };
}

export function clearGraph() {
  if (currentNetwork) {
    try { currentNetwork.destroy(); } catch (_) { /* noop */ }
    currentNetwork = null;
  }
  if (currentContainer) currentContainer.replaceChildren();
}

async function fetchGraph(url) {
  if (!url) throw new Error('Entry has no graph_url');
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`graph_url responded ${res.status}`);
  return res.json();
}

function decorate({ nodes, edges }) {
  const counts = new Map();
  const ordered = [];

  const vNodes = nodes.map((n) => {
    const resolved = resolveKind(n._kind);
    const fill = resolved ? NODE_COLORS[resolved] : FALLBACK_COLOR;
    const stroke = darkenHex(fill, 0.40);
    const labelKey = resolved ?? 'other';
    if (!counts.has(labelKey)) {
      counts.set(labelKey, 0);
      ordered.push({ label: labelKey, color: fill });
    }
    counts.set(labelKey, counts.get(labelKey) + 1);

    return {
      id: n.id,
      label: n.label,
      title: n.title || undefined,
      color: {
        background: fill,
        border: stroke,
        highlight: { background: fill, border: '#e8c49a' },
        hover: { background: fill, border: '#e8c49a' },
      },
      shape: 'dot',
      size: 12,
      borderWidth: 1.5,
      font: {
        color: '#f5f0eb',
        size: 12,
        face: "'Inter', sans-serif",
        strokeWidth: 0,
        vadjust: -2,
      },
    };
  });

  const vEdges = edges.map((e) => ({
    from: e.from,
    to: e.to,
    title: e.label || undefined,
    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    color: { color: 'rgba(107, 95, 83, 0.40)', highlight: '#d4a574', hover: '#d4a574' },
    width: 1,
    smooth: { enabled: !PREFERS_REDUCED, type: 'continuous' },
    font: { size: 10, color: '#a39787', strokeWidth: 0, background: 'rgba(20,20,20,0.85)' },
  }));

  const legend = ordered.map((item) => ({
    label: item.label,
    color: item.color,
    count: counts.get(item.label),
  })).sort((a, b) => b.count - a.count);

  return { vNodes, vEdges, legend };
}

function renderNetwork(vis, container, data) {
  const options = {
    autoResize: true,
    nodes: {
      shape: 'dot',
      size: 12,
      borderWidth: 1.5,
      font: { color: '#f5f0eb', size: 12, face: "'Inter', sans-serif" },
    },
    edges: {
      width: 1,
      smooth: { enabled: !PREFERS_REDUCED, type: 'continuous' },
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      color: { color: 'rgba(107, 95, 83, 0.40)', highlight: '#d4a574', hover: '#d4a574' },
    },
    physics: PREFERS_REDUCED ? { enabled: false } : {
      enabled: true,
      stabilization: { iterations: 250, fit: true },
      barnesHut: {
        gravitationalConstant: -8000,
        springLength: 140,
        springConstant: 0.04,
        damping: 0.30,
        avoidOverlap: 0.10,
      },
    },
    interaction: { hover: true, tooltipDelay: 200, navigationButtons: false, keyboard: false },
  };
  currentNetwork = new vis.Network(container, data, options);

  if (!PREFERS_REDUCED) {
    // Freeze physics 5s after stabilization to keep CPU low.
    currentNetwork.once('stabilizationIterationsDone', () => {
      setTimeout(() => {
        if (currentNetwork) currentNetwork.setOptions({ physics: { enabled: false } });
      }, 5000);
    });
  }
}

// ---- zoom controls (driven by app.js via custom events) ---------------

if (typeof window !== 'undefined') {
  window.addEventListener('uq-zoom', (ev) => {
    if (!currentNetwork) return;
    const dir = ev.detail?.dir;
    if (dir === 'fit') {
      currentNetwork.fit({ animation: !PREFERS_REDUCED });
      return;
    }
    const scale = currentNetwork.getScale();
    const factor = dir === 'in' ? 1.25 : 0.8;
    currentNetwork.moveTo({
      scale: scale * factor,
      animation: !PREFERS_REDUCED,
    });
  });
}
