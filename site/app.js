// understand-quickly — registry browser.
// Loads ./registry.json, renders the sidebar list of entries, and drives the
// graph viewer + detail pane on selection. All user-supplied values are
// rendered via textContent / createElement / attribute setters — never
// innerHTML with untrusted data.

import {
  prepareGraph,
  commitGraph,
  clearGraph,
  getCurrentNetwork,
  getPrimaryViewer,
  reorderTourStepsForPersona,
} from './viewer.js?v=20260507f';

const PAGE_VERSION = '20260507f';
const MOBILE_BREAKPOINT = 800;

function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}
const DIAG_ENABLED = (typeof window !== 'undefined')
  && /[?&]diag=1\b/.test(window.location.search || '');

const PREFERS_REDUCED = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lastRegistryStatus = 'not-loaded';
let lastFirstEntryId = null;

const STATUS_META = {
  ok:               { emoji: '✅', label: 'ok' },
  pending:          { emoji: '\u{1F195}', label: 'pending' },
  missing:          { emoji: '\u{1F7E1}', label: 'missing' },
  invalid:          { emoji: '⚠️', label: 'invalid' },
  oversize:         { emoji: '\u{1F4E6}', label: 'oversize' },
  transient_error:  { emoji: '\u{1F501}', label: 'transient' },
  dead:             { emoji: '\u{1F480}', label: 'dead' },
  renamed:          { emoji: '↪️', label: 'renamed' },
};

const DEFAULT_STATUSES = new Set(['ok', 'pending']);

const state = {
  entries: [],
  filtered: [],
  q: '',
  format: '',
  statuses: new Set(DEFAULT_STATUSES),
  selectedId: null,
  // Graph-aware search (when graph loaded): matched node ids + cursor.
  graphSearchMatches: [],
  graphSearchIdx: 0,
  // Last legend rendered (for keyboard-shortcut chip toggling).
  legend: [],
  // Compare cart of entry ids (max 2).
  compareCart: [],
  compareMode: false,
  compareSecondary: null, // { viewer, steps } for canvas B
  // Layout for the currently-loaded entry.
  layout: 'force',
  // Current tour persona ('default' | 'architect' | 'junior' | 'pm')
  tourPersona: 'default',
  // Tour state
  tourSteps: [],
  // Path-finder state: { phase: 'idle'|'awaiting'|'shown', src, dst, path }
  pathFinder: { phase: 'idle', src: null, dst: null, path: null },
  // gg jump
  ggPending: false,
  // Suppress URL replace until first selection happens
  suppressUrlSync: false,
};

// ---------- utilities ----------

function relativeTime(iso) {
  if (!iso) return 'never synced';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown';
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  const sign = diff >= 0 ? 'ago' : 'from now';

  let value, unit;
  if (abs < minute) return 'just now';
  if (abs < hour)        { value = Math.round(abs / minute); unit = 'min'; }
  else if (abs < day)    { value = Math.round(abs / hour);   unit = 'hr'; }
  else if (abs < week)   { value = Math.round(abs / day);    unit = 'day'; }
  else if (abs < month)  { value = Math.round(abs / week);   unit = 'wk'; }
  else if (abs < year)   { value = Math.round(abs / month);  unit = 'mo'; }
  else                   { value = Math.round(abs / year);   unit = 'yr'; }
  return `${value} ${unit}${value === 1 ? '' : 's'} ${sign}`;
}

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.props) for (const [k, v] of Object.entries(opts.props)) node[k] = v;
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
}

function showError(msg) {
  const banner = document.getElementById('error');
  banner.textContent = msg;
  banner.hidden = false;
}

// ---------- data ----------

async function loadRegistry() {
  try {
    const res = await fetch('./registry.json', { cache: 'no-cache' });
    lastRegistryStatus = `HTTP ${res.status}`;
    if (!res.ok) throw new Error(`registry.json responded ${res.status}`);
    const data = await res.json();
    state.entries = Array.isArray(data?.entries) ? data.entries : [];
    lastFirstEntryId = state.entries[0]?.id ?? null;
    if (data?.generated_at) {
      const gen = document.getElementById('generated-at');
      if (gen) gen.textContent = relativeTime(data.generated_at);
    }
    populateFormatFilter();
    populateStatusFilter();
    applyFilters();
    renderEmptyMainStateIfNeeded();
    // After registry has loaded, attempt to apply deeplink params.
    applyDeeplinkOnLoad();
  } catch (err) {
    console.error(err);
    lastRegistryStatus = `error: ${err && err.message ? err.message : String(err)}`;
    const friendly = "Couldn't load registry.json — check network or try again.";
    showError(friendly);
    state.entries = [];
    populateFormatFilter();
    populateStatusFilter();
    applyFilters();
    renderEmptyMainStateIfNeeded(friendly);
  } finally {
    updateDiagPanel();
  }
}

function renderEmptyMainStateIfNeeded(msg) {
  const empty = document.getElementById('graph-empty');
  if (!empty) return;
  const prior = empty.querySelector('.fallback-notice');
  if (prior) prior.remove();
  refreshEmptyStateCta();
  if (state.entries.length > 0) return;
  const note = el('p', {
    className: 'fallback-notice',
    text: msg || 'No entries available yet — the registry is empty.',
  });
  empty.appendChild(note);
}

// ---------- filters ----------

function populateFormatFilter() {
  const sel = document.getElementById('format');
  const current = state.format;
  while (sel.children.length > 1) sel.removeChild(sel.lastChild);
  const formats = [...new Set(state.entries.map((e) => e.format).filter(Boolean))].sort();
  for (const f of formats) {
    sel.appendChild(el('option', { text: f, attrs: { value: f } }));
  }
  if (formats.includes(current)) sel.value = current;
}

function populateStatusFilter() {
  const fs = document.getElementById('status-filter');
  const present = new Set(state.entries.map((e) => e.status || 'pending'));
  for (const s of DEFAULT_STATUSES) present.add(s);
  const ordered = [
    'ok', 'pending', 'missing', 'invalid',
    'oversize', 'transient_error', 'dead', 'renamed',
  ].filter((s) => present.has(s));

  fs.querySelectorAll('label').forEach((n) => n.remove());
  for (const status of ordered) {
    const meta = STATUS_META[status] ?? { emoji: '', label: status };
    const id = `status-${status}`;
    const checkbox = el('input', {
      attrs: { type: 'checkbox', id, value: status },
      props: { checked: state.statuses.has(status) },
    });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.statuses.add(status);
      else state.statuses.delete(status);
      applyFilters();
    });
    const label = el('label', { attrs: { for: id } }, [
      checkbox,
      el('span', { text: meta.label }),
    ]);
    fs.appendChild(label);
  }
}

function applyFilters() {
  const q = state.q.trim().toLowerCase();
  state.filtered = state.entries.filter((entry) => {
    const status = entry.status || 'pending';
    if (!state.statuses.has(status)) return false;
    if (state.format && entry.format !== state.format) return false;
    if (!q) return true;
    const hay = [
      entry.id ?? '',
      entry.description ?? '',
      ...(Array.isArray(entry.tags) ? entry.tags : []),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
  render();
}

// ---------- render ----------

function render() {
  const list = document.getElementById('cards');
  const empty = document.getElementById('empty');
  const meta = document.getElementById('results-meta');

  list.replaceChildren();

  if (state.entries.length === 0) {
    empty.hidden = false;
    meta.textContent = '0 entries';
    return;
  }
  empty.hidden = true;

  if (state.filtered.length === 0) {
    meta.textContent = `0 / ${state.entries.length}`;
    list.appendChild(el('div', {
      className: 'sidebar-empty',
      text: 'No entries match these filters.',
    }));
    return;
  }

  meta.textContent = `${state.filtered.length} / ${state.entries.length}`;

  for (const entry of state.filtered) {
    list.appendChild(renderCard(entry));
  }
}

function renderCard(entry) {
  const status = entry.status || 'pending';
  const statusMeta = STATUS_META[status] ?? { emoji: '', label: status };

  const isSelected = state.selectedId === entry.id;
  const inCart = state.compareCart.includes(entry.id);
  const card = el('div', {
    className: `entry-card${isSelected ? ' is-selected' : ''}${inCart ? ' is-in-cart' : ''}`,
    attrs: { role: 'option', 'aria-selected': isSelected ? 'true' : 'false' },
  });

  const id = el('div', { className: 'entry-card-id', text: entry.id || '(unknown)' });
  const desc = el('p', {
    className: 'entry-card-desc',
    text: entry.description || 'No description.',
  });

  const compareBtn = el('button', {
    className: 'entry-card-compare',
    attrs: {
      type: 'button',
      title: inCart ? 'Remove from compare' : 'Add to compare',
      'aria-label': inCart ? `Remove ${entry.id || ''} from compare` : `Add ${entry.id || ''} to compare`,
      'aria-pressed': inCart ? 'true' : 'false',
    },
    text: inCart ? '✓ Compare' : '+ Compare',
  });
  compareBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleCompareCart(entry.id);
  });

  const foot = el('div', { className: 'entry-card-foot' }, [
    el('span', { className: 'format-pill', text: entry.format || 'unknown' }),
    el('span', {
      className: 'status-chip',
      attrs: { 'data-status': status, title: `status: ${statusMeta.label}` },
      text: `${statusMeta.emoji} ${statusMeta.label}`,
    }),
    compareBtn,
  ]);

  card.appendChild(id);
  card.appendChild(desc);
  card.appendChild(foot);
  card.addEventListener('click', () => selectEntry(entry));
  card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      selectEntry(entry);
    }
  });
  card.tabIndex = 0;

  return card;
}

