// understand-quickly — graph viewer.
// Lazy-loads vis-network from a pinned CDN, fetches the entry's graph_url,
// normalizes node/edge shapes per format, and renders an in-pane
// force-directed graph using a node-type color palette.

const VIS_NETWORK_URL =
  'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';

let visLoader = null;
let currentNetwork = null;
let currentContainer = null;
let minimapTimer = null;

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
  // code-review-graph kinds — `test` visually shares the function color but
  // gets a star-prefix label below, so we still resolve it to function here.
  test:      'function',
};

// xyflow-inspired vis-network options.
const NODE_OPTIONS = {
  shape: 'box',
  borderWidth: 1.5,
  shapeProperties: { borderRadius: 8 },
  font: {
    color: '#f5f0eb',
    face: 'Inter, system-ui, sans-serif',
    size: 13,
    bold: { color: '#f5f0eb' },
    multi: false,
    vadjust: 0,
  },
  margin: { top: 8, right: 12, bottom: 8, left: 12 },
  widthConstraint: { minimum: 80, maximum: 200 },
  scaling: { min: 14, max: 28, label: { enabled: false } },
  shadow: { enabled: true, color: 'rgba(0,0,0,0.45)', size: 6, x: 0, y: 2 },
};

const EDGE_OPTIONS = {
  color: { color: 'rgba(212,165,116,0.35)', highlight: '#d4a574', hover: '#e8c49a' },
  width: 1,
  selectionWidth: 1.5,
  smooth: { enabled: true, type: 'continuous', roundness: 0.4 },
  arrows: {
    to: { enabled: true, scaleFactor: 0.5, type: 'arrow' },
  },
};

const PHYSICS_OPTIONS = {
  enabled: true,
  solver: 'forceAtlas2Based',
  forceAtlas2Based: {
    gravitationalConstant: -45,
    centralGravity: 0.012,
    springLength: 130,
    springConstant: 0.06,
    damping: 0.55,
    avoidOverlap: 0.85,
  },
  stabilization: { enabled: true, iterations: 250, fit: true },
  timestep: 0.4,
};

const NETWORK_OPTIONS = {
  autoResize: true,
  nodes: NODE_OPTIONS,
  edges: EDGE_OPTIONS,
  physics: PHYSICS_OPTIONS,
  interaction: {
    hover: true,
    tooltipDelay: 120,
    zoomSpeed: 0.7,
    multiselect: false,
    navigationButtons: true,
    keyboard: { enabled: true },
  },
  layout: { improvedLayout: false },
  configure: { enabled: false },
};

function resolveKind(raw) {
  if (raw == null) return null;
  const lower = String(raw).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NODE_COLORS, lower)) return lower;
  if (Object.prototype.hasOwnProperty.call(KIND_ALIASES, lower)) return KIND_ALIASES[lower];
  return null;
}

