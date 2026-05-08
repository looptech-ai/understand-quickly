// understand-quickly — graph viewer.
// Lazy-loads vis-network from a vendored bundle, fetches the entry's
// graph_url, normalizes node/edge shapes per format, and renders an in-pane
// graph using a node-type color palette.
//
// State: a `Viewer` instance encapsulates one vis-network instance + its
// data sets, hidden-node tracking, hover-focus state, and layout choice.

const VIS_NETWORK_URL = './vendor/vis-network@9.1.9/vis-network.min.js';

let visLoader = null;
let primaryViewer = null; // Viewer | null
let minimapTimer = null;

const PREFERS_REDUCED = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- node-type colour palette ----------------------------------------
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
const FALLBACK_COLOR = '#6b5f53';

const KIND_ALIASES = {
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
  test:      'function',
};

const MOBILE_GRAPH_BP = '(max-width: 799.98px)';
const NODE_MAX_WIDTH_DESKTOP = 200;
const NODE_MAX_WIDTH_MOBILE = 160;

function nodeMaxWidth() {
  if (typeof window === 'undefined' || !window.matchMedia) return NODE_MAX_WIDTH_DESKTOP;
  return window.matchMedia(MOBILE_GRAPH_BP).matches
    ? NODE_MAX_WIDTH_MOBILE
    : NODE_MAX_WIDTH_DESKTOP;
}

function buildNodeOptions() {
  return {
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
    widthConstraint: { minimum: 80, maximum: nodeMaxWidth() },
    scaling: { min: 14, max: 28, label: { enabled: false } },
    shadow: { enabled: true, color: 'rgba(0,0,0,0.45)', size: 6, x: 0, y: 2 },
  };
}

function buildEdgeOptions() {
  return {
    color: { color: 'rgba(212,165,116,0.35)', highlight: '#d4a574', hover: '#e8c49a' },
    width: 1,
    selectionWidth: 1.5,
    smooth: { enabled: true, type: 'continuous', roundness: 0.4 },
    arrows: { to: { enabled: true, scaleFactor: 0.5, type: 'arrow' } },
  };
}

const PHYSICS_FORCE = {
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

function buildNetworkOptions(layout) {
  const options = {
    autoResize: true,
    nodes: buildNodeOptions(),
    edges: buildEdgeOptions(),
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
    physics: { ...PHYSICS_FORCE },
  };
  if (PREFERS_REDUCED) {
    options.physics = { enabled: false };
    options.edges.smooth = { enabled: false };
  }
  if (layout === 'hierarchy') {
    options.layout = {
      improvedLayout: false,
      hierarchical: {
        enabled: true,
        direction: 'UD',
        sortMethod: 'directed',
        nodeSpacing: 150,
        levelSeparation: 120,
      },
    };
    options.physics = { enabled: false };
  } else if (layout === 'tree') {
    options.layout = {
      improvedLayout: false,
      hierarchical: {
        enabled: true,
        direction: 'LR',
        sortMethod: 'hubsize',
        nodeSpacing: 130,
        levelSeparation: 150,
      },
    };
    options.physics = { enabled: false };
  } else if (layout === 'circle') {
    options.physics = { enabled: false };
  }
  return options;
}

function resolveKind(raw) {
  if (raw == null) return null;
  const lower = String(raw).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NODE_COLORS, lower)) return lower;
  if (Object.prototype.hasOwnProperty.call(KIND_ALIASES, lower)) return KIND_ALIASES[lower];
  return null;
}

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