// ---------- selection / detail / graph ----------

function selectEntry(entry, opts = {}) {
  const sameEntry = state.selectedId === entry.id;
  state.selectedId = entry.id;
  // Exit compare mode when selecting a single entry from the list.
  if (state.compareMode && !opts.fromCompare) {
    exitCompareMode();
  }
  render();

  if (isMobile()) {
    hideDetail();
    showDetailsPill();
  } else {
    showDetail(entry);
  }
  if (!sameEntry || !getCurrentNetwork()) {
    loadGraphFor(entry, opts);
  }
  updateDeeplink();
}

function getSelectedEntry() {
  if (!state.selectedId) return null;
  return state.entries.find((e) => e.id === state.selectedId) || null;
}

function deselect() {
  state.selectedId = null;
  render();
  hideDetail();
  hideDetailsPill();
  resetGraphArea();
  updateDeeplink();
}

function showDetail(entry) {
  const pane = document.getElementById('detail');
  const scrim = document.getElementById('detail-scrim');
  const ws = document.getElementById('workspace');
  const title = document.getElementById('detail-title');
  const sub = document.getElementById('detail-sub');
  const body = document.getElementById('detail-body');

  title.textContent = entry.id || 'Entry';
  sub.textContent = entry.format || '';

  body.replaceChildren();

  const descSection = el('section', { className: 'detail-section' }, [
    el('h3', { text: 'Description' }),
    el('p', { text: entry.description || 'No description provided.' }),
  ]);
  body.appendChild(descSection);

  const status = entry.status || 'pending';
  const statusMeta = STATUS_META[status] ?? { emoji: '', label: status };
  const metaSection = el('section', { className: 'detail-section' }, [
    el('h3', { text: 'Status' }),
    el('p', {}, [
      el('span', {
        className: 'status-chip',
        attrs: { 'data-status': status },
        text: `${statusMeta.emoji} ${statusMeta.label}`,
      }),
    ]),
  ]);
  if (entry.last_error) {
    metaSection.appendChild(el('p', {
      className: 'kv-mono',
      text: String(entry.last_error),
    }));
  }
  body.appendChild(metaSection);

  body.appendChild(el('section', { className: 'detail-section' }, [
    el('h3', { text: 'Last synced' }),
    el('p', { text: relativeTime(entry.last_synced) }),
  ]));

  if (entry.last_sha) {
    body.appendChild(el('section', { className: 'detail-section' }, [
      el('h3', { text: 'Last SHA' }),
      el('p', { className: 'kv-mono', text: entry.last_sha }),
    ]));
  }

  if (typeof entry.size_bytes === 'number') {
    body.appendChild(el('section', { className: 'detail-section' }, [
      el('h3', { text: 'Size' }),
      el('p', { text: `${entry.size_bytes.toLocaleString()} bytes` }),
    ]));
  }

  if (Array.isArray(entry.tags) && entry.tags.length) {
    const tagWrap = el('div', { className: 'detail-tags' });
    for (const t of entry.tags) {
      tagWrap.appendChild(el('span', { className: 'detail-tag', text: t }));
    }
    body.appendChild(el('section', { className: 'detail-section' }, [
      el('h3', { text: 'Tags' }),
      tagWrap,
    ]));
  }

  // understand-anything@1: show metadata.tool_version chip if present.
  if (entry._toolVersion) {
    body.appendChild(el('section', { className: 'detail-section' }, [
      el('h3', { text: 'Tool version' }),
      el('p', {}, [
        el('span', {
          className: 'tool-version-chip',
          text: String(entry._toolVersion),
        }),
      ]),
    ]));
  }

  // Selected-node card (if a node is currently selected in the network)
  const nodeCard = renderSelectedNodeCard(entry);
  if (nodeCard) body.appendChild(nodeCard);

  const actions = el('div', { className: 'detail-actions' });

  if (entry.graph_url) {
    const visualizeBtn = el('button', {
      className: 'btn btn-primary',
      attrs: { type: 'button' },
      text: 'Visualize graph',
    });
    visualizeBtn.addEventListener('click', () => {
      handleVisualize(entry, visualizeBtn);
    });
    actions.appendChild(visualizeBtn);
  }

  if (entry.id) {
    actions.appendChild(el('a', {
      className: 'btn btn-ghost',
      text: 'Open repo on GitHub',
      attrs: {
        href: `https://github.com/${entry.id}`,
        rel: 'noopener',
        target: '_blank',
      },
    }));
  }
  const copyBtn = el('button', {
    className: 'btn btn-ghost',
    attrs: { type: 'button' },
    text: 'Copy entry JSON',
  });
  const copyStatus = el('p', {
    className: 'copy-status',
    attrs: { 'aria-live': 'polite' },
  });
  copyBtn.addEventListener('click', () => copyEntryJson(entry, copyStatus));
  actions.appendChild(copyBtn);
  actions.appendChild(copyStatus);

  if (entry.graph_url) {
    const raw = el('a', {
      className: 'detail-raw-link',
      text: 'View raw JSON ↗',
      attrs: { href: entry.graph_url, rel: 'noopener', target: '_blank' },
    });
    actions.appendChild(raw);
  }

  body.appendChild(el('section', { className: 'detail-section' }, [
    el('h3', { text: 'Actions' }),
    actions,
  ]));

  pane.hidden = false;
  ws.classList.add('has-detail');

  if (isMobile()) {
    pane.classList.add('is-sheet');
    pane.setAttribute('aria-modal', 'true');
    if (scrim) scrim.hidden = false;
    requestAnimationFrame(() => {
      pane.classList.add('is-open');
      if (scrim) scrim.classList.add('is-open');
    });
  } else {
    pane.classList.remove('is-sheet', 'is-open');
    pane.setAttribute('aria-modal', 'false');
    if (scrim) {
      scrim.hidden = true;
      scrim.classList.remove('is-open');
    }
  }
}

// Render a small "selected node" card in the detail pane when a node is
// selected in the network. Includes a "View on GitHub" icon button.
function renderSelectedNodeCard(entry) {
  const v = getPrimaryViewer();
  if (!v || !v.network) return null;
  const sel = v.network.getSelectedNodes();
  if (!sel || !sel.length) return null;
  const id = sel[0];
  const node = v.allNodes.find((n) => n.id === id);
  const norm = v.normalized && v.normalized.nodes.find((n) => String(n.id) === String(id));
  if (!node) return null;
  const ghUrl = buildGithubUrlForNode(entry, norm);
  const card = el('section', { className: 'detail-section detail-node-card' }, [
    el('h3', { text: 'Selected node' }),
    el('p', { className: 'kv-mono', text: String(node.label || id) }),
  ]);
  if (ghUrl) {
    const link = el('a', {
      className: 'view-on-github',
      attrs: { href: ghUrl, rel: 'noopener', target: '_blank', title: 'View on GitHub' },
      text: '↗ View on GitHub',
    });
    card.appendChild(link);
  }
  return card;
}

function buildGithubUrlForNode(entry, normNode) {
  if (!entry || !entry.id || !normNode) return null;
  const raw = normNode._raw || {};
  const props = raw.properties || {};
  const path = raw.path || raw.file_path || props.path || raw.qualified_name;
  if (!path) return null;
  const startLine = raw.start_line || raw.startLine || (raw.metadata && raw.metadata.start_line)
                    || props.start_line;
  let url = `https://github.com/${entry.id}/blob/HEAD/${path}`;
  if (startLine != null) url += `#L${startLine}`;
  return url;
}

function handleVisualize(entry, button) {
  if (button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = 'Loading…';
  }
  if (isMobile()) {
    hideDetail();
    showDetailsPill();
  }
  loadGraphFor(entry).finally(() => {
    if (button) {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    }
  });
}

function showDetailsPill() {
  const pill = document.getElementById('details-pill');
  if (pill) pill.hidden = false;
}

function hideDetailsPill() {
  const pill = document.getElementById('details-pill');
  if (pill) pill.hidden = true;
}

function hideDetail() {
  const pane = document.getElementById('detail');
  const scrim = document.getElementById('detail-scrim');
  pane.classList.remove('is-open');
  pane.setAttribute('aria-modal', 'false');
  if (scrim) scrim.classList.remove('is-open');
  const wasSheet = pane.classList.contains('is-sheet');
  if (wasSheet) {
    setTimeout(() => {
      if (!pane.classList.contains('is-open')) {
        pane.hidden = true;
        if (scrim) scrim.hidden = true;
        pane.classList.remove('is-sheet');
        pane.style.transform = '';
      }
    }, 240);
  } else {
    pane.hidden = true;
    if (scrim) scrim.hidden = true;
    pane.style.transform = '';
  }
  document.getElementById('workspace').classList.remove('has-detail');
}

