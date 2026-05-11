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
} from './viewer.js?v=20260511a';

const PAGE_VERSION = '20260511a';
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

// One-sentence descriptions surfaced as native tooltips on every status chip.
const STATUS_DESCRIPTIONS = {
  ok:              'Graph fetched, schema-valid, and tracked at the current commit.',
  pending:         'New entry — graph not yet fetched or validated by the sync job.',
  missing:         'graph_url returned 404. The producer may have moved or deleted it.',
  invalid:         'Graph fetched but failed schema validation. Producer needs to fix it.',
  oversize:        'Graph exceeds the registry size budget; skipped to keep the index lean.',
  transient_error: 'Last fetch failed with a retryable error (5xx, timeout). Will retry.',
  dead:            'Repeated failures exceeded the miss budget. Entry will be removed soon.',
  renamed:         'Repo was renamed upstream; pointer updated, awaiting next successful sync.',
};

const DEFAULT_STATUSES = new Set(['ok', 'pending']);

const state = {
  entries: [],
  filtered: [],
  q: '',
  format: '',
  statuses: new Set(DEFAULT_STATUSES),
  selectedId: null,
  graphSearchMatches: [],
  graphSearchIdx: 0,
  legend: [],
  layout: 'force',
  tourSteps: [],
  ggPending: false,
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

// Build a Discussions search URL for an entry.
// Slug rule: replace `/` with `--` and lowercase.
function buildDiscussUrl(entryId) {
  if (!entryId) return null;
  const slug = String(entryId).toLowerCase().replace(/\//g, '--');
  const q = `label:entry-${slug} OR "${entryId}"`;
  return `https://github.com/looptech-ai/understand-quickly/discussions?discussions_q=${encodeURIComponent(q)}`;
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
    updateHeroCounters();
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
    updateHeroCounters();
  } finally {
    updateDiagPanel();
  }
}

// ---------- hero band: counters, MCP copy, find-your-repo, onboarding ----------

function updateHeroCounters() {
  const reposEl = document.getElementById('counter-repos');
  const formatsEl = document.getElementById('counter-formats');
  if (!reposEl || !formatsEl) return;
  if (state.entries.length === 0) {
    // Leave skeleton placeholders if fetch failed; otherwise show 0.
    if (lastRegistryStatus.startsWith('error')) return;
    reposEl.textContent = '0';
    reposEl.removeAttribute('data-skeleton');
    formatsEl.textContent = '0';
    formatsEl.removeAttribute('data-skeleton');
    return;
  }
  const formats = new Set(state.entries.map((e) => e.format).filter(Boolean));
  reposEl.textContent = String(state.entries.length);
  reposEl.removeAttribute('data-skeleton');
  formatsEl.textContent = String(formats.size);
  formatsEl.removeAttribute('data-skeleton');
}

function bindHeroMcpCopy() {
  const btn = document.getElementById('hero-mcp-copy');
  const pre = document.getElementById('hero-mcp-snippet');
  if (!btn || !pre) return;
  const label = btn.querySelector('.hero-mcp-copy-label');
  btn.addEventListener('click', async () => {
    const text = pre.textContent || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older Safari: select + execCommand
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
      }
      btn.classList.add('is-copied');
      if (label) label.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('is-copied');
        if (label) label.textContent = 'Copy';
      }, 1600);
    } catch (err) {
      console.error(err);
      if (label) label.textContent = 'Copy failed';
      setTimeout(() => { if (label) label.textContent = 'Copy'; }, 1600);
    }
  });
}

