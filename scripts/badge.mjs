// SVG badge renderer for understand-quickly registry entries.
//
// Produces a shields.io-style two-segment badge per entry, served statically
// from `site/badges/<owner>--<repo>.svg`. Pure Node — zero runtime deps —
// because Pages serves these as plain static assets and we do not want a
// generation-time dependency budget for what is fundamentally string concat.
//
// Two public renderers:
//
//   - renderEntryBadge(entry)         -> SVG string for one registry entry.
//   - renderCountBadge(registry)      -> SVG string of "indexed | N entries"
//                                        for the registry's own README.
//
// Both wrap the visible elements in an SVG `<a>` so a click on the badge
// (when embedded in a GitHub README) jumps to the live entry on the Pages
// site. We emit BOTH `xlink:href` and `href` for maximum renderer
// compatibility — older WebKit/iOS Safari builds historically required
// `xlink:href` on SVG `<a>`, modern renderers prefer the unprefixed `href`.

const BADGE_BASE_URL = 'https://looptech-ai.github.io/understand-quickly';

// Status -> right-half background color. Pulled verbatim from the spec so
// that badge color is part of the protocol and not subject to drift.
const STATUS_COLORS = {
  ok: '#5a9e6f',
  pending: '#a39787',
  missing: '#fcbb00',
  invalid: '#e05252',
  oversize: '#fdba74',
  transient_error: '#a39787',
  dead: '#6b5f53',
  renamed: '#a78bfa',
  revoked: '#6b5f53'
};

// Compact glyph per status — kept ASCII-safe so badges render identically
// on every README font. (shields.io uses real emoji here; we use a status
// dot/word so the badge never falls back to a tofu glyph in monospace
// READMEs viewed in headless terminals.)
const STATUS_GLYPHS = {
  ok: 'ok',
  pending: 'pending',
  missing: 'missing',
  invalid: 'invalid',
  oversize: 'oversize',
  transient_error: 'retry',
  dead: 'dead',
  renamed: 'renamed',
  revoked: 'revoked'
};

const FALLBACK_COLOR = '#9f9f9f';
const LABEL_COLOR = '#555555';
const FONT_FAMILY = 'Verdana, Geneva, DejaVu Sans, sans-serif';
const FONT_SIZE = 11;
// Shields.io derives widths by measuring text in Verdana 11. We cannot run a
// font measurer at build time without pulling a dep, so we use a stable
// approximation: per-character advance widths for the small ASCII range we
// emit, falling back to a conservative average for everything else. The
// approximation matches Verdana 11 well enough that badge segments don't
// visibly clip; we also pad each segment with a fixed 10px gutter, same as
// shields.io.
const CHAR_WIDTHS = {
  ' ': 3.5, '!': 4, '"': 4.5, '#': 7, '$': 6.5, '%': 11, '&': 7.5, "'": 2.5,
  '(': 4, ')': 4, '*': 5, '+': 7, ',': 3.5, '-': 4, '.': 3.5, '/': 4,
  '0': 6.5, '1': 6.5, '2': 6.5, '3': 6.5, '4': 6.5, '5': 6.5, '6': 6.5, '7': 6.5, '8': 6.5, '9': 6.5,
  ':': 4, ';': 4, '<': 7, '=': 7, '>': 7, '?': 5.5, '@': 11.5,
  'A': 7.5, 'B': 7.5, 'C': 7.5, 'D': 8, 'E': 7, 'F': 6.5, 'G': 8.5, 'H': 8,
  'I': 4.5, 'J': 5, 'K': 7.5, 'L': 6.5, 'M': 9, 'N': 8, 'O': 8.5, 'P': 7,
  'Q': 8.5, 'R': 7.5, 'S': 7, 'T': 6.5, 'U': 8, 'V': 7.5, 'W': 11, 'X': 7.5,
  'Y': 7, 'Z': 7,
  '[': 4, '\\': 4, ']': 4, '^': 6, '_': 6.5, '`': 5,
  'a': 6.5, 'b': 6.5, 'c': 5.5, 'd': 6.5, 'e': 6.5, 'f': 4, 'g': 6.5, 'h': 6.5,
  'i': 3, 'j': 3.5, 'k': 6, 'l': 3, 'm': 10, 'n': 6.5, 'o': 6.5, 'p': 6.5,
  'q': 6.5, 'r': 4.5, 's': 5.5, 't': 4, 'u': 6.5, 'v': 6, 'w': 9, 'x': 6,
  'y': 6, 'z': 5.5,
  '{': 4.5, '|': 4, '}': 4.5, '~': 7
};
const DEFAULT_CHAR_WIDTH = 6.5;

function approxTextWidth(s) {
  if (!s) return 0;
  let w = 0;
  for (const ch of String(s)) {
    w += CHAR_WIDTHS[ch] ?? DEFAULT_CHAR_WIDTH;
  }
  return w;
}