async function copyEntryJson(entry, statusEl) {
  const clean = {
    id: entry.id,
    description: entry.description,
    format: entry.format,
    graph_url: entry.graph_url,
  };
  if (Array.isArray(entry.tags) && entry.tags.length) clean.tags = entry.tags;
  const text = JSON.stringify(clean, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = 'Copied to clipboard.';
    statusEl.classList.remove('error');
  } catch {
    statusEl.textContent = "Couldn't copy automatically.";
    statusEl.classList.add('error');
  }
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------- graph area ----------

function setMainState(name) {
  const main = document.getElementById('main');
  if (!main) return;
  if (main.getAttribute('data-main-state') === name) return;
  main.setAttribute('data-main-state', name);
  if (name !== 'graph') {
    Tour.exit();
    const startBtn = document.getElementById('tour-start');
    if (startBtn) startBtn.hidden = true;
    const legend = document.getElementById('graph-legend');
    if (legend) legend.hidden = true;
    const legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) legendToggle.hidden = true;
    const zc = document.getElementById('zoom-controls');
    if (zc) zc.hidden = true;
    const lt = document.getElementById('layout-toggle');
    if (lt) lt.hidden = true;
    const sc = document.getElementById('spotlight-control');
    if (sc) sc.hidden = true;
    const dc = document.getElementById('degree-control');
    if (dc) dc.hidden = true;
    const rh = document.getElementById('restore-hidden');
    if (rh) rh.hidden = true;
    const pb = document.getElementById('path-banner');
    if (pb) pb.hidden = true;
    const pr = document.getElementById('path-result');
    if (pr) pr.hidden = true;
    hideSearchCounter();
  }
}

function resetGraphArea() {
  clearGraph();
  setMainState('empty');
  refreshEmptyStateCta();
}

function refreshEmptyStateCta() {
  const empty = document.getElementById('graph-empty');
  if (!empty) return;
  const prior = empty.querySelector('.pick-entry-cta');
  if (prior) prior.remove();
  if (!isMobile()) return;
  if (state.entries.length === 0) return;
  const cta = el('div', { className: 'pick-entry-cta' }, [
    el('span', { className: 'pick-entry-arrow', text: '↑', attrs: { 'aria-hidden': 'true' } }),
    el('span', { text: 'Pick an entry above' }),
  ]);
  empty.appendChild(cta);
}

async function loadGraphFor(entry, opts = {}) {
  const status = entry.status || 'pending';

  if (!entry.graph_url || status !== 'ok') {
    clearGraph();
    const statusMeta = STATUS_META[status] ?? { emoji: '', label: status };
    setMainState('error');
    setStatusText(
      entry.graph_url
        ? `Graph not available (status: ${statusMeta.label}).`
        : 'This entry has no graph_url.',
      true,
    );
    return;
  }

  setMainState('loading');
  setStatusText('Loading graph…', false, true);

  try {
    const prepared = await prepareGraph(entry);
    setMainState('graph');
    // Pull tool_version (understand-anything@1) for detail pane chip.
    if (prepared.format === 'understand-anything@1' && prepared.graph?.metadata?.tool_version) {
      entry._toolVersion = prepared.graph.metadata.tool_version;
    }
    const layoutOverride = opts.layout || null;
    const result = commitGraph(prepared, document.getElementById('graph-canvas'), {
      primary: true,
      layout: layoutOverride,
    });
    state.layout = result.viewer.layout;
    state.tourSteps = result.steps || [];
    if (result?.legend && result.legend.length) {
      state.legend = result.legend;
      renderLegend(result.legend);
    } else {
      state.legend = [];
    }
    Tour.attach(state.tourSteps, result.network);
    // Per-graph chrome
    const lt = document.getElementById('layout-toggle');
    if (lt) lt.hidden = false;
    syncLayoutToggleUI();
    const sc = document.getElementById('spotlight-control');
    if (sc) sc.hidden = false;
    const dc = document.getElementById('degree-control');
    if (dc) {
      dc.hidden = false;
      const slider = document.getElementById('degree-slider');
      if (slider) {
        slider.max = String(Math.max(1, result.viewer.maxDegree));
        slider.value = '0';
        const val = document.getElementById('degree-value');
        if (val) val.textContent = '0';
        const cap = document.getElementById('degree-hidden-count');
        if (cap) cap.textContent = '';
      }
    }
    // Hover events: vis-network
    bindNetworkInteractions(result.viewer, false);
    // Apply deeplink params if present (q, kind, hops, node)
    if (opts.deeplink) {
      applyDeeplinkToViewer(result.viewer, opts.deeplink);
    }
    // Refresh the detail pane if it's open (selected-node card)
    if (!isMobile() && state.selectedId) {
      const cur = getSelectedEntry();
      if (cur) showDetail(cur);
    }
  } catch (err) {
    console.error(err);
    setMainState('error');
    setStatusText(`Couldn't load graph: ${err.message}`, true);
  }
}

function setStatusText(text, isError, withSpinner = false) {
  const status = document.getElementById('graph-status');
  status.replaceChildren();
  status.classList.toggle('error', !!isError);
  if (withSpinner) {
    status.appendChild(el('div', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }));
  }
  status.appendChild(document.createTextNode(text));
}

// Wire vis-network event listeners on a Viewer instance: hover focus,
// right-click menu, path-finder click handling, selection tracking.
function bindNetworkInteractions(viewer, isCompareB) {
  if (!viewer || !viewer.network) return;
  // Right-click context menu (desktop) — vis-network fires `oncontext`.
  viewer.network.on('oncontext', (params) => {
    if (params && params.event && params.event.preventDefault) params.event.preventDefault();
    const nodeId = viewer.network.getNodeAt(params.pointer.DOM);
    if (nodeId == null) {
      hideContextMenu();
      return;
    }
    showContextMenu(viewer, nodeId, params.event);
  });
  // Click for path-finder targeting.
  viewer.network.on('click', (params) => {
    hideContextMenu();
    const nodeId = (params && params.nodes && params.nodes.length) ? params.nodes[0] : null;
    if (state.pathFinder.phase === 'awaiting' && nodeId != null) {
      finishPathFinder(viewer, nodeId);
      return;
    }
    // Spotlight: re-center on selected node when active.
    if (viewer.spotlightActive && nodeId != null) {
      viewer.setSpotlight(true, viewer.spotlightHops, nodeId);
    }
    if (nodeId != null && !isCompareB) {
      // Mirror selection in compare canvas B if present.
      if (state.compareSecondary && state.compareSecondary.viewer) {
        try { state.compareSecondary.viewer.network.selectNodes([nodeId]); } catch (_) { /* node may not exist in B */ }
      }
      // Refresh detail pane to show selected-node card.
      if (!isMobile() && state.selectedId) {
        const cur = getSelectedEntry();
        if (cur) showDetail(cur);
      }
    }
    if (isCompareB && nodeId != null) {
      const a = getPrimaryViewer();
      if (a) try { a.network.selectNodes([nodeId]); } catch (_) { /* ok */ }
    }
    updateDeeplink();
  });
  // Close context menu on canvas-level events.
  viewer.network.on('zoom', () => hideContextMenu());
  viewer.network.on('dragStart', () => hideContextMenu());
}

// ---------- search (graph-aware) ----------

const debouncedGraphSearch = debounce(runGraphSearch, 150);

function runGraphSearch() {
  const v = getPrimaryViewer();
  if (!v) return;
  const q = state.q || '';
  if (!q.trim()) {
    state.graphSearchMatches = [];
    state.graphSearchIdx = 0;
    hideSearchCounter();
    return;
  }
  const matches = v.search(q);
  state.graphSearchMatches = matches;
  state.graphSearchIdx = 0;
  if (matches.length > 0) {
    v.pulse(matches);
    v.focusNodes([matches[0]]);
  }
  showSearchCounter(matches.length, matches.length ? 1 : 0);
  updateDeeplink();
}

function cycleGraphSearch() {
  const v = getPrimaryViewer();
  if (!v || state.graphSearchMatches.length === 0) return;
  state.graphSearchIdx = (state.graphSearchIdx + 1) % state.graphSearchMatches.length;
  const id = state.graphSearchMatches[state.graphSearchIdx];
  v.focusNodes([id]);
  v.pulse([id]);
  showSearchCounter(state.graphSearchMatches.length, state.graphSearchIdx + 1);
}

function showSearchCounter(total, current) {
  const c = document.getElementById('search-counter');
  if (!c) return;
  if (total <= 0) {
    c.textContent = 'no matches';
    c.hidden = false;
    return;
  }
  c.textContent = `${current} / ${total}`;
  c.hidden = false;
}

function hideSearchCounter() {
  const c = document.getElementById('search-counter');
  if (c) c.hidden = true;
}