// Parse "owner/repo" out of either bare slug or any github.com URL. Returns
// null if the input doesn't look like a github repo reference.
function parseGithubInput(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // owner/repo (no slashes besides the single one)
  const slug = trimmed.match(/^([\w.\-]+)\/([\w.\-]+?)(?:\.git)?$/);
  if (slug) return { owner: slug[1], repo: slug[2] };
  // Any URL containing github.com/<owner>/<repo>
  try {
    const url = trimmed.startsWith('http') ? new URL(trimmed) : new URL('https://' + trimmed);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch (_) {
    return null;
  }
}

function bindHeroFind() {
  const form = document.getElementById('hero-find');
  const input = document.getElementById('hero-find-input');
  const result = document.getElementById('hero-find-result');
  if (!form || !input || !result) return;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    result.replaceChildren();
    result.hidden = true;
    result.classList.remove('is-found', 'is-missing');
    const parsed = parseGithubInput(input.value);
    if (!parsed) {
      result.hidden = false;
      result.classList.add('is-missing');
      result.appendChild(document.createTextNode('Could not parse that — try '));
      const code = el('code', { text: 'owner/repo' });
      result.appendChild(code);
      result.appendChild(document.createTextNode(' or a github.com URL.'));
      return;
    }
    const wantId = `${parsed.owner}/${parsed.repo}`;
    const hit = state.entries.find((e) => {
      if (!e) return false;
      if (e.id && e.id.toLowerCase() === wantId.toLowerCase()) return true;
      if (e.owner && e.repo
          && e.owner.toLowerCase() === parsed.owner.toLowerCase()
          && e.repo.toLowerCase() === parsed.repo.toLowerCase()) return true;
      return false;
    });
    result.hidden = false;
    if (hit) {
      result.classList.add('is-found');
      result.appendChild(document.createTextNode('Found '));
      const strong = el('strong', { text: hit.id });
      result.appendChild(strong);
      result.appendChild(document.createTextNode(' — '));
      const open = el('a', {
        text: 'open graph',
        attrs: { href: `?entry=${encodeURIComponent(hit.id)}`, role: 'button' },
      });
      open.addEventListener('click', (e) => {
        e.preventDefault();
        selectEntry(hit);
      });
      const actions = el('span', { className: 'hero-find-actions' }, [open]);
      result.appendChild(actions);
    } else {
      result.classList.add('is-missing');
      result.appendChild(document.createTextNode('Not indexed yet — '));
      const strong = el('strong', { text: wantId });
      result.appendChild(strong);
      result.appendChild(document.createTextNode('. Want to add it? '));
      const wizard = el('a', {
        text: 'Wizard',
        attrs: { href: `./add.html?owner=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}` },
      });
      const cli = el('a', {
        text: 'CLI',
        attrs: {
          href: 'https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      });
      const manual = el('a', {
        text: 'Manual PR',
        attrs: {
          href: 'https://github.com/looptech-ai/understand-quickly/blob/main/CONTRIBUTING.md',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      });
      const actions = el('span', { className: 'hero-find-actions' }, [wizard, cli, manual]);
      result.appendChild(actions);
    }
  });
}

// First-visit onboarding overlay. 4 steps, dismiss persists in localStorage.
// Each step's `parts` is an array of strings (rendered as text) or
// { kbd: '?' } objects (rendered as <kbd>) — we never use innerHTML so this
// stays safe even though all values here are hardcoded literals.
const ONBOARDING_KEY = 'uq:onboarded';
const ONBOARDING_STEPS = [
  { anchor: 'sidebar', parts: ['← Pick a repo from the sidebar to load its graph.'] },
  { anchor: 'main',    parts: ['→ The graph viewer shows the code’s structure — files, functions, and how they connect.'] },
  { anchor: 'hover',   parts: ['Hover any node to focus its neighbors. Right-click for more options.'] },
  { anchor: 'keyboard', parts: [
    'Press ', { kbd: '?' }, ' for keyboard shortcuts, or ', { kbd: '/' }, ' to focus search.',
  ] },
];

function isOnboarded() {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1'; }
  catch (_) { return false; }
}

function markOnboarded() {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); }
  catch (_) { /* private mode — silently ignore */ }
}

function renderOnboardingStep(textEl, step) {
  textEl.replaceChildren();
  for (const part of step.parts) {
    if (typeof part === 'string') {
      textEl.appendChild(document.createTextNode(part));
    } else if (part && part.kbd) {
      textEl.appendChild(el('kbd', { text: part.kbd }));
    }
  }
}

function bindOnboarding() {
  if (isOnboarded()) return;
  // Skip if the visitor deep-linked to a specific entry — they already know
  // what they're doing.
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('entry')) return;
    // Also skip in automated/test contexts (Playwright, headless drivers) so
    // the overlay never intercepts smoke-test clicks.
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
  } catch (_) { /* noop */ }

  const overlay = document.getElementById('onboarding-overlay');
  const card = document.getElementById('onboarding-card');
  const textEl = document.getElementById('onboarding-text');
  const stepEl = document.getElementById('onboarding-step-num');
  const prevBtn = document.getElementById('onboarding-prev');
  const nextBtn = document.getElementById('onboarding-next');
  const skipBtn = document.getElementById('onboarding-skip');
  if (!overlay || !card || !textEl || !stepEl || !prevBtn || !nextBtn || !skipBtn) return;

  let idx = 0;

  function render() {
    const step = ONBOARDING_STEPS[idx];
    if (!step) return;
    card.setAttribute('data-anchor', step.anchor);
    stepEl.textContent = `${idx + 1} of ${ONBOARDING_STEPS.length}`;
    renderOnboardingStep(textEl, step);
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === ONBOARDING_STEPS.length - 1 ? 'Got it' : 'Next';
  }

  function close() {
    overlay.hidden = true;
    markOnboarded();
  }

  prevBtn.addEventListener('click', () => {
    if (idx > 0) { idx -= 1; render(); }
  });
  nextBtn.addEventListener('click', () => {
    if (idx < ONBOARDING_STEPS.length - 1) { idx += 1; render(); }
    else close();
  });
  skipBtn.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => {
    if (overlay.hidden) return;
    if (ev.key === 'Escape') { close(); }
    else if (ev.key === 'ArrowRight') { nextBtn.click(); }
    else if (ev.key === 'ArrowLeft') { prevBtn.click(); }
  });

  // Show after a short delay so the page settles first.
  setTimeout(() => {
    if (isOnboarded()) return;
    overlay.hidden = false;
    render();
    try { card.focus(); } catch (_) { /* noop */ }
  }, 600);
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
  const card = el('div', {
    className: `entry-card${isSelected ? ' is-selected' : ''}`,
    attrs: { role: 'option', 'aria-selected': isSelected ? 'true' : 'false' },
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
      attrs: {
        'data-status': status,
        title: STATUS_DESCRIPTIONS[status]
          ? `${statusMeta.label} — ${STATUS_DESCRIPTIONS[status]}`
          : `status: ${statusMeta.label}`,
      },
      text: `${statusMeta.emoji} ${statusMeta.label}`,
    }),
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
        attrs: {
          'data-status': status,
          title: STATUS_DESCRIPTIONS[status]
            ? `${statusMeta.label} — ${STATUS_DESCRIPTIONS[status]}`
            : `status: ${statusMeta.label}`,
        },
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
    const discussUrl = buildDiscussUrl(entry.id);
    if (discussUrl) {
      actions.appendChild(el('a', {
        className: 'btn btn-ghost detail-discuss-link',
        text: 'Discuss ↗',
        attrs: {
          href: discussUrl,
          rel: 'noopener',
          target: '_blank',
          title: 'Open Discussions tagged with this entry id.',
        },
      }));
    }
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
    const rh = document.getElementById('restore-hidden');
    if (rh) rh.hidden = true;
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
    const lt = document.getElementById('layout-toggle');
    if (lt) lt.hidden = false;
    syncLayoutToggleUI();
    bindNetworkInteractions(result.viewer);
    if (opts.deeplink) {
      applyDeeplinkToViewer(result.viewer, opts.deeplink);
    }
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

