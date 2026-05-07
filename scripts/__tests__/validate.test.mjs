import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistry, validateGraph } from '../validate.mjs';
import { readFileSync } from 'node:fs';

const okRegistry = {
  schema_version: 1,
  generated_at: '2026-05-07T00:00:00Z',
  entries: [{
    id: 'foo/bar',
    owner: 'foo',
    repo: 'bar',
    format: 'understand-anything@1',
    graph_url: 'https://example.com/g.json',
    description: 'hi'
  }]
};

test('valid registry passes', () => {
  const r = validateRegistry(okRegistry);
  assert.equal(r.ok, true);
});

test('missing required field fails', () => {
  const bad = structuredClone(okRegistry);
  delete bad.entries[0].graph_url;
  const r = validateRegistry(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /graph_url/);
});

test('duplicate id fails', () => {
  const bad = structuredClone(okRegistry);
  bad.entries.push(bad.entries[0]);
  const r = validateRegistry(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /duplicate id/);
});

test('non-https graph_url fails', () => {
  const bad = structuredClone(okRegistry);
  bad.entries[0].graph_url = 'http://example.com/g.json';
  const r = validateRegistry(bad);
  assert.equal(r.ok, false);
});

test('unknown format fails graph validation', () => {
  const r = validateGraph('unknown@9', { nodes: [], edges: [] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /unknown format/);
});

test('valid understand-anything graph passes', () => {
  const ok = JSON.parse(readFileSync('schemas/__fixtures__/understand-anything/ok.json', 'utf8'));
  const r = validateGraph('understand-anything@1', ok);
  assert.equal(r.ok, true);
});

test('invalid understand-anything graph fails', () => {
  const bad = JSON.parse(readFileSync('schemas/__fixtures__/understand-anything/bad.json', 'utf8'));
  const r = validateGraph('understand-anything@1', bad);
  assert.equal(r.ok, false);
});
