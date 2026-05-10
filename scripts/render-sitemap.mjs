// scripts/render-sitemap.mjs — generate site/sitemap.xml from registry.json
//
// One static page per registry entry plus the canonical site pages. Output
// is consumed by search engines and by the Pages workflow as a discovery
// surface for new entries.
//
// Determinism: output is fully a function of (registry contents,
// `registry.generated_at`). Static-page `lastmod` values track
// `registry.generated_at` rather than the wall clock so two runs over the
// same registry produce byte-identical XML — important for crawler ETag
// caching downstream. Per-entry `lastmod` honors `entry.last_synced` if
// present, falling back to the registry timestamp.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { loadRegistry } from './shard.mjs';

const SITE_BASE = 'https://looptech-ai.github.io/understand-quickly';

const STATIC_PAGES = [
  { loc: `${SITE_BASE}/`, priority: '1.0', changefreq: 'daily' },
  { loc: `${SITE_BASE}/about.html`, priority: '0.5', changefreq: 'weekly' },
  { loc: `${SITE_BASE}/add.html`, priority: '0.7', changefreq: 'weekly' },
];

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderSitemap(registry, { now = () => new Date() } = {}) {
  // Anchor static-page lastmod to registry.generated_at so the output is a
  // pure function of (registry, generated_at). Falling back to `now` only
  // when the registry has no timestamp (an empty/seed run).
  const anchor = (registry?.generated_at || now().toISOString()).slice(0, 10);
  const urls = [
    ...STATIC_PAGES.map((p) => ({ ...p, lastmod: anchor })),
    ...(registry?.entries || [])
      .filter((e) => e?.id && e?.status !== 'revoked')
      .map((e) => ({
        loc: `${SITE_BASE}/?id=${encodeURIComponent(e.id)}`,
        lastmod: (e.last_synced || registry.generated_at || now().toISOString()).slice(0, 10),
        priority: e.status === 'ok' ? '0.6' : '0.3',
        changefreq: 'weekly',
      })),
  ];

  const body = urls
    .map((u) => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${xmlEscape(u.lastmod)}</lastmod>
    <changefreq>${xmlEscape(u.changefreq)}</changefreq>
    <priority>${xmlEscape(u.priority)}</priority>
  </url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function main() {
  const args = process.argv.slice(2);
  const regIdx = args.indexOf('--registry');
  const regPath = regIdx >= 0 ? args[regIdx + 1] : 'registry.json';
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : 'site/sitemap.xml';

  const absReg = resolve(regPath);
  // `basename === 'registry.json'` (not `endsWith`) so a tests-fixture path
  // like `tests/my-registry.json` doesn't get false-positived into the
  // sharded loader, which would silently load `<root>/registry.json`
  // instead of the file the user pointed at.
  const registry = basename(absReg) === 'registry.json'
    ? loadRegistry({ root: dirname(absReg) })
    : JSON.parse(readFileSync(regPath, 'utf8'));

  const xml = renderSitemap(registry);
  writeFileSync(outPath, xml);
  console.log(`wrote ${outPath} (${(registry.entries || []).length} entries)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