// ---------- guided tour ----------

const TOUR_AUTOSHOW_KEY = 'uq:tour-autoshown';
const TOUR_AUTO_ADVANCE_MS = 6000;

function tourPrefersReducedMotion() {
  return PREFERS_REDUCED;
}

const Tour = (() => {
  let steps = [];
  let net = null;
  let idx = 0;
  let active = false;
  let playing = true;
  let timer = null;
  let triggerEl = null;

  function el(id) { return document.getElementById(id); }

  function panel()       { return el('tour-panel'); }
  function startBtn()    { return el('tour-start'); }
  function counterEl()   { return el('tour-counter'); }
  function kindChipEl()  { return el('tour-kind'); }
  function labelEl()     { return el('tour-label'); }
  function textEl()      { return el('tour-text'); }
  function liveEl()      { return el('tour-live'); }
  function pauseBtnEl()  { return el('tour-pause'); }
  function pauseLblEl()  { return el('tour-pause-label'); }
  function nextBtnEl()   { return el('tour-next'); }

  function attach(newSteps, network) {
    steps = Array.isArray(newSteps) ? newSteps.filter(Boolean) : [];
    net = network || null;
    active = false;
    idx = 0;
    playing = true;
    stopTimer();
    if (typeof document !== 'undefined' && document.body) {
      delete document.body.dataset.tourRunning;
    }
    const sb = startBtn();
    if (sb) sb.hidden = steps.length === 0;
    const p = panel();
    if (p) p.hidden = true;
    if (steps.length === 0) return;
    if (typeof sessionStorage !== 'undefined') {
      try {
        if (!sessionStorage.getItem(TOUR_AUTOSHOW_KEY)) {
          sessionStorage.setItem(TOUR_AUTOSHOW_KEY, '1');
          start(sb || null);
        }
      } catch (_) { /* private mode etc. */ }
    }
  }

  function applySteps(newSteps) {
    steps = Array.isArray(newSteps) ? newSteps.filter(Boolean) : [];
    if (!steps.length) {
      exit();
      return;
    }
    idx = 0;
    if (active) {
      renderStep();
      schedule();
    }
  }

  function start(triggerElement) {
    if (!steps.length) return;
    triggerEl = triggerElement || startBtn();
    active = true;
    idx = 0;
    playing = !tourPrefersReducedMotion();
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.tourRunning = 'true';
    }
    const p = panel();
    if (p) {
      p.hidden = false;
      requestAnimationFrame(() => p.classList.add('is-open'));
    }
    renderStep();
    syncPauseLabel();
    schedule();
    if (p && typeof p.focus === 'function') {
      try { p.focus({ preventScroll: true }); } catch (_) { p.focus(); }
    }
  }

  function exit() {
    if (!active && (!panel() || panel().hidden)) return;
    active = false;
    stopTimer();
    if (typeof document !== 'undefined' && document.body) {
      delete document.body.dataset.tourRunning;
    }
    const p = panel();
    if (p) {
      p.classList.remove('is-open');
      p.hidden = true;
    }
    if (triggerEl && typeof triggerEl.focus === 'function') {
      try { triggerEl.focus({ preventScroll: true }); } catch (_) { /* ok */ }
    }
    triggerEl = null;
  }

  function next() {
    if (!active || !steps.length) return;
    if (idx >= steps.length - 1) {
      idx = 0;
    } else {
      idx += 1;
    }
    renderStep();
    schedule();
  }

  function prev() {
    if (!active || !steps.length) return;
    idx = Math.max(0, idx - 1);
    renderStep();
    schedule();
  }

  function jumpTo(i) {
    if (!active || !steps.length) return;
    idx = Math.max(0, Math.min(steps.length - 1, i));
    renderStep();
    schedule();
  }

  function togglePlay() {
    playing = !playing;
    syncPauseLabel();
    schedule();
  }

  function schedule() {
    stopTimer();
    if (!active || !playing || tourPrefersReducedMotion()) return;
    timer = setInterval(() => {
      if (idx >= steps.length - 1) { stopTimer(); return; }
      next();
    }, TOUR_AUTO_ADVANCE_MS);
  }

  function stopTimer() {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function syncPauseLabel() {
    const lbl = pauseLblEl();
    const btn = pauseBtnEl();
    if (lbl) lbl.textContent = playing ? 'Pause' : 'Resume';
    if (btn) btn.setAttribute('aria-label', playing ? 'Pause auto-advance' : 'Resume auto-advance');
  }

  function renderStep() {
    if (!steps.length) return;
    const step = steps[idx];
    if (!step) return;
    const counter = counterEl();
    if (counter) counter.textContent = `${idx + 1} / ${steps.length}`;
    const chip = kindChipEl();
    if (chip) {
      chip.textContent = step.kind || '—';
      chip.dataset.kind = step.kind || '';
    }
    const lbl = labelEl();
    if (lbl) lbl.textContent = step.label || step.id;
    const txt = textEl();
    if (txt) txt.textContent = step.text || step.label || step.id;
    const live = liveEl();
    if (live) live.textContent = `Step ${idx + 1} of ${steps.length}: ${step.label || step.id}`;
    const nb = nextBtnEl();
    if (nb) {
      const isLast = idx === steps.length - 1;
      const lblSpan = nb.querySelector('.tour-btn-label');
      if (lblSpan) lblSpan.textContent = isLast ? 'Restart' : 'Next';
      nb.setAttribute('aria-label', isLast ? 'Restart tour' : 'Next step');
    }

    if (net && step.id) {
      try { net.selectNodes([step.id]); } catch (_) { /* node may have been pruned */ }
      try {
        net.focus(step.id, {
          scale: 1.6,
          animation: tourPrefersReducedMotion()
            ? false
            : { duration: 600, easingFunction: 'easeInOutQuad' },
        });
      } catch (_) { /* noop */ }
    }
  }

  function isActive() { return active; }
  function isPlaying() { return playing; }

  function handleVisibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      stopTimer();
    } else {
      schedule();
    }
  }

  return { attach, applySteps, start, exit, next, prev, jumpTo, togglePlay, isActive, isPlaying, handleVisibility };
})();

// ---------- legend ----------

let legendExpanded = false;

function renderLegend(items) {
  const legend = document.getElementById('graph-legend');
  const toggle = document.getElementById('legend-toggle');
  legend.replaceChildren();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isCommunity = item.community != null;
    const chip = el('button', {
      className: `legend-chip${isCommunity ? ' is-community' : ''}`,
      attrs: {
        type: 'button',
        style: `--c: ${item.color};`,
        'aria-pressed': 'true',
        'aria-label': isCommunity
          ? `Toggle community ${item.community}`
          : `Toggle kind ${item.label}`,
        title: isCommunity ? 'Communities are visual only' : 'Click to toggle visibility',
        'data-kind': item.kind || '',
        'data-community': isCommunity ? String(item.community) : '',
      },
    }, [
      el('span', { className: 'dot' }),
      el('span', { text: item.label }),
      el('span', { className: 'count', text: String(item.count) }),
    ]);
    if (!isCommunity) {
      chip.addEventListener('click', () => toggleLegendChipByIndex(i));
    } else {
      // Communities are display-only chips.
      chip.disabled = true;
      chip.setAttribute('aria-disabled', 'true');
    }
    legend.appendChild(chip);
  }
  // "Reset" button at the end if any kind chips
  if (items.some((x) => !x.community)) {
    const reset = el('button', {
      className: 'legend-reset',
      attrs: { type: 'button', title: 'Reset visibility filters' },
      text: 'Reset',
    });
    reset.addEventListener('click', () => {
      const v = getPrimaryViewer();
      if (!v) return;
      v.resetKindFilters();
      // Sync chip aria-pressed.
      legend.querySelectorAll('.legend-chip:not(.is-community)').forEach((c) => {
        c.setAttribute('aria-pressed', 'true');
        c.classList.remove('is-off');
      });
    });
    legend.appendChild(reset);
  }

  if (items.length === 0) {
    legend.hidden = true;
    if (toggle) toggle.hidden = true;
    return;
  }
  legendExpanded = !isMobile();
  applyLegendVisibility();
  if (toggle) toggle.hidden = !isMobile();
}

function toggleLegendChipByIndex(index) {
  const v = getPrimaryViewer();
  if (!v) return;
  const items = state.legend;
  if (!items || index >= items.length) return;
  const item = items[index];
  if (!item || item.community != null) return;
  const kind = item.kind || item.label;
  if (!kind || kind === 'other') return;
  const chip = document.querySelector(`.legend-chip[data-kind="${CSS.escape(kind)}"]`);
  const wasPressed = chip ? chip.getAttribute('aria-pressed') === 'true' : true;
  const nowHidden = wasPressed; // pressed=visible, so toggling sets hidden=true
  v.toggleKind(kind, nowHidden);
  if (chip) {
    chip.setAttribute('aria-pressed', nowHidden ? 'false' : 'true');
    chip.classList.toggle('is-off', nowHidden);
  }
  updateDeeplink();
}