// Hash community id -> hue 0..359 for gitnexus@1 community ring tint.
function hashHue(value) {
  const s = String(value);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
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

function detectFormat(entry, graph) {
  const declared = entry && entry.format;
  if (declared === 'understand-anything@1') return 'understand-anything@1';
  if (declared === 'gitnexus@1') return 'gitnexus@1';
  if (declared === 'code-review-graph@1') return 'code-review-graph@1';
  if (declared === 'generic@1') return 'generic@1';

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
      _raw: n,
    }));
  const edges = graph.edges
    .filter((e) => e && e.from != null && e.to != null)
    .map((e, i) => ({
      id: `e${i}`,
      from: String(e.from),
      to: String(e.to),
      label: e.kind,
      _raw: e,
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
        _raw: n,
      };
    });
  const edges = inner.links
    .filter((e) => e && e.source != null && e.target != null)
    .map((e, i) => ({
      id: `e${i}`,
      from: String(e.source),
      to: String(e.target),
      label: (e.type != null ? e.type : (e.kind != null ? e.kind : e.label)),
      _raw: e,
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
      _raw: n,
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e, i) => {
      const fromRaw = (e.from != null ? e.from : e.source);
      const toRaw = (e.to != null ? e.to : e.target);
      return {
        id: `e${i}`,
        from: String(fromRaw),
        to: String(toRaw),
        label: (e.kind != null ? e.kind : e.type),
        _raw: e,
      };
    });
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
      _raw: n,
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e, i) => ({
      id: `e${i}`,
      from: String(e.from != null ? e.from : e.source),
      to: String(e.to != null ? e.to : e.target),
      label: (e.kind != null ? e.kind : (e.type != null ? e.type : e.label)),
      _raw: e,
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

// ---- guided-tour step extraction ----------------------------------------

const TOUR_STEP_CAP = 25;
const CRG_KIND_ORDER = ['file', 'class', 'function', 'test', 'type'];

function sampleEvenly(arr, max) {
  if (arr.length <= max) return arr.slice();
  const out = [];
  const stride = arr.length / max;
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.floor(i * stride)]);
  }
  return out;
}

function buildTourSteps(format, rawGraph, normalized) {
  if (!normalized || !Array.isArray(normalized.nodes)) return [];

  const normById = new Map();
  for (const n of normalized.nodes) normById.set(String(n.id), n);

  let steps = [];

  if (format === 'understand-anything@1') {
    const src = Array.isArray(rawGraph?.nodes) ? rawGraph.nodes : [];
    steps = src.filter((n) => n && n.id != null).map((n) => {
      const id = String(n.id);
      const norm = normById.get(id);
      return {
        id,
        label: n.label != null ? String(n.label) : id,
        kind: resolveKind(n.kind) || (norm ? resolveKind(norm._kind) : null),
        text: n.summary || n.label || id,
      };
    });
  } else if (format === 'gitnexus@1') {
    const inner = rawGraph && rawGraph.graph;
    const src = inner && Array.isArray(inner.nodes) ? inner.nodes : [];
    steps = src.filter((n) => n && n.id != null).map((n) => {
      const id = String(n.id);
      const props = n.properties || {};
      const kindRaw = n.label != null ? n.label : n.type;
      const display = props.name != null ? props.name
                      : (n.name != null ? n.name : id);
      const text = props.description || props.name || (n.label != null ? String(n.label) : id);
      return {
        id,
        label: String(display),
        kind: resolveKind(kindRaw),
        text: String(text),
      };
    });
  } else if (format === 'code-review-graph@1') {
    const src = Array.isArray(rawGraph?.nodes) ? rawGraph.nodes : [];
    const raw = src.filter((n) => n && n.id != null).map((n) => {
      const id = String(n.id);
      const display = n.name != null ? String(n.name)
                      : (n.qualified_name != null ? String(n.qualified_name) : id);
      const kindLower = n.kind != null ? String(n.kind).toLowerCase() : '';
      const fallbackText = `${n.kind || ''} ${n.qualified_name || n.name || id}`.trim();
      return {
        id,
        label: display,
        kind: resolveKind(n.kind),
        text: n.summary ? String(n.summary) : fallbackText,
        _sortKind: kindLower,
        _sortLabel: display.toLowerCase(),
      };
    });
    raw.sort((a, b) => {
      const ai = CRG_KIND_ORDER.indexOf(a._sortKind);
      const bi = CRG_KIND_ORDER.indexOf(b._sortKind);
      const aRank = ai === -1 ? CRG_KIND_ORDER.length : ai;
      const bRank = bi === -1 ? CRG_KIND_ORDER.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a._sortLabel.localeCompare(b._sortLabel);
    });
    steps = raw.map(({ _sortKind, _sortLabel, ...rest }) => rest);
  } else {
    const src = Array.isArray(rawGraph?.nodes) ? rawGraph.nodes : [];
    steps = src.filter((n) => n && n.id != null).map((n) => {
      const id = String(n.id);
      const label = n.label != null ? String(n.label)
                    : (n.name != null ? String(n.name) : id);
      const kindRaw = n.kind != null ? n.kind : n.type;
      return {
        id,
        label,
        kind: resolveKind(kindRaw),
        text: label,
      };
    });
  }

  steps = steps.filter((s) => normById.has(s.id));

  if (steps.length > TOUR_STEP_CAP) {
    steps = sampleEvenly(steps, TOUR_STEP_CAP);
  }
  return steps;
}