function bindNetworkInteractions(viewer) {
  if (!viewer || !viewer.network) return;
  viewer.network.on('oncontext', (params) => {
    if (params && params.event && params.event.preventDefault) params.event.preventDefault();
    const nodeId = viewer.network.getNodeAt(params.pointer.DOM);
    if (nodeId == null) {
      hideContextMenu();
      return;
    }
    showContextMenu(viewer, nodeId, params.event);
  });
  viewer.network.on('click', (params) => {
    hideContextMenu();
    const nodeId = (params && params.nodes && params.nodes.length) ? params.nodes[0] : null;
    if (nodeId != null) {
      if (Tour.isActive()) {
        try { Tour.syncToSelectedNode(nodeId); } catch (_) { /* noop */ }
      } else if (!isMobile() && state.selectedId) {
        const cur = getSelectedEntry();
        if (cur) showDetail(cur);
      }
    }
    updateDeeplink();
  });
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
  c.textContent = `${current} of ${total}`;
  c.hidden = false;
}

function hideSearchCounter() {
  const c = document.getElementById('search-counter');
  if (c) c.hidden = true;
}

// ---------- guided tour ----------

const TOUR_AUTOSHOW_KEY = 'uq:tour-autoshown';
const TOUR_AUTO_ADVANCE_MS = 6000;
const TOUR_DESKTOP_BP = '(min-width: 800px)';

function tourPrefersReducedMotion() {
  return PREFERS_REDUCED;
}

function tourIsDesktop() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(TOUR_DESKTOP_BP).matches;
}

