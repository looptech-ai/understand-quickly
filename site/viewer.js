// understand-quickly — graph viewer.
// Lazy-loads vis-network from a pinned CDN, fetches the entry's graph_url,
// normalizes node/edge shapes per format, and renders a force-directed graph.

const VIS_NETWORK_URL =
  'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';

let visLoader = null;
let currentNetwork = null;

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

function setStatus(content, { error = false } = {}) {
  const status = document.getElementById('viewer-status');
  status.replaceChildren();
  status.classList.toggle('error', !!error);
  if (content == null) {
    status.hidden = true;
    return;
  }
  status.hidden = false;
  if (typeof content === 'string') {
    status.appendChild(document.createTextNode(content));
  } else {
    status.appendChild(content);
  }
}

function spinnerNode(text) {
  const wrap = document.createDocumentFragment();
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.setAttribute('aria-hidden', 'true');
  const label = document.createElement('div');
  label.textContent = text;
  wrap.appendChild(spinner);
  wrap.appendChild(label);
  return wrap;
}

// ---- format normalization ----------------------------------------------

function normalizeUnderstandAnything(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return null;
  const nodes = graph.nodes
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      label: n.label ?? n.id,
      title: [n.kind, n.path, n.summary].filter(Boolean).join('\n'),
      group: n.kind,
    }));
  const edges = graph.edges
    .filter((e) => e && e.from != null && e.to != null)
    .map((e) => ({
      from: String(e.from),
      to: String(e.to),
      label: e.kind,
      arrows: 'to',
    }));
  return { nodes, edges };
}

function normalizeGitNexus(graph) {
  const inner = graph?.graph;
  if (!inner || !Array.isArray(inner.nodes) || !Array.isArray(inner.links)) return null;
  const nodes = inner.nodes
    .filter((n) => n && n.id != null)
    .map((n) => ({
      id: String(n.id),
      label: n.name ?? n.id,
      title: n.type ?? '',
      group: n.type,
    }));
  const edges = inner.links
    .filter((e) => e && e.source != null && e.target != null)
    .map((e) => ({
      from: String(e.source),
      to: String(e.target),
      label: e.type ?? e.kind,
      arrows: 'to',
    }));
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
      group: n.kind ?? n.type,
    }));
  const edges = graph.edges
    .filter((e) => e && (e.from != null || e.source != null) && (e.to != null || e.target != null))
    .map((e) => ({
      from: String(e.from ?? e.source),
      to: String(e.to ?? e.target),
      label: e.kind ?? e.type,
      arrows: 'to',
    }));
  return { nodes, edges };
}

function normalize(format, graph) {
  switch (format) {
    case 'understand-anything@1': return normalizeUnderstandAnything(graph);
    case 'gitnexus@1':            return normalizeGitNexus(graph);
    case 'generic@1':             return normalizeGeneric(graph);
    default:                      return normalizeGeneric(graph);
  }
}

// ---- public API ---------------------------------------------------------

export async function openViewer(entry) {
  const modal = document.getElementById('viewer');
  const title = document.getElementById('viewer-title');
  const meta = document.getElementById('viewer-meta');

  title.textContent = entry.id ?? 'Graph';
  meta.replaceChildren();
  if (entry.format) {
    meta.appendChild(document.createTextNode(`format: ${entry.format}`));
  }
  if (entry.graph_url) {
    if (meta.childNodes.length) meta.appendChild(document.createTextNode(' · '));
    const a = document.createElement('a');
    a.href = entry.graph_url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'raw graph';
    meta.appendChild(a);
  }

  modal.hidden = false;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('viewer-close').focus();

  const canvas = document.getElementById('graph-canvas');
  // Tear down any prior network before showing spinner
  if (currentNetwork) {
    try { currentNetwork.destroy(); } catch (_) { /* noop */ }
    currentNetwork = null;
  }
  canvas.replaceChildren();
  setStatus(spinnerNode('Loading graph…'));

  try {
    const [graph, vis] = await Promise.all([
      fetchGraph(entry.graph_url),
      loadVisNetwork(),
    ]);
    const normalized = normalize(entry.format, graph);
    if (!normalized || normalized.nodes.length === 0) {
      setStatus(
        `Couldn't recognize the graph shape for format "${entry.format ?? 'unknown'}". ` +
        'Expected nodes/edges (or graph.nodes/graph.links for gitnexus@1).',
        { error: true },
      );
      return;
    }
    setStatus(null);
    renderNetwork(vis, canvas, normalized);
  } catch (err) {
    console.error(err);
    setStatus(`Couldn't load graph: ${err.message}`, { error: true });
  }
}

export function closeViewer() {
  const modal = document.getElementById('viewer');
  if (modal.hidden) return;
  modal.classList.remove('open');
  modal.hidden = true;
  document.body.style.overflow = '';
  if (currentNetwork) {
    try { currentNetwork.destroy(); } catch (_) { /* noop */ }
    currentNetwork = null;
  }
  setStatus(null);
}

async function fetchGraph(url) {
  if (!url) throw new Error('Entry has no graph_url');
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`graph_url responded ${res.status}`);
  return res.json();
}

function renderNetwork(vis, container, data) {
  const options = {
    autoResize: true,
    nodes: {
      shape: 'dot',
      size: 12,
      font: { size: 12, face: 'system-ui' },
      borderWidth: 1,
    },
    edges: {
      width: 1,
      smooth: { type: 'continuous' },
      font: { size: 10, align: 'middle' },
      color: { color: '#9ca3af', highlight: '#0969da' },
    },
    physics: {
      stabilization: { iterations: 200 },
      barnesHut: { gravitationalConstant: -8000, springLength: 120 },
    },
    interaction: { hover: true, tooltipDelay: 200 },
  };
  currentNetwork = new vis.Network(container, data, options);
}
