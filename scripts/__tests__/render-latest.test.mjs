import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLatestLine,
  applyMarkers,
  fetchLatest,
  mergeWithFallback,
  parsePreviousLine,
  extractCurrentLine
} from '../render-latest.mjs';

test('buildLatestLine renders all 5 versions in order', () => {
  const line = buildLatestLine({
    root: '0.3.0', cli: '0.1.2', mcp: '0.1.2', pysdk: '0.1.1', action: 'v0.1.0'
  });
  assert.equal(
    line,
    '> **Latest:** v0.3.0 — CLI 0.1.2, MCP 0.1.2, Python SDK 0.1.1, GH Action v0.1.0. [CHANGELOG →](CHANGELOG.md)'
  );
});

test('applyMarkers replaces content between LATEST markers', () => {
  const tpl = 'PRE\n<!-- LATEST-START -->\nold line\n<!-- LATEST-END -->\nPOST';
  const out = applyMarkers(tpl, '> NEW');
  assert.equal(out, 'PRE\n<!-- LATEST-START -->\n> NEW\n<!-- LATEST-END -->\nPOST');
});

test('applyMarkers is idempotent', () => {
  const tpl = 'A\n<!-- LATEST-START -->\n> NEW\n<!-- LATEST-END -->\nB';
  const once  = applyMarkers(tpl, '> NEW');
  const twice = applyMarkers(once, '> NEW');
  assert.equal(once, twice);
  assert.equal(once, tpl);
});

test('applyMarkers throws if markers missing', () => {
  assert.throws(() => applyMarkers('no markers here', 'X'), /markers/);
});

test('fetchLatest assembles values from npm / PyPI / GH responses', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    // Dispatch on URL hostname + path (not substring) so the mock can't be
    // tricked by a hostile path segment. Hardened against the
    // js/incomplete-url-substring-sanitization pattern.
    const u = new URL(url);
    const body =
      u.hostname === 'registry.npmjs.org' && u.pathname.includes('understand-quickly-cli') ? { version: '1.2.3' } :
      u.hostname === 'registry.npmjs.org' && u.pathname.includes('understand-quickly-mcp') ? { version: '4.5.6' } :
      u.hostname === 'pypi.org'                                                            ? { info: { version: '7.8.9' } } :
      u.hostname === 'api.github.com' && u.pathname.includes('uq-publish-action')          ? { tag_name: 'v2.0.0' } :
      {};
    return { ok: true, json: async () => body };
  };
  const got = await fetchLatest({ fetchImpl: fakeFetch });
  assert.deepEqual(got, { cli: '1.2.3', mcp: '4.5.6', pysdk: '7.8.9', action: 'v2.0.0' });
  assert.equal(calls.length, 4);
});

test('fetchLatest falls back gracefully when registries error', async () => {
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));
  try {
    const failingFetch = async () => { throw new Error('ENETDOWN'); };
    const got = await fetchLatest({ fetchImpl: failingFetch });
    assert.deepEqual(got, { cli: null, mcp: null, pysdk: null, action: null });
    assert.ok(warnings.length >= 1, 'at least one warning was logged');
  } finally {
    console.warn = origWarn;
  }
});

test('mergeWithFallback prefers fetched, falls back to previous line', () => {
  const prev = '> **Latest:** v0.2.0 — CLI 0.1.2, MCP 0.1.2, Python SDK 0.1.1, GH Action v0.1.0. [CHANGELOG →](CHANGELOG.md)';
  const merged = mergeWithFallback(
    { cli: '0.1.3', mcp: null, pysdk: null, action: null },
    prev,
    '0.3.1'
  );
  assert.equal(merged.root,   '0.3.1');
  assert.equal(merged.cli,    '0.1.3');     // fetched wins
  assert.equal(merged.mcp,    '0.1.2');     // fallback
  assert.equal(merged.pysdk,  '0.1.1');     // fallback
  assert.equal(merged.action, 'v0.1.0');    // fallback
});

test('parsePreviousLine + extractCurrentLine round-trip', () => {
  const readme =
    'X\n<!-- LATEST-START -->\n> **Latest:** v0.3.0 — CLI 0.1.2, MCP 0.1.2, Python SDK 0.1.1, GH Action v0.1.0. [CHANGELOG →](CHANGELOG.md)\n<!-- LATEST-END -->\nY';
  const line = extractCurrentLine(readme);
  const parsed = parsePreviousLine(line);
  assert.equal(parsed.cli,    '0.1.2');
  assert.equal(parsed.mcp,    '0.1.2');
  assert.equal(parsed.pysdk,  '0.1.1');
  assert.equal(parsed.action, 'v0.1.0');
});
