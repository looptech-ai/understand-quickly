import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSitemap } from '../render-sitemap.mjs';

const NOW = () => new Date('2026-05-08T01:23:45Z');

test('sitemap: includes static pages with today\'s lastmod', () => {
  const xml = renderSitemap({ schema_version: 1, generated_at: NOW().toISOString(), entries: [] }, { now: NOW });
  assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /https:\/\/looptech-ai\.github\.io\/understand-quickly\/<\/loc>/);
  assert.match(xml, /<lastmod>2026-05-08<\/lastmod>/);
  assert.match(xml, /add\.html/);
  assert.match(xml, /about\.html/);
});

test('sitemap: emits one URL per non-revoked entry, encoding the id', () => {
  const xml = renderSitemap({
    schema_version: 1, generated_at: NOW().toISOString(),
    entries: [
      { id: 'foo/bar', status: 'ok', last_synced: '2026-05-01T00:00:00Z' },
      { id: 'baz/qux', status: 'missing', last_synced: '2026-04-30T00:00:00Z' },
      { id: 'gone/dead', status: 'revoked' },
    ],
  }, { now: NOW });
  assert.match(xml, /\?id=foo%2Fbar/);
  assert.match(xml, /\?id=baz%2Fqux/);
  assert.doesNotMatch(xml, /gone%2Fdead/);
  // last_synced drives the per-entry lastmod (regression guard against the
  // renderer falling back to wall-clock `now` for every URL).
  assert.match(xml, /<lastmod>2026-05-01<\/lastmod>/);
  assert.match(xml, /<lastmod>2026-04-30<\/lastmod>/);
  // ok entries get higher priority than non-ok ones
  assert.match(xml, /<priority>0\.6<\/priority>/);
  assert.match(xml, /<priority>0\.3<\/priority>/);
});

test('sitemap: deterministic across runs given the same registry', () => {
  const reg = {
    schema_version: 1, generated_at: '2026-05-08T00:00:00Z',
    entries: [{ id: 'a/b', status: 'ok', last_synced: '2026-05-07T00:00:00Z' }],
  };
  // Two runs with different `now` values should still produce identical
  // output — the generator anchors on registry.generated_at, not wall clock.
  const xml1 = renderSitemap(reg, { now: () => new Date('2026-05-08T01:00:00Z') });
  const xml2 = renderSitemap(reg, { now: () => new Date('2027-12-31T23:59:59Z') });
  assert.equal(xml1, xml2);
});

test('sitemap: escapes XML special characters in ids', () => {
  // The id schema doesn't allow these but defense-in-depth: an attacker
  // who somehow lands such an id should not be able to break the XML.
  const xml = renderSitemap({
    schema_version: 1, generated_at: NOW().toISOString(),
    entries: [{ id: 'evil&"<>/repo', status: 'ok' }],
  }, { now: NOW });
  assert.doesNotMatch(xml, /evil&"<>/);
});

test('sitemap: empty registry still produces well-formed XML with static pages', () => {
  const xml = renderSitemap({ schema_version: 1, generated_at: NOW().toISOString(), entries: [] }, { now: NOW });
  assert.match(xml, /<urlset/);
  assert.match(xml, /<\/urlset>/);
  // Three static pages and nothing else.
  assert.equal((xml.match(/<url>/g) || []).length, 3);
});

test('sitemap: tolerates missing entries array', () => {
  const xml = renderSitemap({ schema_version: 1, generated_at: NOW().toISOString() }, { now: NOW });
  assert.match(xml, /<urlset/);
  assert.equal((xml.match(/<url>/g) || []).length, 3);
});
