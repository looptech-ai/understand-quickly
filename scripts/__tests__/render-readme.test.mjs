import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTable, applyMarkers } from '../render-readme.mjs';

const registry = {
  schema_version: 1,
  generated_at: '2026-05-07T00:00:00Z',
  entries: [
    {
      id: 'b/two', owner: 'b', repo: 'two', format: 'generic@1',
      graph_url: 'https://x/g.json', description: 'two',
      status: 'ok', last_synced: '2026-05-07T00:00:00Z'
    },
    {
      id: 'a/one', owner: 'a', repo: 'one', format: 'understand-anything@1',
      graph_url: 'https://x/g.json', description: 'one',
      status: 'dead', last_synced: '2026-04-01T00:00:00Z'
    }
  ]
};

test('table sorts by id', () => {
  const md = renderTable(registry);
  assert.match(md, /a\/one[\s\S]*b\/two/);
});

test('table includes status emoji', () => {
  const md = renderTable(registry);
  assert.match(md, /✅/);
  assert.match(md, /💀/);
});

test('applyMarkers replaces between markers', () => {
  const tpl = 'PRE\n<!-- BEGIN ENTRIES -->\nold\n<!-- END ENTRIES -->\nPOST';
  const out = applyMarkers(tpl, 'NEW');
  assert.equal(out, 'PRE\n<!-- BEGIN ENTRIES -->\nNEW\n<!-- END ENTRIES -->\nPOST');
});

test('applyMarkers idempotent', () => {
  const tpl = 'A\n<!-- BEGIN ENTRIES -->\nNEW\n<!-- END ENTRIES -->\nB';
  assert.equal(applyMarkers(tpl, 'NEW'), tpl);
});

test('applyMarkers throws if markers missing', () => {
  assert.throws(() => applyMarkers('no markers', 'X'), /markers/);
});

test('entry without status renders as pending, not undefined', () => {
  const md = renderTable({
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [{
      id: 'z/new', owner: 'z', repo: 'new', format: 'generic@1',
      graph_url: 'https://x/g.json', description: 'fresh'
    }]
  });
  assert.match(md, /🆕 pending/);
  assert.doesNotMatch(md, /undefined/);
});