// ---- Viewer class ------------------------------------------------------

class Viewer {
  constructor(container) {
    this.container = container;
    this.network = null;
    this.nodesDS = null;
    this.edgesDS = null;
    this.allNodes = []; // decorated objects (one-time built)
    this.allEdges = [];
    this.normalized = null;
    this.format = null;
    this.entry = null;
    this.layout = 'force';
    this.hidden = new Set(); // node ids the user has hidden
    this.kindHidden = new Set(); // legend-toggled-off kinds
    this.degreeMap = new Map();
    this.maxDegree = 0;
    this._hoverFocusId = null;
    this._hoverFrame = 0;
    this._kindByNode = new Map();
    this._origColors = new Map();
    this._communityHueByNode = new Map();
  }

  destroy() {
    if (this.network) {
      try { this.network.destroy(); } catch (_) { /* noop */ }
      this.network = null;
    }
    if (this.container) this.container.replaceChildren();
  }

  // Apply a vis-network setOptions for new layout, mutate this.layout
  setLayout(layout) {
    if (!this.network) return;
    this.layout = layout;
    if (layout === 'circle') {
      const ids = this.allNodes.map((n) => n.id).filter((id) => !this.hidden.has(id));
      const N = Math.max(1, ids.length);
      const R = Math.max(180, 22 * N);
      const positions = {};
      ids.forEach((id, i) => {
        const theta = (2 * Math.PI * i) / N;
        positions[id] = { x: R * Math.cos(theta), y: R * Math.sin(theta) };
      });
      // Clear hierarchical first
      try {
        this.network.setOptions({
          layout: { improvedLayout: false, hierarchical: { enabled: false } },
          physics: { enabled: false },
        });
      } catch (_) { /* noop */ }
      // Move nodes
      for (const id of ids) {
        try { this.network.moveNode(id, positions[id].x, positions[id].y); } catch (_) { /* noop */ }
      }
      try { this.network.fit({ animation: !PREFERS_REDUCED }); } catch (_) { /* noop */ }
      return;
    }
    const opts = buildNetworkOptions(layout);
    // Only push the layout/physics changes on layout switch.
    try {
      this.network.setOptions({
        layout: opts.layout,
        physics: opts.physics,
        edges: { smooth: opts.edges.smooth },
      });
      this.network.fit({ animation: !PREFERS_REDUCED });
    } catch (_) { /* noop */ }
  }

  // Compute degree map from current edges.
  _computeDegrees() {
    this.degreeMap.clear();
    this.maxDegree = 0;
    for (const e of this.allEdges) {
      this.degreeMap.set(e.from, (this.degreeMap.get(e.from) || 0) + 1);
      this.degreeMap.set(e.to, (this.degreeMap.get(e.to) || 0) + 1);
    }
    for (const v of this.degreeMap.values()) {
      if (v > this.maxDegree) this.maxDegree = v;
    }
  }

