// understand-quickly — registry browser.
// Loads ./registry.json, renders the sidebar list of entries, and drives the
// graph viewer + detail pane on selection. All user-supplied values are
// rendered via textContent / createElement / attribute setters — never
// innerHTML with untrusted data.

import { openGraph, clearGraph } from './viewer.js?v=20260507b';

const PAGE_VERSION = '20260507b';
const MOBILE_BREAKPOINT = 800;

function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}
const DIAG_ENABLED = (typeof window !== 'undefined')
  && /[?&]diag=1\b/.test(window.location.search || '');

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

// If the registry is empty/failed, surface a friendly hint in the main pane
// so the page never looks blank. The default graph-empty markup already
// covers the "no entry selected" case; here we just append a small notice.
function renderEmptyMainStateIfNeeded(msg) {
  const empty = document.getElementById('graph-empty');
  if (!empty) return;
  // Remove any prior fallback we appended
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

  if (isMobile()) {
    // Mobile: skip detail pane; load graph immediately and surface
    // a "Details" pill for users who want metadata.
    hideDetail();
    showDetailsPill();
  } else {
    showDetail(entry);
  }
  loadGraphFor(entry);
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

  // Primary: Visualize graph (renders in-page, never navigates)
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

  // Secondary, demoted raw-URL access for agents/devs
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

  // Bottom-sheet treatment on mobile
  if (isMobile()) {
    pane.classList.add('is-sheet');
    pane.setAttribute('aria-modal', 'true');
    if (scrim) scrim.hidden = false;
    // Trigger transition next frame
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

// Run the same in-page visualize path used by selection. On mobile this
// closes the bottom sheet first so the graph fills the viewport.
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
  // Hide after transition completes (mirrors --transition-sheet timing)
  const wasSheet = pane.classList.contains('is-sheet');
  if (wasSheet) {
    setTimeout(() => {
      // Only hide if still closed (user didn't reopen)
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
  refreshEmptyStateCta();
}

// On mobile, when the graph pane is shown but no entry is selected, surface
// a "Pick an entry below" CTA pointing at the sidebar strip. We add it lazily
// to the existing empty-state markup so the desktop copy stays untouched.
function refreshEmptyStateCta() {
  const empty = document.getElementById('graph-empty');
  if (!empty) return;
  const prior = empty.querySelector('.pick-entry-cta');
  if (prior) prior.remove();
  if (!isMobile()) return;
  if (state.entries.length === 0) return; // fallback-notice already covers
  const cta = el('div', { className: 'pick-entry-cta' }, [
    el('span', { className: 'pick-entry-arrow', text: '↓', attrs: { 'aria-hidden': 'true' } }),
    el('span', { text: 'Pick an entry below' }),
  ]);
  empty.appendChild(cta);
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
    // xyflow-style chip: <div class="legend-chip" style="--c: #...;">
    //   <span class="dot"></span> file <span class="count">12</span>
    // </div>
    const chip = el('div', {
      className: 'legend-chip',
      attrs: { style: `--c: ${item.color};` },
    }, [
      el('span', { className: 'dot' }),
      el('span', { text: item.label }),
      el('span', { className: 'count', text: String(item.count) }),
    ]);
    legend.appendChild(chip);
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
  document.getElementById('detail-close').addEventListener('click', () => {
    if (isMobile() && state.selectedId) {
      // On mobile, just close the sheet but keep graph + pill alive.
      hideDetail();
      showDetailsPill();
    } else {
      deselect();
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const detail = document.getElementById('detail');
      if (!detail.hidden) {
        if (isMobile() && state.selectedId) {
          hideDetail();
          showDetailsPill();
        } else {
          deselect();
        }
      }
    }
  });

  // Scrim tap dismisses the bottom sheet on mobile
  const scrim = document.getElementById('detail-scrim');
  if (scrim) {
    scrim.addEventListener('click', () => {
      hideDetail();
      if (isMobile() && state.selectedId) showDetailsPill();
    });
  }

  // Details pill reopens the bottom sheet
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

  // Bottom-sheet drag-to-dismiss (touch only — keeps iOS Safari happy)
  bindSheetDrag();

  // Re-evaluate layout when the user crosses the breakpoint
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  }
}

function handleResize() {
  const entry = getSelectedEntry();
  if (!entry) {
    // No selection — make sure stray UI isn't hanging around.
    hideDetailsPill();
    refreshEmptyStateCta();
    return;
  }
  const pane = document.getElementById('detail');
  const scrim = document.getElementById('detail-scrim');
  const isSheet = pane.classList.contains('is-sheet');
  if (isMobile()) {
    // Crossed into mobile: hide any inline desktop pane and surface the pill.
    if (!pane.hidden && !isSheet) {
      // Was inline desktop pane: collapse it; user can tap pill to reopen.
      pane.hidden = true;
      document.getElementById('workspace').classList.remove('has-detail');
    }
    if (!(isSheet && pane.classList.contains('is-open'))) {
      showDetailsPill();
    }
  } else {
    // Desktop: pill is meaningless; ensure detail pane is shown side-by-side.
    hideDetailsPill();
    pane.classList.remove('is-sheet', 'is-open');
    pane.style.transform = '';
    if (scrim) {
      scrim.hidden = true;
      scrim.classList.remove('is-open');
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

// ---------- diagnostics + global error handlers ----------

function paintGlobalError(label, detail) {
  // Always paint into the inline error banner so the page is never blank.
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
    loadRegistry();
    updateDiagPanel();
  } catch (err) {
    console.error(err);
    paintGlobalError('Init failed', (err && err.message) || String(err));
    updateDiagPanel();
  }
});
