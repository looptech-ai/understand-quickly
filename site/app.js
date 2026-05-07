// understand-quickly — registry browser
// Loads ./registry.json, renders cards, owns search/filter/viewer wiring.
// All user-supplied values are written via textContent; never innerHTML.

import { openViewer, closeViewer } from './viewer.js';

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

// ---------- state ----------

const state = {
  entries: [],
  filtered: [],
  q: '',
  format: '',
  statuses: new Set(DEFAULT_STATUSES),
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
        `generated ${relativeTime(data.generated_at)}`;
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
  // Preserve current selection if still present
  const current = state.format;
  // Clear (keep "All formats" option)
  while (sel.children.length > 1) sel.removeChild(sel.lastChild);
  const formats = [...new Set(state.entries.map((e) => e.format).filter(Boolean))].sort();
  for (const f of formats) {
    sel.appendChild(el('option', { text: f, attrs: { value: f } }));
  }
  if (formats.includes(current)) sel.value = current;
}

function populateStatusFilter() {
  const fs = document.getElementById('status-filter');
  // Discover statuses present in data, plus the default pair so users can always toggle them.
  const present = new Set(state.entries.map((e) => e.status || 'pending'));
  for (const s of DEFAULT_STATUSES) present.add(s);
  const ordered = [
    'ok', 'pending', 'missing', 'invalid',
    'oversize', 'transient_error', 'dead', 'renamed',
  ].filter((s) => present.has(s));

  // Re-render. Preserve current toggle state.
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
      el('span', { text: `${meta.emoji} ${meta.label}` }),
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
  const grid = document.getElementById('cards');
  const empty = document.getElementById('empty');
  const meta = document.getElementById('results-meta');

  grid.replaceChildren();

  if (state.entries.length === 0) {
    empty.hidden = false;
    meta.textContent = '';
    return;
  }
  empty.hidden = true;

  if (state.filtered.length === 0) {
    meta.textContent = `No entries match the current filters (${state.entries.length} total).`;
    return;
  }

  meta.textContent = `Showing ${state.filtered.length} of ${state.entries.length} entries.`;

  for (const entry of state.filtered) {
    grid.appendChild(renderCard(entry));
  }
}

function renderCard(entry) {
  const status = entry.status || 'pending';
  const statusMeta = STATUS_META[status] ?? { emoji: '', label: status };

  const repoUrl = entry.id
    ? `https://github.com/${entry.id}`
    : null;

  const idLink = repoUrl
    ? el('a', { text: entry.id, attrs: { href: repoUrl, rel: 'noopener', target: '_blank' } })
    : el('span', { text: entry.id ?? '(unknown)' });

  const head = el('div', { className: 'card-head' }, [
    el('h3', { className: 'card-id' }, [idLink]),
    el('span', {
      className: 'status',
      attrs: { 'data-status': status, title: `status: ${statusMeta.label}` },
      text: `${statusMeta.emoji} ${statusMeta.label}`,
    }),
  ]);

  const desc = el('p', {
    className: 'card-desc',
    text: entry.description || 'No description provided.',
  });

  const metaRow = el('div', { className: 'meta-row' }, [
    el('span', { className: 'format-badge', text: entry.format || 'unknown' }),
    el('span', { text: relativeTime(entry.last_synced) }),
  ]);

  const tagWrap = el('div', { className: 'tags' });
  if (Array.isArray(entry.tags)) {
    for (const tag of entry.tags) {
      tagWrap.appendChild(el('span', { className: 'tag', text: tag }));
    }
  }

  const viewBtn = el('button', {
    className: 'btn btn-primary',
    attrs: { type: 'button' },
    text: 'View graph',
  });
  if (!entry.graph_url || status !== 'ok') {
    viewBtn.disabled = true;
    viewBtn.title = status === 'ok'
      ? 'No graph URL on this entry'
      : `Graph not available (status: ${statusMeta.label})`;
  } else {
    viewBtn.addEventListener('click', () => openViewer(entry));
  }

  const sourceBtn = el('a', {
    className: 'btn',
    text: 'Source repo',
    attrs: repoUrl
      ? { href: repoUrl, rel: 'noopener', target: '_blank' }
      : { href: '#', 'aria-disabled': 'true' },
  });
  if (!repoUrl) sourceBtn.classList.add('btn-disabled');

  const actions = el('div', { className: 'card-actions' }, [viewBtn, sourceBtn]);

  return el('article', { className: 'card' }, [head, desc, metaRow, tagWrap, actions]);
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

function bindModal() {
  document.getElementById('viewer-close').addEventListener('click', closeViewer);
  document.getElementById('viewer').addEventListener('click', (ev) => {
    if (ev.target.id === 'viewer') closeViewer();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeViewer();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindToolbar();
  bindModal();
  loadRegistry();
});