  _buildAdjacency() {
    const adj = new Map();
    for (const n of this.allNodes) adj.set(n.id, new Set());
    for (const e of this.allEdges) {
      if (adj.has(e.from)) adj.get(e.from).add(e.to);
      if (adj.has(e.to)) adj.get(e.to).add(e.from);
    }
    return adj;
  }

  // Apply the current visibility predicate (hidden, kindHidden) to all
  // nodes and edges in one batched update.
  applyVisibility() {
    if (!this.nodesDS || !this.edgesDS) return;
    const visible = new Set();
    const updates = [];
    for (const n of this.allNodes) {
      const id = n.id;
      let hidden = false;
      if (this.hidden.has(id)) hidden = true;
      const kind = this._kindByNode.get(id);
      if (!hidden && kind && this.kindHidden.has(kind)) hidden = true;
      if (!hidden) visible.add(id);
      updates.push({ id, hidden });
    }
    this.nodesDS.update(updates);
    const edgeUpdates = [];
    for (const e of this.allEdges) {
      const hidden = !visible.has(e.from) || !visible.has(e.to);
      edgeUpdates.push({ id: e.id, hidden });
    }
    this.edgesDS.update(edgeUpdates);
  }

  // Hover focus: full opacity for hovered node + 1-hop, dim everything else.
  hoverFocus(id) {
    if (this._hoverFocusId === id) return;
    this._hoverFocusId = id;
    if (this._hoverFrame) cancelAnimationFrame(this._hoverFrame);
    this._hoverFrame = requestAnimationFrame(() => this._applyHoverFocus());
  }

  hoverBlur() {
    if (this._hoverFocusId === null) return;
    this._hoverFocusId = null;
    if (this._hoverFrame) cancelAnimationFrame(this._hoverFrame);
    this._hoverFrame = requestAnimationFrame(() => this._applyHoverFocus());
  }

  _applyHoverFocus() {
    if (!this.nodesDS || !this.edgesDS) return;
    const id = this._hoverFocusId;
    if (id == null) {
      // Restore original colors.
      const updates = [];
      for (const n of this.allNodes) {
        const orig = this._origColors.get(n.id);
        if (!orig) continue;
        updates.push({ id: n.id, color: orig.color, opacity: 1 });
      }
      this.nodesDS.update(updates);
      const edgeUpdates = [];
      for (const e of this.allEdges) {
        edgeUpdates.push({ id: e.id, color: { opacity: 1 } });
      }
      this.edgesDS.update(edgeUpdates);
      return;
    }
    const adj = this._adj || (this._adj = this._buildAdjacency());
    const focus = new Set([id]);
    const nbrs = adj.get(id);
    if (nbrs) for (const n of nbrs) focus.add(n);
    const updates = [];
    for (const n of this.allNodes) {
      const orig = this._origColors.get(n.id);
      if (!orig) continue;
      const isFocus = focus.has(n.id);
      updates.push({
        id: n.id,
        color: orig.color,
        opacity: isFocus ? 1 : 0.15,
      });
    }
    this.nodesDS.update(updates);
    const edgeUpdates = [];
    for (const e of this.allEdges) {
      const isFocus = focus.has(e.from) && focus.has(e.to);
      edgeUpdates.push({ id: e.id, color: { opacity: isFocus ? 1 : 0.15 } });
    }
    this.edgesDS.update(edgeUpdates);
  }

  // Toggle visibility for a kind. Returns the new hidden set state.
  toggleKind(kind, hide) {
    if (hide == null) hide = !this.kindHidden.has(kind);
    if (hide) this.kindHidden.add(kind); else this.kindHidden.delete(kind);
    this.applyVisibility();
    return hide;
  }

  resetKindFilters() {
    this.kindHidden.clear();
    this.applyVisibility();
  }

  // Hide a single node id; mark "Restore hidden" CTA.
  hideNode(id) {
    this.hidden.add(id);
    this.applyVisibility();
  }