function applyLegendVisibility() {
  const legend = document.getElementById('graph-legend');
  const toggle = document.getElementById('legend-toggle');
  if (!legend) return;
  legend.hidden = !legendExpanded;
  if (toggle) {
    toggle.setAttribute('aria-expanded', legendExpanded ? 'true' : 'false');
    const lbl = toggle.querySelector('.legend-toggle-label');
    if (lbl) lbl.textContent = legendExpanded ? 'Hide legend' : 'Show legend';
  }
}

// ---------- compare cart / mode ----------

function toggleCompareCart(id) {
  const i = state.compareCart.indexOf(id);
  if (i >= 0) {
    state.compareCart.splice(i, 1);
  } else {
    if (state.compareCart.length >= 2) state.compareCart.shift();
    state.compareCart.push(id);
  }
  syncCompareCartUI();
  render();
}

function syncCompareCartUI() {
  const cart = document.getElementById('compare-cart');
  const list = document.getElementById('compare-cart-list');
  const go = document.getElementById('compare-cart-go');
  if (!cart || !list) return;
  list.replaceChildren();
  for (const id of state.compareCart) {
    const li = el('li', {}, [
      el('span', { className: 'compare-cart-id', text: id }),
      (() => {
        const x = el('button', {
          className: 'compare-cart-x',
          attrs: { type: 'button', 'aria-label': `Remove ${id}` },
          text: '×',
        });
        x.addEventListener('click', () => toggleCompareCart(id));
        return x;
      })(),
    ]);
    list.appendChild(li);
  }
  cart.hidden = state.compareCart.length === 0;
  if (go) go.hidden = state.compareCart.length < 2;
}

async function enterCompareMode() {
  if (state.compareCart.length < 2) return;
  const [aId, bId] = state.compareCart;
  const aEntry = state.entries.find((e) => e.id === aId);
  const bEntry = state.entries.find((e) => e.id === bId);
  if (!aEntry || !bEntry) return;
  // Mark compare mode and show secondary canvas
  state.compareMode = true;
  state.selectedId = aId;
  render();
  document.getElementById('graph-host').classList.add('is-compare');
  const canvasB = document.getElementById('graph-canvas-b');
  if (canvasB) canvasB.hidden = false;
  if (isMobile()) {
    hideDetail();
    showDetailsPill();
  } else {
    showDetail(aEntry);
  }
  // Load A as primary
  await loadGraphFor(aEntry, { fromCompare: true });
  // Load B as secondary
  try {
    const preparedB = await prepareGraph(bEntry);
    const layoutB = (typeof localStorage !== 'undefined'
      && localStorage.getItem(`uq:layout:${bEntry.id}`)) || 'force';
    const resultB = commitGraph(preparedB, canvasB, { primary: false, layout: layoutB });
    state.compareSecondary = { viewer: resultB.viewer, entry: bEntry };
    bindNetworkInteractions(resultB.viewer, true);
  } catch (err) {
    console.error('compare B load failed', err);
  }
}

function exitCompareMode() {
  if (!state.compareMode) return;
  state.compareMode = false;
  if (state.compareSecondary && state.compareSecondary.viewer) {
    state.compareSecondary.viewer.destroy();
  }
  state.compareSecondary = null;
  document.getElementById('graph-host').classList.remove('is-compare');
  const canvasB = document.getElementById('graph-canvas-b');
  if (canvasB) canvasB.hidden = true;
}

// ---------- right-click menu ----------

let ctxMenuOutsideHandler = null;
let ctxMenuScrollHandler = null;
let ctxMenuKeyHandler = null;

function showContextMenu(viewer, nodeId, mouseEvent) {
  const menu = document.getElementById('ctx-menu');
  if (!menu) return;
  menu.replaceChildren();
  const entry = getCurrentEntry(viewer);
  const norm = viewer.normalized && viewer.normalized.nodes.find((n) => String(n.id) === String(nodeId));
  const ghUrl = entry ? buildGithubUrlForNode(entry, norm) : null;

  const items = [
    { label: 'Copy id', fn: () => copyText(String(nodeId)) },
  ];
  if (entry && entry.graph_url) {
    items.push({ label: 'Copy graph_url', fn: () => copyText(entry.graph_url) });
  }
  items.push({
    label: 'Expand 1-hop', fn: () => {
      // Spotlight 1-hop on this node briefly
      viewer.setSpotlight(true, 1, String(nodeId));
      const sc = document.getElementById('spotlight-on');
      if (sc) sc.checked = true;
      const wrap = document.getElementById('spotlight-hops-wrap');
      if (wrap) wrap.hidden = false;
      const hopsEl = document.getElementById('spotlight-hops');
      if (hopsEl) hopsEl.value = '1';
      const hopsVal = document.getElementById('spotlight-hops-val');
      if (hopsVal) hopsVal.textContent = '1';
    },
  });
  items.push({ label: 'Hide node', fn: () => { viewer.hideNode(String(nodeId)); refreshRestoreHidden(); } });
  items.push({ label: 'Find paths to…', fn: () => beginPathFinder(viewer, String(nodeId)) });
  if (ghUrl) {
    items.push({
      label: 'View on GitHub ↗',
      fn: () => window.open(ghUrl, '_blank', 'noopener'),
    });
  }

  for (const it of items) {
    const btn = el('button', {
      className: 'ctx-menu-item',
      attrs: { type: 'button', role: 'menuitem' },
      text: it.label,
    });
    btn.addEventListener('click', () => {
      hideContextMenu();
      try { it.fn(); } catch (e) { console.error(e); }
    });
    menu.appendChild(btn);
  }

  // Position
  const x = mouseEvent.clientX || (mouseEvent.touches && mouseEvent.touches[0]?.clientX) || 100;
  const y = mouseEvent.clientY || (mouseEvent.touches && mouseEvent.touches[0]?.clientY) || 100;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;
  // Adjust if overflow
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth) menu.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
    if (r.bottom > window.innerHeight) menu.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
  });

  // Close handlers
  ctxMenuOutsideHandler = (ev) => {
    if (!menu.contains(ev.target)) hideContextMenu();
  };
  ctxMenuScrollHandler = () => hideContextMenu();
  ctxMenuKeyHandler = (ev) => {
    if (ev.key === 'Escape') hideContextMenu();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', ctxMenuOutsideHandler);
    window.addEventListener('scroll', ctxMenuScrollHandler, true);
    document.addEventListener('keydown', ctxMenuKeyHandler);
  }, 0);
}

function hideContextMenu() {
  const menu = document.getElementById('ctx-menu');
  if (!menu) return;
  menu.hidden = true;
  if (ctxMenuOutsideHandler) document.removeEventListener('mousedown', ctxMenuOutsideHandler);
  if (ctxMenuScrollHandler) window.removeEventListener('scroll', ctxMenuScrollHandler, true);
  if (ctxMenuKeyHandler) document.removeEventListener('keydown', ctxMenuKeyHandler);
  ctxMenuOutsideHandler = null;
  ctxMenuScrollHandler = null;
  ctxMenuKeyHandler = null;
}

function getCurrentEntry(viewer) {
  if (viewer && viewer.entry) return viewer.entry;
  return getSelectedEntry();
}

function refreshRestoreHidden() {
  const v = getPrimaryViewer();
  const btn = document.getElementById('restore-hidden');
  if (!btn || !v) return;
  if (v.hidden.size > 0) {
    btn.hidden = false;
    const cnt = document.getElementById('hidden-count');
    if (cnt) cnt.textContent = String(v.hidden.size);
  } else {
    btn.hidden = true;
  }
}

// ---------- path finder ----------

function beginPathFinder(_viewer, srcId) {
  state.pathFinder = { phase: 'awaiting', src: srcId, dst: null, path: null };
  const banner = document.getElementById('path-banner');
  if (banner) banner.hidden = false;
  const txt = document.getElementById('path-banner-text');
  if (txt) txt.textContent = `From ${srcId} — click target node`;
  document.body.classList.add('path-cursor');
}

function finishPathFinder(viewer, dstId) {
  const src = state.pathFinder.src;
  if (!src || src === dstId) {
    cancelPathFinder();
    return;
  }
  const path = viewer.shortestPath(src, dstId);
  state.pathFinder = { phase: 'shown', src, dst: dstId, path: path || null };
  const banner = document.getElementById('path-banner');
  if (banner) banner.hidden = true;
  const result = document.getElementById('path-result');
  const txt = document.getElementById('path-result-text');
  if (path && txt && result) {
    viewer.highlightPath(path);
    txt.textContent = `Path length ${path.length - 1} (${path.length} nodes)`;
    result.hidden = false;
  } else if (result && txt) {
    txt.textContent = 'No path found';
    result.hidden = false;
  }
  document.body.classList.remove('path-cursor');
}

function cancelPathFinder() {
  state.pathFinder = { phase: 'idle', src: null, dst: null, path: null };
  const banner = document.getElementById('path-banner');
  if (banner) banner.hidden = true;
  const result = document.getElementById('path-result');
  if (result) result.hidden = true;
  document.body.classList.remove('path-cursor');
  const v = getPrimaryViewer();
  if (v) v.clearPathHighlight();
}

