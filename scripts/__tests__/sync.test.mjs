import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncEntry } from '../sync.mjs';
import { createHash } from 'node:crypto';

const baseEntry = {
  id: 'foo/bar',
  owner: 'foo',
  repo: 'bar',
  format: 'understand-anything@1',
  graph_url: 'https://example.com/g.json',
  description: 'x',
  status: 'ok',
  miss_count: 0,
  last_sha: null,
  last_synced: null,
  size_bytes: null,
  last_error: null
};

const fixtureBody = JSON.stringify({
  nodes: [{ id: 'n1', kind: 'file', label: 'a' }],
  edges: []
});
const fixtureSha = createHash('sha256').update(fixtureBody).digest('hex');

function makeFetch(map) {
  return async (url, opts = {}) => {
    const handler = map[url];
    if (!handler) throw new Error(`no fetch mock for ${url}`);
    return handler(opts);
  };
}

test('200 + new sha updates last_sha', async () => {
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(fixtureBody, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date('2026-05-07T01:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.equal(r.last_sha, fixtureSha);
  assert.equal(r.size_bytes, fixtureBody.length);
});

test('200 + same sha bumps only last_synced', async () => {
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(fixtureBody, { status: 200 })
  });
  const entry = { ...baseEntry, last_sha: fixtureSha, last_synced: '2026-05-01T00:00:00Z' };
  const r = await syncEntry(entry, { fetchImpl: f, now: () => new Date('2026-05-07T01:00:00Z') });
  assert.equal(r.last_sha, fixtureSha);
  assert.equal(r.last_synced, '2026-05-07T01:00:00.000Z');
});

test('304 short-circuits to last_synced only', async () => {
  const f = makeFetch({
    'https://example.com/g.json': () => new Response('', { status: 304 })
  });
  const entry = { ...baseEntry, last_sha: fixtureSha, last_synced: '2026-05-01T00:00:00Z' };
  const r = await syncEntry(entry, {
    fetchImpl: f,
    now: () => new Date('2026-05-07T01:00:00Z'),
    etagFor: () => '"abc"'
  });
  assert.equal(r.last_sha, fixtureSha);
  assert.equal(r.last_synced, '2026-05-07T01:00:00.000Z');
});

test('404 increments miss_count', async () => {
  const f = makeFetch({
    'https://example.com/g.json': () => new Response('', { status: 404 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.miss_count, 1);
  assert.equal(r.status, 'missing');
});

test('7th miss flips to dead', async () => {
  const f = makeFetch({
    'https://example.com/g.json': () => new Response('', { status: 404 })
  });
  const r = await syncEntry({ ...baseEntry, miss_count: 6 }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.miss_count, 7);
  assert.equal(r.status, 'dead');
});

test('schema-fail → invalid, last_sha unchanged', async () => {
  const bad = JSON.stringify({ nodes: [{ id: 'n1', kind: 'asteroid', label: 'x' }], edges: [] });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(bad, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry, last_sha: 'aa' }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.status, 'invalid');
  assert.equal(r.last_sha, 'aa');
});

test('timeout retried then transient_error', async () => {
  let calls = 0;
  const f = async () => {
    calls++;
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  };
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date(), maxRetries: 2 });
  assert.equal(r.status, 'transient_error');
  assert.equal(calls, 3);
});

test('oversize → status oversize, no body fetch', async () => {
  const f = async (_url, opts) => {
    if (opts && opts.method === 'HEAD') {
      const h = new Headers();
      h.set('content-length', String(60 * 1024 * 1024));
      return new Response('', { status: 200, headers: h });
    }
    throw new Error('should not GET');
  };
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date(), useHead: true });
  assert.equal(r.status, 'oversize');
});
