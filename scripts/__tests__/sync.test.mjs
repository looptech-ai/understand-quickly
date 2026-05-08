import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncEntry, checkDrift, selectDriftBatch } from '../sync.mjs';
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

// ---------------------------------------------------------------------------
// Per-entry stats (extract.mjs wired through syncEntry). These cover each
// first-class format on the success path, plus the "stats are cleared on a
// non-ok status" contract from the spec.
// ---------------------------------------------------------------------------

test('stats: understand-anything@1 200 ok yields nodes_count/edges_count/top_kinds/languages', async () => {
  const body = JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'function', label: 'a' },
      { id: 'n2', kind: 'function', label: 'b' },
      { id: 'n3', kind: 'file', label: 'src/x.ts' }
    ],
    edges: [{ from: 'n1', to: 'n2', kind: 'calls' }]
  });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date('2026-05-07T00:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.equal(r.nodes_count, 3);
  assert.equal(r.edges_count, 1);
  assert.deepEqual(r.top_kinds, [
    { kind: 'function', count: 2 },
    { kind: 'file', count: 1 }
  ]);
  assert.deepEqual(r.languages, []);
});

test('stats: gitnexus@1 derives languages from properties + lowercases labels', async () => {
  const body = JSON.stringify({
    graph: {
      nodes: [
        { id: 'p', label: 'Project' },
        { id: 'f1', label: 'File', properties: { language: 'TypeScript' } },
        { id: 'f2', label: 'File', properties: { language: 'typescript' } },
        { id: 'fn', label: 'Function', properties: { language: 'Python' } }
      ],
      links: [
        { source: 'p', target: 'f1', type: 'CONTAINS' },
        { source: 'p', target: 'f2', type: 'CONTAINS' }
      ]
    }
  });
  const entry = { ...baseEntry, format: 'gitnexus@1' };
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry(entry, { fetchImpl: f, now: () => new Date('2026-05-07T00:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.equal(r.nodes_count, 4);
  assert.equal(r.edges_count, 2);
  // Labels are lowercased + counted; sorted desc by count, ties alphabetical.
  assert.deepEqual(r.top_kinds, [
    { kind: 'file', count: 2 },
    { kind: 'function', count: 1 },
    { kind: 'project', count: 1 }
  ]);
  assert.deepEqual(r.languages, ['python', 'typescript']);
});

test('stats: code-review-graph@1 pulls languages from stats and lowercases kinds', async () => {
  const body = JSON.stringify({
    nodes: [
      { id: 1, kind: 'File', name: 'x.py', qualified_name: 'x.py', file_path: 'x.py' },
      { id: 2, kind: 'Function', name: 'main', qualified_name: 'x.py::main', file_path: 'x.py' },
      { id: 3, kind: 'Function', name: 'helper', qualified_name: 'x.py::helper', file_path: 'x.py' }
    ],
    edges: [
      { id: 1, kind: 'CONTAINS', source: 'x.py', target: 'x.py::main' }
    ],
    stats: {
      total_nodes: 3, total_edges: 1, nodes_by_kind: {}, edges_by_kind: {},
      languages: ['Python'], files_count: 1
    }
  });
  const entry = { ...baseEntry, format: 'code-review-graph@1' };
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry(entry, { fetchImpl: f, now: () => new Date('2026-05-07T00:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.equal(r.nodes_count, 3);
  assert.equal(r.edges_count, 1);
  assert.deepEqual(r.top_kinds, [
    { kind: 'function', count: 2 },
    { kind: 'file', count: 1 }
  ]);
  assert.deepEqual(r.languages, ['python']);
});

test('stats: generic@1 emits zero counts and empty arrays', async () => {
  const body = JSON.stringify({ nodes: [], edges: [] });
  const entry = { ...baseEntry, format: 'generic@1' };
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry(entry, { fetchImpl: f, now: () => new Date('2026-05-07T00:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.equal(r.nodes_count, 0);
  assert.equal(r.edges_count, 0);
  assert.deepEqual(r.top_kinds, []);
  assert.deepEqual(r.languages, []);
});

test('stats: gitnexus@1 also picks up metadata.languages', async () => {
  const body = JSON.stringify({
    graph: {
      nodes: [
        { id: 'p', label: 'Project' },
        { id: 'f', label: 'File', properties: { language: 'go' } }
      ],
      links: []
    },
    metadata: { languages: ['Go', 'Rust'] }
  });
  const entry = { ...baseEntry, format: 'gitnexus@1' };
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry(entry, { fetchImpl: f, now: () => new Date('2026-05-07T00:00:00Z') });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.languages, ['go', 'rust']);
});

test('stats: code-review-graph@1 supports stats.languages as an object', async () => {
  const body = JSON.stringify({
    nodes: [{ id: 1, kind: 'File', name: 'x.py', qualified_name: 'x.py', file_path: 'x.py' }],
    edges: [],
    stats: {
      total_nodes: 1, total_edges: 0,
      nodes_by_kind: {}, edges_by_kind: {},
      // Object form -- spec says we should accept either array or object keys.
      languages: { Python: 100, JavaScript: 50 },
      files_count: 1
    }
  });
  const entry = { ...baseEntry, format: 'code-review-graph@1' };
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  // Note: this body won't pass the strict code-review-graph@1 schema (which
  // declares languages as an array). We're only exercising the extractor
  // here, so we drop the schema check by routing through `extractStats`
  // directly — re-import for the assertion.
  const { extractStats } = await import('../extract.mjs');
  const stats = extractStats(entry.format, JSON.parse(body));
  assert.deepEqual(stats.languages, ['javascript', 'python']);
  // Suppress unused-var lint for f.
  void f;
});

test('stats: extractStats returns {} for unknown formats', async () => {
  const { extractStats } = await import('../extract.mjs');
  const stats = extractStats('not-a-real-format@99', { nodes: [], edges: [] });
  assert.deepEqual(stats, {});
});

// ---------------------------------------------------------------------------
// Goal 1: source_sha sniffing + drift detection.
// ---------------------------------------------------------------------------

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

test('drift: happy path sets head_sha + commits_behind, leaves status ok', async () => {
  // Body that includes a valid 40-hex source sha in the documented location
  // for understand-anything@1 (metadata.source_sha).
  const body = JSON.stringify({
    nodes: [{ id: 'n1', kind: 'file', label: 'a' }],
    edges: [],
    metadata: { source_sha: SHA_A }
  });
  const f = async (url) => {
    if (url === 'https://example.com/g.json') return new Response(body, { status: 200 });
    if (url.includes('/commits/main')) {
      return new Response(JSON.stringify({ sha: SHA_B }), { status: 200 });
    }
    if (url.includes('/compare/')) {
      return new Response(JSON.stringify({ behind_by: 7, ahead_by: 0 }), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const r = await syncEntry({ ...baseEntry }, {
    fetchImpl: f,
    now: () => new Date('2026-05-07T01:00:00Z'),
    driftCheck: checkDrift
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.source_sha, SHA_A);
  assert.equal(r.head_sha, SHA_B);
  assert.equal(r.commits_behind, 7);
  assert.equal(r.drift_checked_at, '2026-05-07T01:00:00.000Z');
});

test('drift: missing source_sha leaves head_sha + commits_behind null but stamps drift_checked_at', async () => {
  // No metadata.source_sha → can't compare. checkDrift still resolves
  // head_sha but commits_behind stays null and the entry remains ok.
  const body = JSON.stringify({
    nodes: [{ id: 'n1', kind: 'file', label: 'a' }],
    edges: []
  });
  const f = async (url) => {
    if (url === 'https://example.com/g.json') return new Response(body, { status: 200 });
    if (url.includes('/commits/main')) {
      return new Response(JSON.stringify({ sha: SHA_B }), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const r = await syncEntry({ ...baseEntry }, {
    fetchImpl: f,
    now: () => new Date('2026-05-07T01:00:00Z'),
    driftCheck: checkDrift
  });
  assert.equal(r.status, 'ok');
  assert.equal(r.source_sha, null);
  assert.equal(r.head_sha, SHA_B);
  assert.equal(r.commits_behind, null);
  assert.equal(r.drift_checked_at, '2026-05-07T01:00:00.000Z');
});

test('drift: GitHub rate-limit (403) leaves drift fields null, status still ok', async () => {
  const body = JSON.stringify({
    nodes: [{ id: 'n1', kind: 'file', label: 'a' }],
    edges: [],
    metadata: { source_sha: SHA_A }
  });
  const f = async (url) => {
    if (url === 'https://example.com/g.json') return new Response(body, { status: 200 });
    // Simulate the unauthenticated-API 403 you get when hitting the
    // 60 req/hr budget.
    return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 403 });
  };
  const r = await syncEntry({ ...baseEntry }, {
    fetchImpl: f,
    now: () => new Date('2026-05-07T01:00:00Z'),
    driftCheck: checkDrift
  });
  // Sync did NOT fail — drift detection is best-effort.
  assert.equal(r.status, 'ok');
  assert.equal(r.source_sha, SHA_A);
  assert.equal(r.head_sha, null);
  assert.equal(r.commits_behind, null);
  assert.equal(r.drift_checked_at, '2026-05-07T01:00:00.000Z');
});

test('drift: source_sha already matches head → commits_behind = 0 without compare call', async () => {
  const body = JSON.stringify({
    nodes: [{ id: 'n1', kind: 'file', label: 'a' }],
    edges: [],
    metadata: { source_sha: SHA_A }
  });
  let compareCalls = 0;
  const f = async (url) => {
    if (url === 'https://example.com/g.json') return new Response(body, { status: 200 });
    if (url.includes('/commits/main')) {
      return new Response(JSON.stringify({ sha: SHA_A }), { status: 200 });
    }
    if (url.includes('/compare/')) { compareCalls++; throw new Error('should not compare'); }
    throw new Error(`unexpected url ${url}`);
  };
  const r = await syncEntry({ ...baseEntry }, {
    fetchImpl: f,
    now: () => new Date('2026-05-07T01:00:00Z'),
    driftCheck: checkDrift
  });
  assert.equal(r.head_sha, SHA_A);
  assert.equal(r.commits_behind, 0);
  assert.equal(compareCalls, 0);
});

test('selectDriftBatch: rotates within budget and skips revoked', () => {
  const entries = [
    { id: 'a/1' }, { id: 'a/2' }, { id: 'a/3', status: 'revoked' },
    { id: 'a/4' }, { id: 'a/5' }
  ];
  const r = selectDriftBatch(entries, 0, 2);
  assert.equal(r.ids.size, 2);
  assert.ok(r.ids.has('a/1'));
  assert.ok(r.ids.has('a/2'));
  // nextIndex points past the last picked entry (here index 2, the revoked one).
  // Rotation from there should pick a/4 and a/5 next run.
  const r2 = selectDriftBatch(entries, r.nextIndex, 2);
  assert.ok(r2.ids.has('a/4'));
  assert.ok(r2.ids.has('a/5'));
  // Empty + bad inputs don't throw.
  assert.equal(selectDriftBatch([], 0, 5).ids.size, 0);
  assert.equal(selectDriftBatch(null, 0, 5).ids.size, 0);
});

// ---------------------------------------------------------------------------
// Goal 2: revoked status is honored as a no-op pass-through.
// ---------------------------------------------------------------------------

test('revoked: sync is a pure pass-through, no fetch + no field changes', async () => {
  let calls = 0;
  const f = async () => { calls++; return new Response('', { status: 200 }); };
  const entry = {
    ...baseEntry,
    status: 'revoked',
    last_sha: 'beef',
    last_synced: '2026-01-01T00:00:00Z',
    last_error: 'pre-existing'
  };
  const r = await syncEntry(entry, { fetchImpl: f, now: () => new Date('2026-05-07T01:00:00Z') });
  assert.equal(calls, 0);
  assert.equal(r.status, 'revoked');
  assert.equal(r.last_sha, 'beef');
  // last_synced is intentionally NOT bumped — revoked means frozen.
  assert.equal(r.last_synced, '2026-01-01T00:00:00Z');
  assert.equal(r.last_error, 'pre-existing');
});

// ---------------------------------------------------------------------------
// Goal 3: structural body-size caps (adversarial graph defense).
// ---------------------------------------------------------------------------

test('cap: > 100k nodes → oversize, last_error "too many nodes"', async () => {
  const nodes = Array.from({ length: 100_001 }, (_, i) => ({ id: `n${i}`, kind: 'file', label: `f${i}` }));
  const body = JSON.stringify({ nodes, edges: [] });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.status, 'oversize');
  assert.equal(r.last_error, 'too many nodes');
});

test('cap: > 500k edges → oversize, last_error "too many edges"', async () => {
  const edges = Array.from({ length: 500_001 }, (_, i) => ({ from: 'a', to: 'b', kind: 'calls' }));
  const body = JSON.stringify({ nodes: [{ id: 'a', kind: 'file', label: 'x' }, { id: 'b', kind: 'file', label: 'y' }], edges });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.status, 'oversize');
  assert.equal(r.last_error, 'too many edges');
});

test('cap: label > 4096 chars → invalid, last_error "label too long"', async () => {
  const body = JSON.stringify({
    nodes: [{ id: 'n1', kind: 'file', label: 'x'.repeat(4097) }],
    edges: []
  });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.status, 'invalid');
  assert.equal(r.last_error, 'label too long');
});

test('cap: nested depth > 32 → invalid, last_error "schema bomb"', async () => {
  // Build a deeply-nested object: { a: { a: { a: ... } } } at depth 40.
  let nested = 'leaf';
  for (let i = 0; i < 40; i++) nested = { a: nested };
  const body = JSON.stringify({ nodes: [], edges: [], extra: nested });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(body, { status: 200 })
  });
  const r = await syncEntry({ ...baseEntry }, { fetchImpl: f, now: () => new Date() });
  assert.equal(r.status, 'invalid');
  assert.equal(r.last_error, 'schema bomb');
});

test('stats: previously-stat\'d entry that now fails schema clears stats fields', async () => {
  const bad = JSON.stringify({ nodes: [{ id: 'n1', kind: 'asteroid', label: 'x' }], edges: [] });
  const f = makeFetch({
    'https://example.com/g.json': () => new Response(bad, { status: 200 })
  });
  const stale = {
    ...baseEntry,
    nodes_count: 42,
    edges_count: 17,
    top_kinds: [{ kind: 'function', count: 9 }],
    languages: ['python']
  };
  const r = await syncEntry(stale, { fetchImpl: f, now: () => new Date('2026-05-07T00:00:00Z') });
  assert.equal(r.status, 'invalid');
  // Spec: stats fields must be undefined so JSON.stringify drops them. We
  // serialise + reparse to assert the user-visible shape.
  const round = JSON.parse(JSON.stringify(r));
  assert.equal('nodes_count' in round, false);
  assert.equal('edges_count' in round, false);
  assert.equal('top_kinds' in round, false);
  assert.equal('languages' in round, false);
});
