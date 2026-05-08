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
  // ok entries get higher priority than non-ok ones
  assert.match(xml, /<priority>0\.6<\/priority>/);
  assert.match(xml, /<priority>0\.3<\/priority>/);
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