  restoreHidden() {
    this.hidden.clear();
    this.applyVisibility();
  }

  // Search. Returns array of matched node ids.
  search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const matches = [];
    for (const n of this.allNodes) {
      const idLower = String(n.id).toLowerCase();
      const labelLower = String(n.label || '').toLowerCase();
      const titleLower = String(n.title || '').toLowerCase();
      if (idLower.includes(q) || labelLower.includes(q) || titleLower.includes(q)) {
        matches.push(n.id);
      }
    }
    return matches;
  }

  // Apply pulse effect to a set of node ids by temporarily setting a
  // bright accent color. Restores after duration.
  pulse(ids) {
    if (!this.nodesDS || PREFERS_REDUCED) return;
    const accent = '#e8c49a';
    const updates = ids.map((id) => ({ id, color: { background: accent, border: '#fff' } }));
    this.nodesDS.update(updates);
    setTimeout(() => {
      const restore = ids.map((id) => {
        const orig = this._origColors.get(id);
        return { id, color: orig ? orig.color : undefined };
      });
      this.nodesDS.update(restore);
    }, 600);
  }

  // Drive view to fit a set of nodes
  focusNodes(ids) {
    if (!this.network || !ids || !ids.length) return;
    try {
      this.network.fit({
        nodes: ids,
        animation: PREFERS_REDUCED ? false : { duration: 400, easingFunction: 'easeInOutQuad' },
      });
    } catch (_) { /* noop */ }
  }
}

// ---- decoration: build vNodes/vEdges + legend + format flair ---------

function decorate(normalized, format, viewer) {
  const counts = new Map();
  const ordered = [];
  const isCRG = format === 'code-review-graph@1';
  const isGitnexus = format === 'gitnexus@1';

  const vNodes = normalized.nodes.map((n) => {
    const resolved = resolveKind(n._kind);
    const fill = resolved ? NODE_COLORS[resolved] : FALLBACK_COLOR;
    const stroke = darkenHex(fill, 0.25);
    const labelKey = resolved != null ? resolved : 'other';
    if (!counts.has(labelKey)) {
      counts.set(labelKey, 0);
      ordered.push({ label: labelKey, color: fill, kind: resolved });
    }
    counts.set(labelKey, counts.get(labelKey) + 1);

    const isTest = isCRG && n._isTest;
    const baseLabel = truncateLabel(n.label, 28);
    const display = isTest ? `★ ${baseLabel}` : baseLabel;
    const tooltip = n.title || n.label || undefined;

    // gitnexus@1 community ring
    let borderColor = stroke;
    let borderWidth = 1.5;
    if (isGitnexus) {
      const props = n._raw && n._raw.properties ? n._raw.properties : {};
      const comm = props.community_id != null ? props.community_id
                   : (props.community != null ? props.community
                   : (props.cluster_id != null ? props.cluster_id : null));
      if (comm != null) {
        const hue = hashHue(comm);
        borderColor = `hsl(${hue}, 60%, 55%)`;
        borderWidth = 3;
        viewer._communityHueByNode.set(String(n.id), { id: comm, hue });
      }
    }

    const colorObj = {
      background: fill,
      border: borderColor,
      highlight: { background: fill, border: '#e8c49a' },
      hover: { background: fill, border: '#e8c49a' },
    };

    const node = {
      id: n.id,
      label: display,
      title: tooltip,
      color: colorObj,
      borderWidth,
    };

    if (viewer) {
      viewer._kindByNode.set(n.id, resolved || null);
      viewer._origColors.set(n.id, { color: { ...colorObj } });
    }

    return node;
  });

  const vEdges = normalized.edges.map((e) => {
    const edge = {
      id: e.id,
      from: e.from,
      to: e.to,
      title: e.label || undefined,
    };
    // code-review-graph@1: edge style by confidence_tier
    if (format === 'code-review-graph@1' && e._raw) {
      const tier = e._raw.confidence_tier
                || (e._raw.metadata && e._raw.metadata.confidence_tier);
      if (tier === 'INFERRED') {
        edge.dashes = [6, 4];
      } else if (tier === 'AMBIGUOUS') {
        edge.dashes = [2, 4];
      } else if (tier === 'EXTRACTED') {
        edge.dashes = false;
      }
    }
    return edge;
  });

  // Communities chip set for legend (gitnexus@1)
  const communities = new Map();
  if (isGitnexus && viewer) {
    for (const [, info] of viewer._communityHueByNode) {
      const key = `community:${info.id}`;
      if (!communities.has(key)) {
        communities.set(key, { count: 0, hue: info.hue, id: info.id });
      }
      communities.get(key).count += 1;
    }
  }

  const legend = ordered.map((item) => ({
    label: item.label,
    color: item.color,
    kind: item.kind,
    count: counts.get(item.label),
  })).sort((a, b) => b.count - a.count);

  const communityLegend = [...communities.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8) // cap to 8 community chips so legend doesn't explode
    .map((c) => ({
      label: `community ${c.id}`,
      color: `hsl(${c.hue}, 60%, 55%)`,
      kind: null,
      community: c.id,
      count: c.count,
    }));

  return { vNodes, vEdges, legend: legend.concat(communityLegend) };
}