// XML-escape any text that goes inside SVG (text bodies, attributes). The
// registry stores user-controlled fields (descriptions, tags) — we don't
// embed those, but we DO embed entry ids which are owner/repo strings the
// validator restricts; defense-in-depth here costs us nothing.
function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Compute the slug used in the badge filename: `<owner>/<repo>` becomes
// `<owner>--<repo>`, lowercased. Exported because both the renderer and
// `render-badges.mjs` write to the slugged path.
export function entrySlug(entry) {
  const owner = String(entry?.owner ?? '').toLowerCase();
  const repo = String(entry?.repo ?? '').toLowerCase();
  return `${owner}--${repo}`;
}

function statusColor(status) {
  return STATUS_COLORS[status] ?? FALLBACK_COLOR;
}

function statusGlyph(status) {
  return STATUS_GLYPHS[status] ?? String(status ?? 'unknown');
}

// Compose the inner `<svg>` for a two-segment badge. Stays pure so we can
// reuse it for both per-entry and aggregate badges.
function buildSvg({ leftText, rightText, rightColor, href }) {
  const padding = 5; // matches shields.io: 5px on each side of each segment
  const leftWidth = Math.round(approxTextWidth(leftText) + padding * 2);
  const rightWidth = Math.round(approxTextWidth(rightText) + padding * 2);
  const totalWidth = leftWidth + rightWidth;
  const height = 20;

  const leftTextX = leftWidth / 2;
  const rightTextX = leftWidth + rightWidth / 2;
  // shields.io uses textLength to force the rendered glyphs to fit our
  // computed segment width regardless of the renderer's actual font metrics
  // (Verdana isn't installed everywhere — DejaVu Sans on Linux, Geneva on
  // older macOS, Helvetica fallback on iOS Safari). textLength + scale-down
  // means the badge is visually identical on every renderer.
  const leftTextLen = Math.round(approxTextWidth(leftText) * 10) / 10;
  const rightTextLen = Math.round(approxTextWidth(rightText) * 10) / 10;

  const safeLeft = escapeXml(leftText);
  const safeRight = escapeXml(rightText);
  const safeHref = href ? escapeXml(href) : null;

  const linkOpen = safeHref
    ? `<a target="_blank" rel="noopener" xlink:href="${safeHref}" href="${safeHref}">`
    : '';
  const linkClose = safeHref ? '</a>' : '';

  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="${height}" role="img" aria-label="${safeLeft}: ${safeRight}">
  <title>${safeLeft}: ${safeRight}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="${height}" fill="${LABEL_COLOR}"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="${rightColor}"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  ${linkOpen}<g fill="#fff" text-anchor="middle" font-family="${FONT_FAMILY}" text-rendering="geometricPrecision" font-size="${FONT_SIZE * 10}" transform="scale(.1)">
    <text aria-hidden="true" x="${Math.round(leftTextX * 10)}" y="150" fill="#010101" fill-opacity=".3" textLength="${Math.round(leftTextLen * 10)}">${safeLeft}</text>
    <text x="${Math.round(leftTextX * 10)}" y="140" textLength="${Math.round(leftTextLen * 10)}">${safeLeft}</text>
    <text aria-hidden="true" x="${Math.round(rightTextX * 10)}" y="150" fill="#010101" fill-opacity=".3" textLength="${Math.round(rightTextLen * 10)}">${safeRight}</text>
    <text x="${Math.round(rightTextX * 10)}" y="140" textLength="${Math.round(rightTextLen * 10)}">${safeRight}</text>
  </g>${linkClose}
</svg>
`;
  return svg;
}

/**
 * Render a per-entry status badge.
 * @param {object} entry  Registry entry (owner, repo, id, status).
 * @returns {string} SVG body — newline-terminated, ready to write to disk.
 */
export function renderEntryBadge(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('renderEntryBadge: entry must be an object');
  }
  const status = entry.status || 'pending';
  const id = entry.id || `${entry.owner ?? ''}/${entry.repo ?? ''}`;
  const href = `${BADGE_BASE_URL}/?entry=${encodeURIComponent(id)}`;
  return buildSvg({
    leftText: 'indexed by',
    rightText: `understand-quickly · ${statusGlyph(status)}`,
    rightColor: statusColor(status),
    href
  });
}

/**
 * Render the aggregate count badge for the registry's own README.
 * `indexed | N entries`. Uses the `ok` color when N>0, otherwise pending.
 *
 * @param {object} registry  Full registry object (with `entries`).
 * @returns {string} SVG body.
 */
export function renderCountBadge(registry) {
  const n = Array.isArray(registry?.entries) ? registry.entries.length : 0;
  const color = n > 0 ? STATUS_COLORS.ok : STATUS_COLORS.pending;
  return buildSvg({
    leftText: 'indexed',
    rightText: `${n} ${n === 1 ? 'entry' : 'entries'}`,
    rightColor: color,
    href: `${BADGE_BASE_URL}/`
  });
}

// Re-exported for tests so the color palette is part of the public contract
// of this module — third-party tooling that wants to mirror our badge
// colors imports it directly rather than re-deriving from regex.
export const STATUS_COLOR_MAP = Object.freeze({ ...STATUS_COLORS });
