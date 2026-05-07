// understand-quickly — registry browser.
// Loads ./registry.json, renders the sidebar list of entries, and drives the
// graph viewer + detail pane on selection. All user-supplied values are
// rendered via textContent / createElement / attribute setters — never
// innerHTML with untrusted data.

import { openGraph, clearGraph } from './viewer.js';

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

function showError(msg) {
  const banner = document.getElementById('error');
  banner.textContent = msg;
  banner.hidden = false;
}

// ---------- data ----------

async function loadRegistry() {
  try {
    const res = await fetch('./registry.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`registry.json responded ${res.status}`);
    const data = await res.json();
    state.entries = Array.isArray(data?.entries) ? data.entries : [];
    if (data?.generated_at) {
      document.getElementById('generated-at').textContent =
        relativeTime(data.generated_at);
    }
    populateFormatFilter();
    populateStatusFilter();
    applyFilters();
  } catch (err) {
    console.error(err);
    showError(`Couldn't load registry.json: ${err.message}`);
    state.entries = [];
    populateFormatFilter();
    populateStatusFilter();
    applyFilters();
  }
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
  const card = el('button', {
    className: `entry-card${isSelected ? ' is-selected' : ''}`,
    attrs: { type: 'button', role: 'option', 'aria-selected': isSelected ? 'true' : 'false' },
  });

  const id = el('div', { className: 'entry-card-id', text: entry.id || '(unknown)' });
  const desc = el('p', {
    className: 'entry-card-desc',
    text: entry.description || 'No description.',
  });

  const foot = el('div', { className: 'entry-card-foot' }, [
    el('span', { className: 'format-pill', text: entry.format || 'unknown' }),
    el('span', {
      className: 'status-chip',
      attrs: { 'data-status': status, title: `status: ${statusMeta.label}` },
      text: `${statusMeta.emoji} ${statusMeta.label}`,
    }),
  ]);

  card.appendChild(id);
  card.appendChild(desc);
  card.appendChild(foot);
  card.addEventListener('click', () => selectEntry(entry));

  return card;
}

// ---------- selection / detail / graph ----------

function selectEntry(entry) {
  state.selectedId = entry.id;
  // Re-render cards to reflect selected state
  render();
  showDetail(entry);
  loadGraphFor(entry);
}

function deselect() {
  state.selectedId = null;
  render();
  hideDetail();
  resetGraphArea();
}

function showDetail(entry) {
  const pane = document.getElementById('detail');
  const ws = document.getElementById('workspace');
  const title = document.getElementById('detail-title');
  const sub = document.getElementById('detail-sub');
  const body = document.getElementById('detail-body');

  title.textContent = entry.id || 'Entry';
  sub.textContent = entry.format || '';

  body.replaceChildren();

  // Description
  const descSection = el('section', { className: 'detail-section' }, [
    el('h3', { text: 'Description' }),
    el('p', { text: entry.description || 'No description provided.' }),
  ]);
  body.appendChild(descSection);

  // Status
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

  // Last sync
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

  // Tags
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

  // Actions
  const actions = el('div', { className: 'detail-actions' });
  if (entry.graph_url) {
    actions.appendChild(el('a', {
      className: 'btn btn-ghost',
      text: 'Open raw graph_url',
      attrs: { href: entry.graph_url, rel: 'noopener', target: '_blank' },
    }));
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
  body.appendChild(el('section', { className: 'detail-section' }, [
    el('h3', { text: 'Actions' }),
    actions,
  ]));

  pane.hidden = false;
  ws.classList.add('has-detail');
}

function hideDetail() {
  document.getElementById('detail').hidden = true;
  document.getElementById('workspace').classList.remove('has-detail');
}

async function copyEntryJson(entry, statusEl) {
  // Strip private/internal fields before copy
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

// ---------- graph area ----------

function resetGraphArea() {
  clearGraph();
  document.getElementById('graph-empty').hidden = false;
  document.getElementById('graph-status').hidden = true;
  document.getElementById('zoom-controls').hidden = true;
  document.getElementById('graph-legend').hidden = true;
}

async function loadGraphFor(entry) {
  document.getElementById('graph-empty').hidden = true;
  const status = entry.status || 'pending';
  if (!entry.graph_url || status !== 'ok') {
    clearGraph();
    document.getElementById('graph-status').hidden = false;
    const statusMeta = STATUS_META[status] ?? { emoji: '', label: status };
    setStatusText(
      entry.graph_url
        ? `Graph not available (status: ${statusMeta.label}).`
        : 'This entry has no graph_url.',
      true,
    );
    document.getElementById('zoom-controls').hidden = true;
    document.getElementById('graph-legend').hidden = true;
    return;
  }
  document.getElementById('graph-status').hidden = false;
  setStatusText('Loading graph…', false, true);
  try {
    const result = await openGraph(entry, document.getElementById('graph-canvas'));
    document.getElementById('graph-status').hidden = true;
    document.getElementById('zoom-controls').hidden = false;
    if (result?.legend && result.legend.length) {
      renderLegend(result.legend);
    }
  } catch (err) {
    console.error(err);
    setStatusText(`Couldn't load graph: ${err.message}`, true);
    document.getElementById('zoom-controls').hidden = true;
    document.getElementById('graph-legend').hidden = true;
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

function renderLegend(items) {
  const legend = document.getElementById('graph-legend');
  legend.replaceChildren();
  for (const item of items) {
    const swatch = el('span', {
      className: 'legend-swatch',
      attrs: { style: `background:${item.color}` },
    });
    legend.appendChild(el('span', { className: 'legend-item' }, [
      swatch,
      el('span', { text: item.label }),
      el('span', { className: 'legend-count', text: String(item.count) }),
    ]));
  }
  legend.hidden = items.length === 0;
}

// ---------- wiring ----------

function bindToolbar() {
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    state.q = q.value;
    applyFilters();
  });
  const fmt = document.getElementById('format');
  fmt.addEventListener('change', () => {
    state.format = fmt.value;
    applyFilters();
  });
}

function bindDetail() {
  document.getElementById('detail-close').addEventListener('click', deselect);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const detail = document.getElementById('detail');
      if (!detail.hidden) deselect();
    }
  });
}

function bindZoom() {
  const inBtn = document.getElementById('zoom-in');
  const outBtn = document.getElementById('zoom-out');
  const fitBtn = document.getElementById('zoom-fit');
  inBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'in' } })));
  outBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'out' } })));
  fitBtn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'fit' } })));
}

document.addEventListener('DOMContentLoaded', () => {
  bindToolbar();
  bindDetail();
  bindZoom();
  loadRegistry();
});