// Darken a hex color toward black by `pct` (0..1) for the node stroke.
function darkenHex(hex, pct = 0.25) {
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

function truncateLabel(text, max = 28) {
  if (!text) return '';
  const s = String(text);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

function loadVisNetwork() {
  if (window.vis && window.vis.Network) return Promise.resolve(window.vis);
  if (visLoader) return visLoader;
  visLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VIS_NETWORK_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.vis && window.vis.Network) resolve(window.vis);
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
  const declared = entry && entry.format;
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
      label: n.label != null ? n.label : String(n.id),
      title: [n.kind, n.path, n.summary].filter(Boolean).join('\n'),
      _kind: n.kind != null ? n.kind : null,
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
  const inner = graph && graph.graph;
  if (!inner || !Array.isArray(inner.nodes) || !Array.isArray(inner.links)) return null;
  const nodes = inner.nodes
    .filter((n) => n && n.id != null)
    .map((n) => {
      const kind = (n.label != null ? n.label : (n.type != null ? n.type : null));
      const props = n.properties || {};
      const display = (props.name != null ? props.name
                       : (n.name != null ? n.name : String(n.id)));
      return {
        id: String(n.id),
        label: display,
        title: [kind, props.path, props.summary].filter(Boolean).join('\n'),
        _kind: kind,
      };
    });
  const edges = inner.links
    .filter((e) => e && e.source != null && e.target != null)
    .map((e) => ({
      from: String(e.source),
      to: String(e.target),
      label: (e.type != null ? e.type : (e.kind != null ? e.kind : e.label)),
    }));
  return { nodes, edges };
}

function normalizeCodeReviewGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  const nodes = graph.nodes
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      label: (n.name != null ? n.name : (n.qualified_name != null ? n.qualified_name : String(n.id))),
      title: [n.kind, n.qualified_name, n.file_path].filter(Boolean).join('\n'),
      _kind: n.kind != null ? n.kind : null,
      _isTest: n.kind && /^test$/i.test(String(n.kind)),
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e) => {
      const fromRaw = (e.from != null ? e.from : e.source);
      const toRaw = (e.to != null ? e.to : e.target);
      return {
        from: String(fromRaw),
        to: String(toRaw),
        label: (e.kind != null ? e.kind : e.type),
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
      label: (n.label != null ? n.label : (n.name != null ? n.name : String(n.id))),
      title: (n.title != null ? n.title : (n.kind != null ? n.kind : (n.type != null ? n.type : ''))),
      _kind: (n.kind != null ? n.kind : (n.type != null ? n.type : null)),
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e) => ({
      from: String(e.from != null ? e.from : e.source),
      to: String(e.to != null ? e.to : e.target),
      label: (e.kind != null ? e.kind : (e.type != null ? e.type : e.label)),
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
  stopMinimap();
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

  const { vNodes, vEdges, legend } = decorate(normalized, format);
  renderNetwork(vis, container, { nodes: vNodes, edges: vEdges });
  startMinimap();
  return { legend };
}

export function clearGraph() {
  if (currentNetwork) {
    try { currentNetwork.destroy(); } catch (_) { /* noop */ }
    currentNetwork = null;
  }
  stopMinimap();
  if (currentContainer) currentContainer.replaceChildren();
}

async function fetchGraph(url) {
  if (!url) throw new Error('Entry has no graph_url');
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`graph_url responded ${res.status}`);
  return res.json();
}

function decorate({ nodes, edges }, format) {
  const counts = new Map();
  const ordered = [];

  const vNodes = nodes.map((n) => {
    const resolved = resolveKind(n._kind);
    const fill = resolved ? NODE_COLORS[resolved] : FALLBACK_COLOR;
    const stroke = darkenHex(fill, 0.25);
    const labelKey = resolved != null ? resolved : 'other';
    if (!counts.has(labelKey)) {
      counts.set(labelKey, 0);
      ordered.push({ label: labelKey, color: fill });
    }
    counts.set(labelKey, counts.get(labelKey) + 1);

    // Truncate long labels; keep full text in tooltip via title.
    const isTest = format === 'code-review-graph@1' && n._isTest;
    const baseLabel = truncateLabel(n.label, 28);
    const display = isTest ? `★ ${baseLabel}` : baseLabel;
    const tooltip = n.title || n.label || undefined;

    return {
      id: n.id,
      label: display,
      title: tooltip,
      color: {
        background: fill,
        border: stroke,
        highlight: { background: fill, border: '#e8c49a' },
        hover: { background: fill, border: '#e8c49a' },
      },
    };
  });

  const vEdges = edges.map((e) => ({
    from: e.from,
    to: e.to,
    title: e.label || undefined,
  }));

  const legend = ordered.map((item) => ({
    label: item.label,
    color: item.color,
    count: counts.get(item.label),
  })).sort((a, b) => b.count - a.count);

  return { vNodes, vEdges, legend };
}

function renderNetwork(vis, container, data) {
  // For prefers-reduced-motion: disable physics and lay nodes on a circle.
  if (PREFERS_REDUCED) {
    const N = data.nodes.length;
    const R = Math.max(180, 22 * N);
    data.nodes.forEach((node, i) => {
      const theta = (2 * Math.PI * i) / Math.max(1, N);
      node.x = R * Math.cos(theta);
      node.y = R * Math.sin(theta);
      node.physics = false;
    });
  }

  // Build options; clone the shared NETWORK_OPTIONS so we never mutate it.
  const options = JSON.parse(JSON.stringify(NETWORK_OPTIONS));
  if (PREFERS_REDUCED) {
    options.physics = { enabled: false };
    options.edges.smooth = { enabled: false };
  }

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

// ---- minimap ------------------------------------------------------------
// Lightweight canvas-based minimap that samples node positions every 500ms
// and draws them as small dots in the bottom-right corner of the graph pane.
// Coexists with vis-network's built-in navigationButtons (those sit on the
// bottom-left of the inner canvas; our minimap is positioned via CSS in the
// graph-host's bottom-right above the zoom-controls).

function getMinimapCanvas() {
  return document.getElementById('graph-minimap');
}

function startMinimap() {
  const canvas = getMinimapCanvas();
  if (!canvas) return;
  canvas.hidden = false;
  if (minimapTimer) {
    clearInterval(minimapTimer);
    minimapTimer = null;
  }
  const tick = () => drawMinimap(canvas);
  // Draw once immediately, then on an interval.
  tick();
  minimapTimer = setInterval(tick, 500);
}

function stopMinimap() {
  if (minimapTimer) {
    clearInterval(minimapTimer);
    minimapTimer = null;
  }
  const canvas = getMinimapCanvas();
  if (canvas) {
    canvas.hidden = true;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function drawMinimap(canvas) {
  if (!currentNetwork) return;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  // Match canvas internal pixel size to its CSS size.
  const cssW = canvas.clientWidth || 140;
  const cssH = canvas.clientHeight || 100;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Background frame
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.strokeStyle = 'rgba(212, 165, 116, 0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

  let positions;
  try {
    positions = currentNetwork.getPositions();
  } catch (_) {
    return;
  }
  const ids = Object.keys(positions);
  if (ids.length === 0) return;

  // Compute world bounds.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const p = positions[id];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const pad = 6;
  const scale = Math.min((cssW - pad * 2) / worldW, (cssH - pad * 2) / worldH);
  const offX = pad + ((cssW - pad * 2) - worldW * scale) / 2;
  const offY = pad + ((cssH - pad * 2) - worldH * scale) / 2;

  ctx.fillStyle = 'rgba(212, 165, 116, 0.75)';
  for (const id of ids) {
    const p = positions[id];
    const x = offX + (p.x - minX) * scale;
    const y = offY + (p.y - minY) * scale;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
}

// ---- zoom controls (driven by app.js via custom events) ---------------

if (typeof window !== 'undefined') {
  window.addEventListener('uq-zoom', (ev) => {
    if (!currentNetwork) return;
    const dir = ev && ev.detail ? ev.detail.dir : null;
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