// ---------- command palette ----------

let paletteResults = [];
let paletteIdx = 0;

function openPalette() {
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input');
  if (!overlay || !input) return;
  overlay.hidden = false;
  input.value = '';
  paletteIdx = 0;
  refreshPaletteResults('');
  setTimeout(() => input.focus(), 0);
}

function closePalette() {
  const overlay = document.getElementById('palette-overlay');
  if (overlay) overlay.hidden = true;
}

function paletteIsOpen() {
  const overlay = document.getElementById('palette-overlay');
  return overlay && !overlay.hidden;
}

function refreshPaletteResults(query) {
  const q = String(query || '').trim().toLowerCase();
  const out = [];
  // Entries
  for (const e of state.entries) {
    const idLower = String(e.id || '').toLowerCase();
    const descLower = String(e.description || '').toLowerCase();
    if (!q || idLower.includes(q) || descLower.includes(q)) {
      out.push({
        section: 'Entries',
        label: e.id || '(unknown)',
        sub: e.description || '',
        action: () => { closePalette(); selectEntry(e); },
      });
    }
    if (out.length > 60) break;
  }
  // Nodes (current graph)
  const v = getPrimaryViewer();
  if (v) {
    let count = 0;
    for (const n of v.allNodes) {
      const idL = String(n.id).toLowerCase();
      const labelL = String(n.label || '').toLowerCase();
      if (!q || idL.includes(q) || labelL.includes(q)) {
        out.push({
          section: 'Nodes',
          label: String(n.label || n.id),
          sub: String(n.id),
          action: () => {
            closePalette();
            try { v.network.selectNodes([n.id]); } catch (_) { /* noop */ }
            v.focusNodes([n.id]);
            updateDeeplink();
          },
        });
        if (++count > 30) break;
      }
    }
  }
  // Actions
  const actions = [
    { label: 'Start tour', fn: () => Tour.start() },
    { label: 'Toggle layout: Force', fn: () => setLayout('force') },
    { label: 'Toggle layout: Hierarchy', fn: () => setLayout('hierarchy') },
    { label: 'Toggle layout: Circle', fn: () => setLayout('circle') },
    { label: 'Toggle layout: Tree', fn: () => setLayout('tree') },
    { label: 'Toggle spotlight', fn: () => toggleSpotlight() },
    { label: 'Fit graph', fn: () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'fit' } })) },
    { label: 'Show keyboard shortcuts', fn: () => openCheatsheet() },
    { label: 'Restore hidden nodes', fn: () => { const vv = getPrimaryViewer(); if (vv) { vv.restoreHidden(); refreshRestoreHidden(); } } },
    { label: 'Reset legend filters', fn: () => { const vv = getPrimaryViewer(); if (vv) vv.resetKindFilters(); } },
  ];
  for (const a of actions) {
    if (!q || a.label.toLowerCase().includes(q)) {
      out.push({ section: 'Actions', label: a.label, sub: '', action: () => { closePalette(); try { a.fn(); } catch (e) { console.error(e); } } });
    }
  }
  paletteResults = out;
  paletteIdx = 0;
  renderPaletteResults();
}

function renderPaletteResults() {
  const container = document.getElementById('palette-results');
  if (!container) return;
  container.replaceChildren();
  let lastSection = '';
  paletteResults.forEach((r, i) => {
    if (r.section !== lastSection) {
      container.appendChild(el('div', { className: 'palette-section', text: r.section }));
      lastSection = r.section;
    }
    const row = el('div', {
      className: `palette-row${i === paletteIdx ? ' is-active' : ''}`,
      attrs: { role: 'option', 'aria-selected': i === paletteIdx ? 'true' : 'false' },
    }, [
      el('div', { className: 'palette-row-label', text: r.label }),
      r.sub ? el('div', { className: 'palette-row-sub', text: r.sub }) : null,
    ]);
    row.addEventListener('mouseenter', () => {
      paletteIdx = i;
      renderPaletteResults();
    });
    row.addEventListener('click', () => r.action());
    container.appendChild(row);
  });
  // Scroll active into view
  const active = container.querySelector('.palette-row.is-active');
  if (active && active.scrollIntoView) {
    try { active.scrollIntoView({ block: 'nearest' }); } catch (_) { /* noop */ }
  }
}

// ---------- cheatsheet ----------

function openCheatsheet() {
  const overlay = document.getElementById('cheatsheet-overlay');
  if (overlay) overlay.hidden = false;
  const focus = document.getElementById('cheatsheet');
  if (focus) try { focus.focus(); } catch (_) { /* noop */ }
}

function closeCheatsheet() {
  const overlay = document.getElementById('cheatsheet-overlay');
  if (overlay) overlay.hidden = true;
}

function cheatsheetOpen() {
  const overlay = document.getElementById('cheatsheet-overlay');
  return overlay && !overlay.hidden;
}

// ---------- layout toggle / spotlight / min-degree ----------

function setLayout(layout) {
  const v = getPrimaryViewer();
  if (!v) return;
  v.setLayout(layout);
  state.layout = layout;
  syncLayoutToggleUI();
  if (typeof localStorage !== 'undefined' && state.selectedId) {
    try { localStorage.setItem(`uq:layout:${state.selectedId}`, layout); } catch (_) { /* noop */ }
  }
  updateDeeplink();
}

function syncLayoutToggleUI() {
  const lt = document.getElementById('layout-toggle');
  if (!lt) return;
  lt.querySelectorAll('button').forEach((b) => {
    const active = b.getAttribute('data-layout') === state.layout;
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function toggleSpotlight() {
  const v = getPrimaryViewer();
  const cb = document.getElementById('spotlight-on');
  if (!v || !cb) return;
  cb.checked = !cb.checked;
  applySpotlightFromUI();
}

function applySpotlightFromUI() {
  const v = getPrimaryViewer();
  if (!v) return;
  const cb = document.getElementById('spotlight-on');
  const hopsEl = document.getElementById('spotlight-hops');
  const wrap = document.getElementById('spotlight-hops-wrap');
  const valLabel = document.getElementById('spotlight-hops-val');
  const active = !!(cb && cb.checked);
  const hops = hopsEl ? parseInt(hopsEl.value, 10) || 2 : 2;
  if (wrap) wrap.hidden = !active;
  if (valLabel) valLabel.textContent = String(hops);
  let anchor = null;
  if (active && v.network) {
    const sel = v.network.getSelectedNodes();
    if (sel && sel.length) anchor = sel[0];
    else if (v.allNodes.length) anchor = v.allNodes[0].id;
  }
  v.setSpotlight(active, hops, anchor);
}

// ---------- deeplinks ----------

function updateDeeplink() {
  if (typeof history === 'undefined' || !history.replaceState) return;
  if (state.suppressUrlSync) return;
  const params = new URLSearchParams();
  if (state.selectedId) params.set('entry', state.selectedId);
  const v = getPrimaryViewer();
  if (v && v.network) {
    const sel = v.network.getSelectedNodes();
    if (sel && sel.length) params.set('node', sel[0]);
    if (v.layout && v.layout !== 'force') params.set('layout', v.layout);
    if (v.kindHidden && v.kindHidden.size) {
      const arr = [...v.kindHidden].map((k) => '-' + k);
      params.set('kind', arr.join(','));
    }
    if (v.spotlightActive) params.set('hops', String(v.spotlightHops));
  }
  if (state.q) params.set('q', state.q);
  const search = params.toString();
  const url = new URL(window.location.href);
  url.search = search ? `?${search}` : '';
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function applyDeeplinkOnLoad() {
  const params = new URLSearchParams(window.location.search || '');
  const entryId = params.get('entry');
  if (!entryId) return;
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return;
  const layout = params.get('layout') || null;
  const q = params.get('q') || '';
  const kindParam = params.get('kind') || '';
  const node = params.get('node') || null;
  const hops = parseInt(params.get('hops') || '0', 10) || 0;
  if (q) {
    state.q = q;
    const qInput = document.getElementById('q');
    if (qInput) qInput.value = q;
    applyFilters();
  }
  // Defer the graph load + post-load apply until after the entry is selected.
  selectEntry(entry, {
    layout,
    deeplink: { node, q, kindParam, hops },
  });
}

function applyDeeplinkToViewer(viewer, dl) {
  if (!viewer) return;
  if (dl.kindParam) {
    const kinds = dl.kindParam.split(',').map((s) => s.trim()).filter((s) => s.startsWith('-')).map((s) => s.slice(1));
    for (const k of kinds) {
      viewer.kindHidden.add(k);
    }
    viewer.applyVisibility();
    // Sync legend chips
    const legend = document.getElementById('graph-legend');
    if (legend) {
      legend.querySelectorAll('.legend-chip').forEach((chip) => {
        const k = chip.getAttribute('data-kind');
        if (k && kinds.includes(k)) {
          chip.setAttribute('aria-pressed', 'false');
          chip.classList.add('is-off');
        }
      });
    }
  }
  if (dl.q) {
    runGraphSearch();
  }
  if (dl.node) {
    try { viewer.network.selectNodes([dl.node]); } catch (_) { /* noop */ }
    viewer.focusNodes([dl.node]);
  }
  if (dl.hops > 0 && dl.node) {
    const cb = document.getElementById('spotlight-on');
    if (cb) cb.checked = true;
    const hopsEl = document.getElementById('spotlight-hops');
    if (hopsEl) hopsEl.value = String(Math.max(1, Math.min(4, dl.hops)));
    applySpotlightFromUI();
  }
}

// ---------- wiring ----------

function bindToolbar() {
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    state.q = q.value;
    applyFilters();
    if (getPrimaryViewer()) {
      debouncedGraphSearch();
    }
  });
  q.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && getPrimaryViewer() && state.graphSearchMatches.length > 0) {
      ev.preventDefault();
      cycleGraphSearch();
    }
  });
  const fmt = document.getElementById('format');
  fmt.addEventListener('change', () => {
    state.format = fmt.value;
    applyFilters();
  });
}