const Tour = (() => {
  let steps = [];
  let net = null;
  let idx = 0;
  let active = false;
  let playing = true;
  let timer = null;
  let triggerEl = null;
  let speed = 1;
  let outlineExpanded = true;
  let priorDetailVisible = false;
  let exploreNodeId = null;

  function gid(id) { return document.getElementById(id); }

  function panel()           { return gid('tour-panel'); }
  function startBtn()        { return gid('tour-start'); }
  function counterEl()       { return gid('tour-counter'); }
  function progressBarEl()   { return gid('tour-progress-bar'); }
  function kindChipEl()      { return gid('tour-kind'); }
  function labelEl()         { return gid('tour-label'); }
  function textEl()          { return gid('tour-text'); }
  function githubEl()        { return gid('tour-github'); }
  function discussEl()       { return gid('tour-discuss'); }
  function neighborsSecEl()  { return gid('tour-neighbors-section'); }
  function neighborsEl()     { return gid('tour-neighbors'); }
  function relatedSecEl()    { return gid('tour-related-section'); }
  function relatedEl()       { return gid('tour-related'); }
  function outlineEl()       { return gid('tour-outline'); }
  function outlineToggleEl() { return gid('tour-outline-toggle'); }
  function liveEl()          { return gid('tour-live'); }
  function pauseBtnEl()      { return gid('tour-pause'); }
  function pauseLblEl()      { return gid('tour-pause-label'); }
  function nextBtnEl()       { return gid('tour-next'); }
  function speedSelEl()      { return gid('tour-speed'); }
  function stepStripEl()     { return gid('tour-step-strip'); }

  function attach(newSteps, network) {
    steps = Array.isArray(newSteps) ? newSteps.filter(Boolean) : [];
    net = network || null;
    active = false;
    idx = 0;
    playing = true;
    exploreNodeId = null;
    stopTimer();
    if (typeof document !== 'undefined' && document.body) {
      delete document.body.dataset.tourRunning;
    }
    const sb = startBtn();
    if (sb) sb.hidden = steps.length === 0;
    const p = panel();
    if (p) {
      p.hidden = true;
      p.classList.remove('is-open');
    }
    const strip = stepStripEl();
    if (strip) strip.hidden = true;
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

  function start(triggerElement) {
    if (!steps.length) return;
    triggerEl = triggerElement || startBtn();
    active = true;
    idx = 0;
    exploreNodeId = null;
    playing = !tourPrefersReducedMotion();
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.tourRunning = 'true';
    }
    syncSpeedUI();

    const isDesktop = tourIsDesktop();
    if (isDesktop) {
      const detailPane = document.getElementById('detail');
      priorDetailVisible = !!(detailPane && !detailPane.hidden);
      const strip = stepStripEl();
      if (strip) strip.hidden = false;
    } else {
      priorDetailVisible = false;
    }

    const p = panel();
    if (p) {
      p.hidden = false;
      requestAnimationFrame(() => p.classList.add('is-open'));
    }
    renderOutline();
    renderStepStrip();
    renderStep();
    syncPauseLabel();
    schedule();
    if (p && typeof p.focus === 'function') {
      try { p.focus({ preventScroll: true }); } catch (_) { p.focus(); }
    }
  }

  function exit() {
    const wasActive = active;
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
    const strip = stepStripEl();
    if (strip) strip.hidden = true;
    if (wasActive && priorDetailVisible && tourIsDesktop()) {
      const entry = getSelectedEntry();
      if (entry && !isMobile()) {
        showDetail(entry);
      }
    }
    priorDetailVisible = false;
    exploreNodeId = null;
    if (triggerEl && typeof triggerEl.focus === 'function') {
      try { triggerEl.focus({ preventScroll: true }); } catch (_) { /* ok */ }
    } else {
      const card = state.selectedId
        ? document.querySelector('.entry-card.is-selected')
        : null;
      if (card && typeof card.focus === 'function') {
        try { card.focus({ preventScroll: true }); } catch (_) { /* ok */ }
      }
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
    exploreNodeId = null;
    renderStep();
    schedule();
  }

  function prev() {
    if (!active || !steps.length) return;
    idx = Math.max(0, idx - 1);
    exploreNodeId = null;
    renderStep();
    schedule();
  }

  function jumpTo(i) {
    if (!active || !steps.length) return;
    idx = Math.max(0, Math.min(steps.length - 1, i));
    exploreNodeId = null;
    renderStep();
    schedule();
  }

  function togglePlay() {
    playing = !playing;
    syncPauseLabel();
    if (playing) {
      schedule();
    } else {
      stopTimer();
    }
  }

  function setSpeed(s) {
    const v = parseFloat(s);
    if (!Number.isFinite(v) || v <= 0) return;
    speed = v;
    syncSpeedUI();
    schedule();
  }

  function cycleSpeed(dir) {
    const ladder = [0.5, 1, 1.5, 2];
    let i = ladder.indexOf(speed);
    if (i < 0) i = 1;
    i = Math.max(0, Math.min(ladder.length - 1, i + (dir > 0 ? 1 : -1)));
    setSpeed(ladder[i]);
  }

  function schedule() {
    stopTimer();
    if (!active || !playing || tourPrefersReducedMotion()) return;
    const interval = Math.max(1000, Math.round(TOUR_AUTO_ADVANCE_MS / speed));
    timer = setInterval(() => {
      if (idx >= steps.length - 1) { stopTimer(); return; }
      next();
    }, interval);
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
    if (lbl) lbl.textContent = playing ? 'Pause' : 'Play';
    if (btn) {
      btn.setAttribute('aria-label', playing ? 'Pause auto-advance' : 'Resume auto-advance');
      const icon = btn.querySelector('.tour-pause-icon');
      if (icon) icon.textContent = playing ? '⏸' : '▶';
    }
  }

  function syncSpeedUI() {
    const sel = speedSelEl();
    if (sel) sel.value = String(speed);
  }

  function currentStep() {
    return steps[idx] || null;
  }

  function activeNodeId() {
    return exploreNodeId != null ? exploreNodeId : (currentStep() ? currentStep().id : null);
  }

  function getNeighbors(nodeId, max = 8) {
    const v = getPrimaryViewer();
    if (!v || !nodeId) return [];
    const adj = v._adj || (v._adj = v._buildAdjacency());
    const nbrs = adj.get(nodeId);
    if (!nbrs) return [];
    const out = [];
    for (const id of nbrs) {
      const node = v.allNodes.find((n) => n.id === id);
      if (!node) continue;
      out.push({
        id,
        label: String(node.label || id),
        kind: v._kindByNode.get(id) || '',
      });
      if (out.length >= max) break;
    }
    return out;
  }

  function getRelatedConcepts(nodeId, max = 12) {
    const v = getPrimaryViewer();
    if (!v || !nodeId) return [];
    const adj = v._adj || (v._adj = v._buildAdjacency());
    const nbrs = adj.get(nodeId);
    if (!nbrs) return [];
    const want = new Set(['concept', 'module', 'service']);
    const seen = new Set();
    const out = [];
    for (const id of nbrs) {
      const k = v._kindByNode.get(id);
      if (!k || !want.has(k)) continue;
      const node = v.allNodes.find((n) => n.id === id);
      if (!node) continue;
      const lbl = String(node.label || id);
      if (seen.has(lbl)) continue;
      seen.add(lbl);
      out.push({ id, label: lbl, kind: k });
      if (out.length >= max) break;
    }
    return out;
  }

  function getGithubUrl(nodeId) {
    const v = getPrimaryViewer();
    if (!v || !nodeId || !v.entry) return null;
    const norm = v.normalized && v.normalized.nodes.find((n) => String(n.id) === String(nodeId));
    return buildGithubUrlForNode(v.entry, norm);
  }

  function jumpToNode(nodeId) {
    if (!active) return;
    const i = steps.findIndex((s) => s.id === nodeId);
    if (i >= 0) {
      jumpTo(i);
    } else {
      exploreNodeId = nodeId;
      const v = getPrimaryViewer();
      if (v && v.network) {
        try { v.network.selectNodes([nodeId]); } catch (_) { /* noop */ }
        try { v.focusNodes([nodeId]); } catch (_) { /* noop */ }
      }
      renderActiveCard();
      renderNeighbors();
      renderRelated();
      stopTimer();
    }
  }

  function syncToSelectedNode(nodeId) {
    if (!active || !nodeId) return;
    if (nodeId === activeNodeId()) return;
    const i = steps.findIndex((s) => s.id === nodeId);
    if (i >= 0) {
      idx = i;
      exploreNodeId = null;
    } else {
      exploreNodeId = nodeId;
    }
    renderActiveCard();
    renderNeighbors();
    renderRelated();
    renderProgress();
    renderOutlineSelection();
    renderStepStripSelection();
  }

  function renderStep() {
    if (!steps.length) return;
    renderActiveCard();
    renderNeighbors();
    renderRelated();
    renderProgress();
    renderOutlineSelection();
    renderStepStripSelection();
    renderNextLabel();
    const step = currentStep();
    if (net && step && step.id) {
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

  function renderActiveCard() {
    const step = currentStep();
    const nodeId = activeNodeId();
    if (!step) return;
    const chip = kindChipEl();
    if (chip) {
      let kind = step.kind || '';
      if (exploreNodeId != null) {
        const v = getPrimaryViewer();
        const k = v ? v._kindByNode.get(nodeId) : null;
        if (k) kind = k;
      }
      chip.textContent = kind || '—';
      chip.dataset.kind = kind || '';
    }
    let label = step.label || step.id;
    let prose = step.text || step.label || step.id;
    if (exploreNodeId != null) {
      const v = getPrimaryViewer();
      const node = v ? v.allNodes.find((n) => n.id === nodeId) : null;
      if (node) label = String(node.label || nodeId);
      const norm = v && v.normalized && v.normalized.nodes.find((n) => String(n.id) === String(nodeId));
      if (norm && norm._raw) {
        const r = norm._raw;
        const props = r.properties || {};
        prose = r.summary || props.description || props.summary
                || (node ? String(node.label || nodeId) : '');
      }
    }
    const lbl = labelEl();
    if (lbl) lbl.textContent = String(label);
    const txt = textEl();
    if (txt) txt.textContent = String(prose || '');
    const gh = githubEl();
    if (gh) {
      const url = getGithubUrl(nodeId);
      if (url) {
        gh.href = url;
        gh.hidden = false;
      } else {
        gh.removeAttribute('href');
        gh.hidden = true;
      }
    }
    const dis = discussEl();
    if (dis) {
      const v = getPrimaryViewer();
      const entry = v && v.entry;
      const url = entry && entry.id ? buildDiscussUrl(entry.id) : null;
      if (url) {
        dis.href = url;
        dis.hidden = false;
      } else {
        dis.removeAttribute('href');
        dis.hidden = true;
      }
    }
    const live = liveEl();
    if (live) live.textContent = `Step ${idx + 1} of ${steps.length}: ${label}`;
  }

  function renderNeighbors() {
    const wrap = neighborsSecEl();
    const list = neighborsEl();
    if (!wrap || !list) return;
    list.replaceChildren();
    const nodeId = activeNodeId();
    const items = getNeighbors(nodeId, 8);
    if (!items.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    for (const it of items) {
      const dot = el('span', {
        className: 'tour-neighbor-dot',
        attrs: it.kind
          ? { style: `background: var(--node-${it.kind}, var(--color-text-muted));` }
          : {},
      });
      const lbl = el('span', { className: 'tour-neighbor-label', text: it.label });
      const btn = el('button', {
        className: 'tour-neighbor-jump',
        attrs: { type: 'button', title: 'Jump to neighbor' },
        text: '→ Jump',
      });
      btn.addEventListener('click', () => jumpToNode(it.id));
      const li = el('li', { className: 'tour-neighbor' }, [dot, lbl, btn]);
      list.appendChild(li);
    }
  }

  function renderRelated() {
    const wrap = relatedSecEl();
    const cloud = relatedEl();
    if (!wrap || !cloud) return;
    cloud.replaceChildren();
    const nodeId = activeNodeId();
    const items = getRelatedConcepts(nodeId, 12);
    if (!items.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    for (const it of items) {
      const chip = el('button', {
        className: 'tour-related-chip',
        attrs: {
          type: 'button',
          title: `Jump to ${it.label}`,
          'data-kind': it.kind || '',
          style: it.kind ? `color: var(--node-${it.kind}, var(--color-accent));` : '',
        },
        text: it.label,
      });
      chip.addEventListener('click', () => jumpToNode(it.id));
      cloud.appendChild(chip);
    }
  }

  function renderProgress() {
    const counter = counterEl();
    if (counter) counter.textContent = `${idx + 1} of ${steps.length}`;
    const bar = progressBarEl();
    if (bar) {
      const pct = steps.length > 1 ? ((idx) / (steps.length - 1)) * 100 : 100;
      bar.style.width = `${pct.toFixed(1)}%`;
    }
  }

  function renderNextLabel() {
    const nb = nextBtnEl();
    if (!nb) return;
    const isLast = idx === steps.length - 1;
    const lblSpan = nb.querySelector('.tour-btn-label');
    if (lblSpan) lblSpan.textContent = isLast ? 'Restart' : 'Next';
    nb.setAttribute('aria-label', isLast ? 'Restart tour' : 'Next step');
  }

  function renderOutline() {
    const ul = outlineEl();
    const toggle = outlineToggleEl();
    if (!ul) return;
    if (toggle) toggle.setAttribute('aria-expanded', outlineExpanded ? 'true' : 'false');
    ul.replaceChildren();
    if (!steps.length) return;
    steps.forEach((s, i) => {
      const item = el('button', {
        className: 'tour-outline-item',
        attrs: {
          type: 'button',
          role: 'option',
          'aria-selected': i === idx ? 'true' : 'false',
          'data-step-index': String(i),
          title: s.label || s.id,
        },
      }, [
        el('span', { className: 'tour-outline-item-index', text: String(i + 1) }),
        el('span', {
          className: 'tour-outline-item-dot',
          attrs: s.kind
            ? { style: `background: var(--node-${s.kind}, var(--color-text-muted));` }
            : {},
        }),
        el('span', { className: 'tour-outline-item-label', text: String(s.label || s.id) }),
      ]);
      item.addEventListener('click', () => jumpTo(i));
      item.addEventListener('mouseenter', () => {
        const v = getPrimaryViewer();
        if (v && s.id) {
          try { v.pulse([s.id]); } catch (_) { /* noop */ }
        }
      });
      ul.appendChild(item);
    });
  }

  function renderOutlineSelection() {
    const ul = outlineEl();
    if (!ul) return;
    const items = ul.querySelectorAll('.tour-outline-item');
    items.forEach((item) => {
      const i = parseInt(item.getAttribute('data-step-index') || '-1', 10);
      const sel = i === idx;
      item.setAttribute('aria-selected', sel ? 'true' : 'false');
      if (sel) {
        try { item.scrollIntoView({ block: 'nearest' }); } catch (_) { /* noop */ }
      }
    });
  }

  function toggleOutline() {
    outlineExpanded = !outlineExpanded;
    const toggle = outlineToggleEl();
    if (toggle) toggle.setAttribute('aria-expanded', outlineExpanded ? 'true' : 'false');
  }

  function renderStepStrip() {
    const strip = stepStripEl();
    if (!strip) return;
    strip.replaceChildren();
    if (!steps.length || !tourIsDesktop()) {
      strip.hidden = true;
      return;
    }
    strip.hidden = !active;
    steps.forEach((s, i) => {
      const tile = el('button', {
        className: 'tour-step-tile',
        attrs: {
          type: 'button',
          'aria-label': `Step ${i + 1}: ${s.label || s.id}`,
          title: s.label || s.id,
          'aria-current': i === idx ? 'true' : 'false',
          'data-step-index': String(i),
        },
      }, [
        el('span', {
          className: 'tour-step-tile-dot',
          attrs: s.kind
            ? { style: `background: var(--node-${s.kind}, var(--color-text-muted));` }
            : {},
        }),
        el('span', { text: String(i + 1) }),
      ]);
      tile.addEventListener('click', () => jumpTo(i));
      strip.appendChild(tile);
    });
  }

  function renderStepStripSelection() {
    const strip = stepStripEl();
    if (!strip) return;
    const tiles = strip.querySelectorAll('.tour-step-tile');
    tiles.forEach((t) => {
      const i = parseInt(t.getAttribute('data-step-index') || '-1', 10);
      const sel = i === idx;
      t.setAttribute('aria-current', sel ? 'true' : 'false');
      if (sel) {
        try { t.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) { /* noop */ }
      }
    });
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

  return {
    attach,
    start,
    exit,
    next,
    prev,
    jumpTo,
    togglePlay,
    setSpeed,
    cycleSpeed,
    toggleOutline,
    syncToSelectedNode,
    isActive,
    isPlaying,
    handleVisibility,
  };
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
      chip.disabled = true;
      chip.setAttribute('aria-disabled', 'true');
    }
    legend.appendChild(chip);
  }
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
  const nowHidden = wasPressed;
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
    label: 'Expand 1-hop',
    fn: () => {
      // Lightweight: focus + select, then briefly pulse neighbors.
      try { viewer.network.selectNodes([String(nodeId)]); } catch (_) { /* noop */ }
      const adj = viewer._adj || (viewer._adj = viewer._buildAdjacency());
      const nbrs = adj.get(String(nodeId));
      if (nbrs && nbrs.size) {
        const ids = [String(nodeId), ...nbrs];
        viewer.focusNodes(ids);
        viewer.pulse(ids);
      } else {
        viewer.focusNodes([String(nodeId)]);
      }
    },
  });
  items.push({ label: 'Hide node', fn: () => { viewer.hideNode(String(nodeId)); refreshRestoreHidden(); } });
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

  const x = mouseEvent.clientX || (mouseEvent.touches && mouseEvent.touches[0]?.clientX) || 100;
  const y = mouseEvent.clientY || (mouseEvent.touches && mouseEvent.touches[0]?.clientY) || 100;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.hidden = false;
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth) menu.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
    if (r.bottom > window.innerHeight) menu.style.top = `${Math.max(8, window.innerHeight - r.height - 8)}px`;
  });

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

// ---------- layout toggle ----------

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
  if (q) {
    state.q = q;
    const qInput = document.getElementById('q');
    if (qInput) qInput.value = q;
    applyFilters();
  }
  selectEntry(entry, {
    layout,
    deeplink: { node, q, kindParam },
  });
}