// ---- public API --------------------------------------------------------

export async function prepareGraph(entry) {
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
  const steps = buildTourSteps(format, graph, normalized);
  return { vis, graph, format, normalized, steps, entry };
}

export function commitGraph(prepared, container, options = {}) {
  const { primary = true, layout: layoutOverride = null } = options;
  // Tear down any existing primary if we're committing primary.
  if (primary && primaryViewer) {
    primaryViewer.destroy();
    primaryViewer = null;
    stopMinimap();
  }

  const viewer = new Viewer(container);
  viewer.entry = prepared.entry;
  viewer.format = prepared.format;
  viewer.normalized = prepared.normalized;
  // Decorate
  const { vNodes, vEdges, legend } = decorate(prepared.normalized, prepared.format, viewer);
  viewer.allNodes = vNodes;
  viewer.allEdges = vEdges;
  viewer._computeDegrees();

  // Determine layout: stored per entry, override, or default
  let layout = layoutOverride;
  if (!layout && prepared.entry && prepared.entry.id && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(`uq:layout:${prepared.entry.id}`);
      if (stored && ['force', 'hierarchy', 'circle', 'tree'].includes(stored)) layout = stored;
    } catch (_) { /* noop */ }
  }
  if (!layout) layout = 'force';
  viewer.layout = layout;

  container.replaceChildren();

  // For circle/reduced-motion: pre-position nodes so vis-network never
  // physics-sims them.
  let circleAssigned = false;
  if (PREFERS_REDUCED || layout === 'circle') {
    const N = viewer.allNodes.length;
    const R = Math.max(180, 22 * N);
    viewer.allNodes.forEach((node, i) => {
      const theta = (2 * Math.PI * i) / Math.max(1, N);
      node.x = R * Math.cos(theta);
      node.y = R * Math.sin(theta);
      node.physics = false;
    });
    circleAssigned = true;
  }

  const DataSet = prepared.vis.DataSet || prepared.vis.data?.DataSet;
  viewer.nodesDS = new DataSet(viewer.allNodes);
  viewer.edgesDS = new DataSet(viewer.allEdges);

  const opts = buildNetworkOptions(circleAssigned ? 'circle' : layout);
  if (circleAssigned) {
    opts.physics = { enabled: false };
    opts.edges.smooth = { enabled: false };
  }

  viewer.network = new prepared.vis.Network(container, {
    nodes: viewer.nodesDS,
    edges: viewer.edgesDS,
  }, opts);

  // Wire hover focus
  viewer.network.on('hoverNode', (params) => {
    if (params && params.node != null) viewer.hoverFocus(params.node);
  });
  viewer.network.on('blurNode', () => viewer.hoverBlur());

  if (!PREFERS_REDUCED && layout === 'force') {
    viewer.network.once('stabilizationIterationsDone', () => {
      setTimeout(() => {
        if (viewer.network) {
          try { viewer.network.setOptions({ physics: { enabled: false } }); } catch (_) { /* noop */ }
        }
      }, 5000);
    });
  }

  if (primary) {
    primaryViewer = viewer;
    startMinimap(viewer);
  }

  return {
    viewer,
    legend,
    steps: prepared.steps,
    network: viewer.network,
  };
}