function bindDetail() {
  document.getElementById('detail-close').addEventListener('click', () => {
    if (isMobile() && state.selectedId) {
      hideDetail();
      showDetailsPill();
    } else {
      deselect();
    }
  });

  const scrim = document.getElementById('detail-scrim');
  if (scrim) {
    scrim.addEventListener('click', () => {
      hideDetail();
      if (isMobile() && state.selectedId) showDetailsPill();
    });
  }

  const pill = document.getElementById('details-pill');
  if (pill) {
    pill.addEventListener('click', () => {
      const entry = getSelectedEntry();
      if (entry) {
        hideDetailsPill();
        showDetail(entry);
      }
    });
  }

  bindSheetDrag();

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  }
}

function handleResize() {
  const toggle = document.getElementById('legend-toggle');
  const legend = document.getElementById('graph-legend');
  if (legend && legend.children.length > 0) {
    const wantExpanded = !isMobile();
    if (wantExpanded !== legendExpanded) {
      legendExpanded = wantExpanded;
      applyLegendVisibility();
    }
    if (toggle) toggle.hidden = !isMobile();
  }
  const entry = getSelectedEntry();
  if (!entry) {
    hideDetailsPill();
    refreshEmptyStateCta();
    return;
  }
  const pane = document.getElementById('detail');
  const sc = document.getElementById('detail-scrim');
  const isSheet = pane.classList.contains('is-sheet');
  if (isMobile()) {
    if (!pane.hidden && !isSheet) {
      pane.hidden = true;
      document.getElementById('workspace').classList.remove('has-detail');
    }
    if (!(isSheet && pane.classList.contains('is-open'))) {
      showDetailsPill();
    }
  } else {
    hideDetailsPill();
    pane.classList.remove('is-sheet', 'is-open');
    pane.style.transform = '';
    if (sc) {
      sc.hidden = true;
      sc.classList.remove('is-open');
    }
    if (pane.hidden) showDetail(entry);
  }
  refreshEmptyStateCta();
}

function bindSheetDrag() {
  const handle = document.getElementById('detail-drag-handle');
  const pane = document.getElementById('detail');
  if (!handle || !pane) return;

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  const onTouchStart = (ev) => {
    if (!pane.classList.contains('is-sheet')) return;
    const t = ev.touches && ev.touches[0];
    if (!t) return;
    dragging = true;
    startY = t.clientY;
    currentY = 0;
    pane.style.transition = 'none';
  };
  const onTouchMove = (ev) => {
    if (!dragging) return;
    const t = ev.touches && ev.touches[0];
    if (!t) return;
    currentY = Math.max(0, t.clientY - startY);
    pane.style.transform = `translateY(${currentY}px)`;
  };
  const onTouchEnd = () => {
    if (!dragging) return;
    dragging = false;
    pane.style.transition = '';
    const threshold = pane.clientHeight * 0.25;
    if (currentY > threshold) {
      pane.style.transform = '';
      hideDetail();
      if (state.selectedId) showDetailsPill();
    } else {
      pane.style.transform = '';
    }
    currentY = 0;
  };

  handle.addEventListener('touchstart', onTouchStart, { passive: true });
  handle.addEventListener('touchmove', onTouchMove, { passive: true });
  handle.addEventListener('touchend', onTouchEnd);
  handle.addEventListener('touchcancel', onTouchEnd);
}

function bindZoom() {
  const inBtn = document.getElementById('zoom-in');
  const outBtn = document.getElementById('zoom-out');
  const fitBtn = document.getElementById('zoom-fit');
  inBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'in' } })));
  outBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'out' } })));
  fitBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'fit' } })));
}

function bindLegendToggle() {
  const toggle = document.getElementById('legend-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    legendExpanded = !legendExpanded;
    applyLegendVisibility();
  });
}

function bindLayoutToggle() {
  const lt = document.getElementById('layout-toggle');
  if (!lt) return;
  lt.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const layout = b.getAttribute('data-layout');
      if (layout) setLayout(layout);
    });
  });
}

function bindSpotlight() {
  const cb = document.getElementById('spotlight-on');
  const hopsEl = document.getElementById('spotlight-hops');
  if (cb) cb.addEventListener('change', applySpotlightFromUI);
  if (hopsEl) hopsEl.addEventListener('input', applySpotlightFromUI);
}

function bindMinDegreeSlider() {
  const slider = document.getElementById('degree-slider');
  if (!slider) return;
  slider.addEventListener('input', () => {
    const v = getPrimaryViewer();
    const val = parseInt(slider.value, 10) || 0;
    const valLabel = document.getElementById('degree-value');
    if (valLabel) valLabel.textContent = String(val);
    if (!v) return;
    v.setMinDegree(val);
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('uq-visibility-changed', (ev) => {
      const cap = document.getElementById('degree-hidden-count');
      if (cap && ev && ev.detail) {
        const v = getPrimaryViewer();
        if (!v) return;
        let hiddenN = 0;
        // Count nodes hidden by min-degree only (not user-hidden / kind-filter)
        for (const n of v.allNodes) {
          const id = n.id;
          if (v.hidden.has(id)) continue;
          const kind = v._kindByNode.get(id);
          if (kind && v.kindHidden.has(kind)) continue;
          if (v.minDegree > 0 && (v.degreeMap.get(id) || 0) < v.minDegree) hiddenN++;
        }
        cap.textContent = hiddenN > 0 ? `${hiddenN} hidden` : '';
      }
      refreshRestoreHidden();
    });
  }
}

function bindRestoreHidden() {
  const btn = document.getElementById('restore-hidden');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const v = getPrimaryViewer();
    if (!v) return;
    v.restoreHidden();
    refreshRestoreHidden();
  });
}

function bindCompareCart() {
  const clear = document.getElementById('compare-cart-clear');
  if (clear) clear.addEventListener('click', () => {
    state.compareCart = [];
    syncCompareCartUI();
    render();
    if (state.compareMode) exitCompareMode();
  });
  const go = document.getElementById('compare-cart-go');
  if (go) go.addEventListener('click', () => enterCompareMode());
}

function bindPathFinderUI() {
  const cancel = document.getElementById('path-banner-cancel');
  const clear = document.getElementById('path-result-clear');
  const copy = document.getElementById('path-result-copy');
  if (cancel) cancel.addEventListener('click', cancelPathFinder);
  if (clear) clear.addEventListener('click', cancelPathFinder);
  if (copy) copy.addEventListener('click', () => {
    if (state.pathFinder.path && state.pathFinder.path.length) {
      copyText(state.pathFinder.path.join(' → '));
    }
  });
}

function bindPalette() {
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input');
  if (!input) return;
  input.addEventListener('input', () => refreshPaletteResults(input.value));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      paletteIdx = Math.min(paletteResults.length - 1, paletteIdx + 1);
      renderPaletteResults();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      paletteIdx = Math.max(0, paletteIdx - 1);
      renderPaletteResults();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const r = paletteResults[paletteIdx];
      if (r) r.action();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      closePalette();
    }
  });
  if (overlay) {
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closePalette();
    });
  }
}

function bindCheatsheet() {
  const close = document.getElementById('cheatsheet-close');
  const overlay = document.getElementById('cheatsheet-overlay');
  if (close) close.addEventListener('click', closeCheatsheet);
  if (overlay) {
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) closeCheatsheet();
    });
  }
}

