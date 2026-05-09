import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderEntryBadge, renderCountBadge, entrySlug, STATUS_COLOR_MAP } from '../badge.mjs';
import { renderBadges } from '../render-badges.mjs';

test('renderEntryBadge: ok-status badge contains svg, slug, and ok color', () => {
  const entry = {
    id: 'a/b', owner: 'a', repo: 'b',
    format: 'understand-anything@1', status: 'ok',
    graph_url: 'https://example.invalid/g.json'
  };
  const svg = renderEntryBadge(entry);

  // Top-level SVG element with the documented xmlns + xlink xmlns.
  assert.ok(svg.startsWith('<svg'), 'svg must start with <svg');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('xmlns:xlink="http://www.w3.org/1999/xlink"'));

  // Right-half color reflects the entry's status.
  assert.ok(svg.includes(STATUS_COLOR_MAP.ok), `expected ok color ${STATUS_COLOR_MAP.ok} in svg`);

  // Visible left/right text.
  assert.ok(svg.includes('indexed by'));
  assert.ok(svg.includes('understand-quickly'));

  // The link wraps visible elements and points at the live entry view.
  assert.ok(/<a [^>]*href="[^"]*\?entry=a%2Fb"/.test(svg), 'badge must link to the entry page');
  assert.ok(/<a [^>]*xlink:href="/.test(svg), 'badge must include xlink:href for legacy renderers');
});

test('renderEntryBadge: three statuses yield three different right-side fills', () => {
  const make = (status) => renderEntryBadge({
    id: 'x/y', owner: 'x', repo: 'y', status, format: 'understand-anything@1'
  });

  const okSvg = make('ok');
  const invalidSvg = make('invalid');
  const oversizeSvg = make('oversize');

  // Each status renders the right-half rect with its specific color.
  assert.ok(okSvg.includes(STATUS_COLOR_MAP.ok));
  assert.ok(invalidSvg.includes(STATUS_COLOR_MAP.invalid));
  assert.ok(oversizeSvg.includes(STATUS_COLOR_MAP.oversize));

  // None of the colors collide.
  assert.notEqual(STATUS_COLOR_MAP.ok, STATUS_COLOR_MAP.invalid);
  assert.notEqual(STATUS_COLOR_MAP.ok, STATUS_COLOR_MAP.oversize);
  assert.notEqual(STATUS_COLOR_MAP.invalid, STATUS_COLOR_MAP.oversize);
});

test('renderEntryBadge: unknown status falls back without throwing', () => {
  const svg = renderEntryBadge({ id: 'a/b', owner: 'a', repo: 'b', status: 'never-heard-of' });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('never-heard-of'));
});

test('renderCountBadge: shows N for an N-entry registry', () => {
  const svg = renderCountBadge({
    entries: [
      { id: 'a/b' }, { id: 'c/d' }, { id: 'e/f' }
    ]
  });
  assert.ok(svg.includes('3 entries'), 'badge must show count');
  assert.ok(svg.includes(STATUS_COLOR_MAP.ok), 'non-empty registry uses ok color');
});

test('renderCountBadge: empty registry shows "0 entries"', () => {
  const svg = renderCountBadge({ entries: [] });
  assert.ok(svg.includes('0 entries'));
  assert.ok(svg.includes(STATUS_COLOR_MAP.pending), 'empty registry uses pending color');
});

test('renderCountBadge: missing registry is non-throwing', () => {
  const svg = renderCountBadge(null);
  assert.ok(svg.includes('0 entries'));
});

test('renderCountBadge: 1 entry uses singular "entry"', () => {
  const svg = renderCountBadge({ entries: [{ id: 'a/b' }] });
  assert.ok(svg.includes('1 entry'));
  assert.ok(!/1 entries/.test(svg));
});

test('badge wraps visible elements in <a href> AND <a xlink:href>', () => {
  const svg = renderEntryBadge({ id: 'a/b', owner: 'a', repo: 'b', status: 'ok' });
  assert.match(svg, /<a [^>]*href="[^"]+"/);
  assert.match(svg, /<a [^>]*xlink:href="[^"]+"/);
});

test('entrySlug lowercases and joins with --', () => {
  assert.equal(entrySlug({ owner: 'Foo', repo: 'Bar' }), 'foo--bar');
  assert.equal(entrySlug({ owner: 'looptech-AI', repo: 'understand-Quickly' }),
    'looptech-ai--understand-quickly');
});

test('renderBadges: writes one SVG per entry plus all.svg', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-badges-'));
  const registry = {
    entries: [
      { id: 'a/b', owner: 'a', repo: 'b', status: 'ok' },
      { id: 'c/d', owner: 'C', repo: 'D', status: 'invalid' }
    ]
  };
  const result = renderBadges({ registry, outDir: out });
  assert.equal(result.total, 2);
  // 3 writes: 2 entries + 1 all.svg.
  assert.equal(result.written, 3);
  const files = readdirSync(out).sort();
  assert.deepEqual(files, ['a--b.svg', 'all.svg', 'c--d.svg']);
});

test('renderBadges: empty entries still writes all.svg = 0', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-badges-empty-'));
  const result = renderBadges({ registry: { entries: [] }, outDir: out });
  assert.equal(result.total, 0);
  assert.equal(result.written, 1);
  const files = readdirSync(out).sort();
  assert.deepEqual(files, ['all.svg']);
  const all = readFileSync(join(out, 'all.svg'), 'utf8');
  assert.ok(all.includes('0 entries'));
});

test('renderBadges: re-running with no changes is a no-op', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-badges-noop-'));
  const registry = {
    entries: [{ id: 'a/b', owner: 'a', repo: 'b', status: 'ok' }]
  };
  const first = renderBadges({ registry, outDir: out });
  assert.equal(first.written, 2); // 1 entry + all
  const second = renderBadges({ registry, outDir: out });
  assert.equal(second.written, 0);
  assert.equal(second.skipped, 2);
});

test('renderBadges: skips entries missing owner/repo', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-badges-bad-'));
  const registry = {
    entries: [
      { id: 'a/b', owner: 'a', repo: 'b', status: 'ok' },
      { id: 'broken', owner: '', repo: '', status: 'ok' }, // skipped
      null // skipped
    ]
  };
  const result = renderBadges({ registry, outDir: out });
  // 2 writes: 1 valid entry + all.svg.
  assert.equal(result.written, 2);
  const files = readdirSync(out).sort();
  assert.deepEqual(files, ['a--b.svg', 'all.svg']);
});