export function getCurrentNetwork() {
  return primaryViewer ? primaryViewer.network : null;
}

export function getPrimaryViewer() {
  return primaryViewer;
}

export function clearGraph() {
  if (primaryViewer) {
    primaryViewer.destroy();
    primaryViewer = null;
  }
  stopMinimap();
}

async function fetchGraph(url) {
  if (!url) throw new Error('Entry has no graph_url');
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`graph_url responded ${res.status}`);
  return res.json();
}

// ---- minimap (operates on primaryViewer) -------------------------------

function getMinimapCanvas() {
  return document.getElementById('graph-minimap');
}

function startMinimap(viewer) {
  const canvas = getMinimapCanvas();
  if (!canvas || !viewer) return;
  canvas.hidden = false;
  if (minimapTimer) {
    clearInterval(minimapTimer);
    minimapTimer = null;
  }
  const tick = () => drawMinimap(canvas, viewer);
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

function drawMinimap(canvas, viewer) {
  if (!viewer || !viewer.network) return;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  const cssW = canvas.clientWidth || 140;
  const cssH = canvas.clientHeight || 100;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.strokeStyle = 'rgba(212, 165, 116, 0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

  let positions;
  try {
    positions = viewer.network.getPositions();
  } catch (_) {
    return;
  }
  const ids = Object.keys(positions);
  if (ids.length === 0) return;

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

// ---- viewport-derived widthConstraint refresh -------------------------

let mobileGraphMql = null;
let mobileGraphMqlListener = null;

function attachMobileGraphMql() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  if (mobileGraphMql && mobileGraphMqlListener) return;
  mobileGraphMql = window.matchMedia(MOBILE_GRAPH_BP);
  mobileGraphMqlListener = () => {
    if (!primaryViewer || !primaryViewer.network) return;
    try {
      primaryViewer.network.setOptions({
        nodes: { widthConstraint: { minimum: 80, maximum: nodeMaxWidth() } },
      });
    } catch (_) { /* noop */ }
  };
  if (mobileGraphMql.addEventListener) {
    mobileGraphMql.addEventListener('change', mobileGraphMqlListener);
  } else if (mobileGraphMql.addListener) {
    mobileGraphMql.addListener(mobileGraphMqlListener);
  }
}

function detachMobileGraphMql() {
  if (!mobileGraphMql || !mobileGraphMqlListener) return;
  if (mobileGraphMql.removeEventListener) {
    mobileGraphMql.removeEventListener('change', mobileGraphMqlListener);
  } else if (mobileGraphMql.removeListener) {
    mobileGraphMql.removeListener(mobileGraphMqlListener);
  }
  mobileGraphMql = null;
  mobileGraphMqlListener = null;
}

attachMobileGraphMql();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', detachMobileGraphMql);
}

// ---- zoom controls (driven by app.js via custom events) ---------------

if (typeof window !== 'undefined') {
  window.addEventListener('uq-zoom', (ev) => {
    const v = primaryViewer;
    if (!v || !v.network) return;
    const dir = ev && ev.detail ? ev.detail.dir : null;
    if (dir === 'fit') {
      v.network.fit({ animation: !PREFERS_REDUCED });
      return;
    }
    const scale = v.network.getScale();
    const factor = dir === 'in' ? 1.25 : 0.8;
    v.network.moveTo({
      scale: scale * factor,
      animation: !PREFERS_REDUCED,
    });
  });
}