function applyDeeplinkToViewer(viewer, dl) {
  if (!viewer) return;
  if (dl.kindParam) {
    const kinds = dl.kindParam.split(',').map((s) => s.trim())
      .filter((s) => s.startsWith('-')).map((s) => s.slice(1));
    for (const k of kinds) {
      viewer.kindHidden.add(k);
    }
    viewer.applyVisibility();
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
}

// ---------- wiring ----------

function bindToolbar() {
  const form = document.getElementById('toolbar');
  if (form) {
    // Prevent the default form submit (which would reload the page when a
    // user presses Enter). The previous inline onsubmit attribute conflicts
    // with the strict CSP and so was moved here.
    form.addEventListener('submit', (ev) => ev.preventDefault());
  }
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
  const speedSel = document.getElementById('tour-speed');
  const outlineToggle = document.getElementById('tour-outline-toggle');

  if (startBtn) startBtn.addEventListener('click', () => Tour.start(startBtn));
  if (exitBtn)  exitBtn.addEventListener('click', () => Tour.exit());
  if (prevBtn)  prevBtn.addEventListener('click', () => Tour.prev());
  if (nextBtn)  nextBtn.addEventListener('click', () => Tour.next());
  if (pauseBtn) pauseBtn.addEventListener('click', () => Tour.togglePlay());
  if (speedSel) speedSel.addEventListener('change', () => Tour.setSpeed(speedSel.value));
  if (outlineToggle) outlineToggle.addEventListener('click', () => Tour.toggleOutline());

  document.addEventListener('keydown', (ev) => {
    if (!Tour.isActive()) return;
    const t = ev.target;
    const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT');
    if (ev.key === 'Escape') {
      ev.preventDefault();
      Tour.exit();
      return;
    }
    if (inEditable) return;
    if (ev.key === 'ArrowRight' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      Tour.next();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      Tour.prev();
    } else if (ev.key === 'p' || ev.key === 'P') {
      ev.preventDefault();
      Tour.togglePlay();
    } else if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault();
      Tour.cycleSpeed(+1);
    } else if (ev.key === '-' || ev.key === '_') {
      ev.preventDefault();
      Tour.cycleSpeed(-1);
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

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      if (!Tour.isActive()) return;
      const strip = document.getElementById('tour-step-strip');
      if (strip) strip.hidden = !tourIsDesktop();
    });
  }
}

