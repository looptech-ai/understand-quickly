import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncEntry } from '../sync.mjs';
import { loadRegistry, shouldShard, makeMapFs, listShardFiles } from '../shard.mjs';
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

// ---------------------------------------------------------------------------
// Shard read-path tests (scripts/shard.mjs). These use a fake fs map so we
// can drive `loadRegistry`/`shouldShard` deterministically without touching
// disk. Today the read path is the only behavior that ships — there is no
// write/migration logic yet.
// ---------------------------------------------------------------------------

const ROOT = '/repo';

function entry(id) {
  return {
    id,
    owner: id.split('/')[0],
    repo: id.split('/')[1],
    format: 'understand-anything@1',
    graph_url: `https://example.com/${id}.json`,
    description: id
  };
}

test('shard: no shards → loadRegistry behaves identically to top-level', () => {
  const top = {
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [entry('a/one'), entry('b/two')]
  };
  const fs = makeMapFs({ '/repo/registry.json': JSON.stringify(top) });
  const r = loadRegistry({ root: ROOT, fs });
  assert.deepEqual(r, top);
  assert.equal(listShardFiles(ROOT, fs).length, 0);
});

test('shard: a.json + b.json shards merged into the registry view', () => {
  const top = {
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [entry('z/top')]
  };
  const fs = makeMapFs({
    '/repo/registry.json': JSON.stringify(top),
    '/repo/entries/a.json': JSON.stringify({ entries: [entry('a/one'), entry('a/two')] }),
    '/repo/entries/b.json': JSON.stringify({ entries: [entry('b/one')] }),
    // Extraneous file in entries/ should be ignored (doesn't match SHARD_RE).
    '/repo/entries/README.md': 'not a shard'
  });
  const r = loadRegistry({ root: ROOT, fs });
  const ids = r.entries.map(e => e.id).sort();
  assert.deepEqual(ids, ['a/one', 'a/two', 'b/one', 'z/top']);
  // Top-level metadata preserved.
  assert.equal(r.schema_version, 1);
  assert.equal(r.generated_at, '2026-05-07T00:00:00Z');
  // Shard discovery is deterministic, sorted, and ignores non-shard files.
  assert.deepEqual(listShardFiles(ROOT, fs), ['a.json', 'b.json']);
});

test('shard: top-level wins on collision and emits a warn', () => {
  const top = {
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [{ ...entry('a/dup'), description: 'from top' }]
  };
  const fs = makeMapFs({
    '/repo/registry.json': JSON.stringify(top),
    '/repo/entries/a.json': JSON.stringify({
      entries: [{ ...entry('a/dup'), description: 'from shard' }, entry('a/unique')]
    })
  });
  const warnings = [];
  const r = loadRegistry({ root: ROOT, fs, warn: (m) => warnings.push(m) });
  const dup = r.entries.find(e => e.id === 'a/dup');
  assert.equal(dup.description, 'from top');
  // The non-colliding shard entry still merges in.
  assert.ok(r.entries.find(e => e.id === 'a/unique'));
  // Exactly one warning, mentioning the colliding id and the shard file.
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /a\/dup/);
  assert.match(warnings[0], /entries\/a\.json/);
  assert.match(warnings[0], /registry\.json/);
});

test('shard: shard-vs-shard collision keeps first-seen and warns', () => {
  const top = {
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: []
  };
  const fs = makeMapFs({
    '/repo/registry.json': JSON.stringify(top),
    '/repo/entries/a.json': JSON.stringify({
      entries: [{ ...entry('shared/id'), description: 'from a' }]
    }),
    '/repo/entries/b.json': JSON.stringify({
      entries: [{ ...entry('shared/id'), description: 'from b' }]
    })
  });
  const warnings = [];
  const r = loadRegistry({ root: ROOT, fs, warn: (m) => warnings.push(m) });
  const winner = r.entries.find(e => e.id === 'shared/id');
  // Sorted shard order is a.json → b.json, so a.json wins.
  assert.equal(winner.description, 'from a');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /entries\/b\.json/);
});

test('shard: shouldShard flips at the > 1000 boundary', () => {
  const mk = (n) => ({ entries: Array.from({ length: n }, (_, i) => entry(`x/${i}`)) });
  // At exactly threshold (1000) we are still single-file — strict greater.
  assert.equal(shouldShard(mk(1000)), false);
  // 1001 entries crosses the boundary.
  assert.equal(shouldShard(mk(1001)), true);
  // Custom threshold honored.
  assert.equal(shouldShard(mk(5), 4), true);
  assert.equal(shouldShard(mk(4), 4), false);
  // Defensive: bad inputs don't throw.
  assert.equal(shouldShard(null), false);
  assert.equal(shouldShard({}), false);
});

test('shard: malformed shard body (non-array entries) is skipped', () => {
  const top = {
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [entry('a/keep')]
  };
  const fs = makeMapFs({
    '/repo/registry.json': JSON.stringify(top),
    '/repo/entries/a.json': JSON.stringify({ entries: 'not an array' }),
    '/repo/entries/b.json': JSON.stringify({ no_entries_field: true })
  });
  const r = loadRegistry({ root: ROOT, fs });
  assert.deepEqual(r.entries.map(e => e.id), ['a/keep']);
});

test('shard: missing registry.json throws', () => {
  const fs = makeMapFs({});
  assert.throws(() => loadRegistry({ root: ROOT, fs }), /registry\.json not found/);
});

test('shard: loadRegistry requires a root', () => {
  assert.throws(() => loadRegistry({}), /root is required/);
});