function bindTour() {
  const startBtn = document.getElementById('tour-start');
  const exitBtn = document.getElementById('tour-exit');
  const prevBtn = document.getElementById('tour-prev');
  const nextBtn = document.getElementById('tour-next');
  const pauseBtn = document.getElementById('tour-pause');

  if (startBtn) startBtn.addEventListener('click', () => Tour.start(startBtn));
  if (exitBtn)  exitBtn.addEventListener('click', () => Tour.exit());
  if (prevBtn)  prevBtn.addEventListener('click', () => Tour.prev());
  if (nextBtn)  nextBtn.addEventListener('click', () => Tour.next());
  if (pauseBtn) pauseBtn.addEventListener('click', () => Tour.togglePlay());

  document.addEventListener('keydown', (ev) => {
    if (!Tour.isActive()) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      Tour.exit();
    } else if (ev.key === 'ArrowRight' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      Tour.next();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      Tour.prev();
    } else if (ev.key === 'p' || ev.key === 'P') {
      ev.preventDefault();
      Tour.togglePlay();
    }
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => Tour.handleVisibility());
  }

  const handle = document.getElementById('tour-panel-handle');
  const panel = document.getElementById('tour-panel');
  if (handle && panel) {
    let startY = 0;
    let currentY = 0;
    let dragging = false;
    handle.addEventListener('touchstart', (ev) => {
      if (!isMobile()) return;
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      dragging = true;
      startY = t.clientY;
      currentY = 0;
      panel.style.transition = 'none';
    }, { passive: true });
    handle.addEventListener('touchmove', (ev) => {
      if (!dragging) return;
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      currentY = Math.max(0, t.clientY - startY);
      panel.style.transform = `translateY(${currentY}px)`;
    }, { passive: true });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = '';
      const threshold = panel.clientHeight * 0.30;
      panel.style.transform = '';
      if (currentY > threshold) Tour.exit();
      currentY = 0;
    };
    handle.addEventListener('touchend', end);
    handle.addEventListener('touchcancel', end);
  }

  // Persona segmented control inside the tour panel head
  const head = document.querySelector('.tour-panel-head');
  if (head && !document.getElementById('tour-personas')) {
    const personas = el('div', {
      className: 'tour-personas',
      attrs: { id: 'tour-personas', role: 'group', 'aria-label': 'Tour persona' },
    });
    const opts = [
      { id: 'default', label: 'Default' },
      { id: 'architect', label: 'Architect' },
      { id: 'junior', label: 'Junior' },
      { id: 'pm', label: 'PM' },
    ];
    for (const o of opts) {
      const b = el('button', {
        className: 'tour-persona-btn',
        attrs: {
          type: 'button',
          'data-persona': o.id,
          'aria-pressed': o.id === state.tourPersona ? 'true' : 'false',
          title: o.label,
        },
        text: o.label,
      });
      b.addEventListener('click', () => {
        state.tourPersona = o.id;
        personas.querySelectorAll('button').forEach((bb) => {
          bb.setAttribute('aria-pressed', bb.getAttribute('data-persona') === o.id ? 'true' : 'false');
        });
        rebuildTourSteps();
      });
      personas.appendChild(b);
    }
    // Insert after kind-chip but before exit btn.
    const exitBtn = document.getElementById('tour-exit');
    if (exitBtn) head.insertBefore(personas, exitBtn);
    else head.appendChild(personas);
  }
}

function rebuildTourSteps() {
  const v = getPrimaryViewer();
  if (!v || !v.entry) return;
  // We need raw graph data — cache from prepareGraph isn't kept on viewer.
  // Easiest: re-extract from viewer.normalized + persona.
  const persona = state.tourPersona;
  const newSteps = reorderTourStepsForPersona(
    v.format,
    { nodes: v.normalized.nodes.map((n) => n._raw), graph: { nodes: v.normalized.nodes.map((n) => n._raw), links: v.normalized.edges.map((e) => e._raw) } },
    v.normalized,
    persona,
    state.tourSteps,
  );
  state.tourSteps = newSteps;
  Tour.applySteps(newSteps);
}

function bindGlobalKeys() {
  let ggArmed = false;
  let ggArmedTimer = null;

  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    // Global Esc (close any overlay)
    if (ev.key === 'Escape') {
      if (paletteIsOpen()) { ev.preventDefault(); closePalette(); return; }
      if (cheatsheetOpen()) { ev.preventDefault(); closeCheatsheet(); return; }
      if (state.pathFinder.phase !== 'idle') { ev.preventDefault(); cancelPathFinder(); return; }
      const ctx = document.getElementById('ctx-menu');
      if (ctx && !ctx.hidden) { ev.preventDefault(); hideContextMenu(); return; }
      const detail = document.getElementById('detail');
      if (!detail.hidden) {
        if (isMobile() && state.selectedId) {
          ev.preventDefault();
          hideDetail();
          showDetailsPill();
        } else {
          ev.preventDefault();
          deselect();
        }
        return;
      }
    }

    // Cmd/Ctrl+K palette
    if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      if (paletteIsOpen()) closePalette();
      else openPalette();
      return;
    }

    if (inEditable) return;
    if (Tour.isActive()) return; // Tour owns its own keys

    // ? cheatsheet
    if (ev.key === '?' || (ev.key === '/' && ev.shiftKey)) {
      ev.preventDefault();
      openCheatsheet();
      return;
    }

    // / focus search
    if (ev.key === '/') {
      ev.preventDefault();
      const q = document.getElementById('q');
      if (q) {
        q.focus();
        q.select && q.select();
      }
      return;
    }

    // t start tour
    if (ev.key === 't' || ev.key === 'T') {
      if (state.tourSteps.length) {
        ev.preventDefault();
        Tour.start();
      }
      return;
    }

    // f fit
    if (ev.key === 'f' || ev.key === 'F') {
      if (getPrimaryViewer()) {
        ev.preventDefault();
        window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'fit' } }));
      }
      return;
    }

    // c center selected
    if (ev.key === 'c' || ev.key === 'C') {
      const v = getPrimaryViewer();
      if (v && v.network) {
        const sel = v.network.getSelectedNodes();
        if (sel && sel.length) {
          ev.preventDefault();
          v.focusNodes([sel[0]]);
        }
      }
      return;
    }

    // 1..9 toggle nth legend chip
    if (/^[1-9]$/.test(ev.key)) {
      const idx = parseInt(ev.key, 10) - 1;
      if (state.legend && state.legend[idx] && !state.legend[idx].community) {
        ev.preventDefault();
        toggleLegendChipByIndex(idx);
      }
      return;
    }

    // [ ] previous/next sidebar entry
    if (ev.key === '[' || ev.key === ']') {
      const list = state.filtered;
      if (list.length === 0) return;
      ev.preventDefault();
      let i = list.findIndex((e) => e.id === state.selectedId);
      if (i < 0) i = ev.key === ']' ? -1 : list.length;
      i = ev.key === ']' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
      const next = list[i];
      if (next) selectEntry(next);
      return;
    }

    // gg jump to first
    if (ev.key === 'g' || ev.key === 'G') {
      if (ggArmed) {
        ggArmed = false;
        if (ggArmedTimer) clearTimeout(ggArmedTimer);
        ggArmedTimer = null;
        const list = state.filtered;
        if (list.length > 0) {
          ev.preventDefault();
          selectEntry(list[0]);
        }
      } else {
        ggArmed = true;
        if (ggArmedTimer) clearTimeout(ggArmedTimer);
        ggArmedTimer = setTimeout(() => { ggArmed = false; ggArmedTimer = null; }, 800);
      }
      return;
    }
  });
}

// ---------- diagnostics + global error handlers ----------

function paintGlobalError(label, detail) {
  try {
    const banner = document.getElementById('error');
    if (banner) {
      banner.hidden = false;
      banner.replaceChildren();
      const strong = el('strong', { text: `${label}: ` });
      const text = document.createTextNode(String(detail || 'unknown error'));
      banner.appendChild(strong);
      banner.appendChild(text);
    }
  } catch (_) { /* swallow */ }
}

function updateDiagPanel() {
  const diag = document.getElementById('diag');
  if (!diag) return;
  if (!DIAG_ENABLED) {
    diag.hidden = true;
    return;
  }
  diag.hidden = false;
  diag.replaceChildren();
  const title = el('div', { className: 'diag-title', text: 'Diagnostics' });
  const ua = el('div', { text: `UA: ${navigator.userAgent}` });
  const ver = el('div', { text: `Page version: v=${PAGE_VERSION}` });
  const reg = el('div', { text: `registry.json fetch: ${lastRegistryStatus}` });
  const first = el('div', { text: `first entry id: ${lastFirstEntryId ?? '(none)'}` });
  diag.appendChild(title);
  diag.appendChild(ua);
  diag.appendChild(ver);
  diag.appendChild(reg);
  diag.appendChild(first);
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => {
    paintGlobalError('Script error', ev?.message || (ev?.error && ev.error.message) || 'unknown');
    updateDiagPanel();
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason;
    const msg = (reason && reason.message) ? reason.message : String(reason || 'unknown');
    paintGlobalError('Promise rejection', msg);
    updateDiagPanel();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    bindToolbar();
    bindDetail();
    bindZoom();
    bindTour();
    bindLegendToggle();
    bindLayoutToggle();
    bindSpotlight();
    bindMinDegreeSlider();
    bindRestoreHidden();
    bindCompareCart();
    bindPathFinderUI();
    bindPalette();
    bindCheatsheet();
    bindGlobalKeys();
    loadRegistry();
    updateDiagPanel();
  } catch (err) {
    console.error(err);
    paintGlobalError('Init failed', (err && err.message) || String(err));
    updateDiagPanel();
  }
});