function bindGlobalKeys() {
  let ggArmed = false;
  let ggArmedTimer = null;

  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    if (ev.key === 'Escape') {
      if (cheatsheetOpen()) { ev.preventDefault(); closeCheatsheet(); return; }
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

    if (inEditable) return;
    if (Tour.isActive()) return;

    if (ev.key === '?' || (ev.key === '/' && ev.shiftKey)) {
      ev.preventDefault();
      openCheatsheet();
      return;
    }

    if (ev.key === '/') {
      ev.preventDefault();
      const q = document.getElementById('q');
      if (q) {
        q.focus();
        q.select && q.select();
      }
      return;
    }

    if (ev.key === 't' || ev.key === 'T') {
      if (state.tourSteps.length) {
        ev.preventDefault();
        Tour.start();
      }
      return;
    }

    if (ev.key === 'f' || ev.key === 'F') {
      if (getPrimaryViewer()) {
        ev.preventDefault();
        window.dispatchEvent(new CustomEvent('uq-zoom', { detail: { dir: 'fit' } }));
      }
      return;
    }

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

    if (/^[1-9]$/.test(ev.key)) {
      const idx = parseInt(ev.key, 10) - 1;
      if (state.legend && state.legend[idx] && !state.legend[idx].community) {
        ev.preventDefault();
        toggleLegendChipByIndex(idx);
      }
      return;
    }

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
    bindRestoreHidden();
    bindCheatsheet();
    bindGlobalKeys();
    bindHeroMcpCopy();
    bindHeroFind();
    bindOnboarding();
    loadRegistry();
    updateDiagPanel();
  } catch (err) {
    console.error(err);
    paintGlobalError('Init failed', (err && err.message) || String(err));
    updateDiagPanel();
  }
});
