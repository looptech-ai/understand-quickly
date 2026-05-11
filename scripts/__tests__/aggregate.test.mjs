import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { aggregate } from '../aggregate.mjs';

function startServer(routes) {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      // Guard against prototype-chain lookups so a malformed URL like
      // `/__proto__` can't invoke an inherited method as a handler.
      // Hardens against js/unvalidated-dynamic-method-call.
      const handler = Object.prototype.hasOwnProperty.call(routes, req.url)
        ? routes[req.url]
        : null;
      if (typeof handler !== 'function') { res.writeHead(404); res.end(); return; }
      handler(req, res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

function closeServer(srv) {
  return new Promise(resolve => srv.close(() => resolve()));
}

// Two minimal-but-real graphs that share the term "auth" and the language
// "python", let us assert dedupe + cross-graph counting.
const understandAnythingBody = JSON.stringify({
  nodes: [
    { id: 'n1', kind: 'function', label: 'authenticate user' },
    { id: 'n2', kind: 'function', label: 'login flow' },
    { id: 'n3', kind: 'file', label: 'auth.py' },
    // Repeats of the same word inside one entry should not double-count
    // for the per-entry uniqueness used by `concepts.entries`.
    { id: 'n4', kind: 'function', label: 'authenticate twice' }
  ],
  edges: [
    { from: 'n1', to: 'n2', kind: 'calls' },
    { from: 'n3', to: 'n1', kind: 'contains' }
  ]
});

const codeReviewGraphBody = JSON.stringify({
  nodes: [
    {
      id: 1, kind: 'Function', name: 'auth',
      qualified_name: 'app/auth.py::auth', file_path: 'app/auth.py'
    },
    {
      id: 2, kind: 'Function', name: 'login',
      qualified_name: 'app/auth.py::login', file_path: 'app/auth.py'
    }
  ],
  edges: [
    { id: 1, kind: 'CALLS', source: 'app/auth.py::auth', target: 'app/auth.py::login' }
  ],
  // Mixed-case + duplicate to exercise dedupe + lowercase.
  stats: {
    total_nodes: 2,
    total_edges: 1,
    nodes_by_kind: {},
    edges_by_kind: {},
    languages: ['Python', 'python'],
    files_count: 1
  }
});

test('aggregate: cross-graph dedupe + counting + concept threshold', async () => {
  const { srv, port } = await startServer({
    '/ua.json': (_req, res) => { res.writeHead(200); res.end(understandAnythingBody); },
    '/cr.json': (_req, res) => { res.writeHead(200); res.end(codeReviewGraphBody); }
  });
  try {
    const registry = {
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: [
        {
          id: 'a/b', owner: 'a', repo: 'b',
          format: 'understand-anything@1', status: 'ok',
          graph_url: `http://127.0.0.1:${port}/ua.json`, description: 'd'
        },
        {
          id: 'c/d', owner: 'c', repo: 'd',
          format: 'code-review-graph@1', status: 'ok',
          graph_url: `http://127.0.0.1:${port}/cr.json`, description: 'd'
        }
      ]
    };
    const out = await aggregate({
      registry,
      fetchImpl: fetch,
      now: () => new Date('2026-05-07T01:23:45Z')
    });

    // Top-level shape and totals.
    assert.equal(out.schema_version, 1);
    assert.equal(out.generated_at, '2026-05-07T01:23:45.000Z');
    assert.equal(out.totals.entries, 2);
    assert.equal(out.totals.nodes, 4 + 2);
    assert.equal(out.totals.edges, 2 + 1);

    // Kinds: lowercased + sorted desc by count, deduped across graphs.
    // understand-anything: function x3, file x1
    // code-review-graph:   function x2 (lowercased from 'Function')
    const kindMap = Object.fromEntries(out.kinds.map(k => [k.kind, k]));
    assert.equal(kindMap.function.count, 5);
    assert.equal(kindMap.function.entries, 2);
    assert.equal(kindMap.file.count, 1);
    assert.equal(kindMap.file.entries, 1);
    // Sorted desc by count -> function comes before file.
    assert.deepEqual(out.kinds.map(k => k.kind), ['function', 'file']);

    // Languages: code-review-graph contributes 'python' (deduped from
    // 'Python'/'python'); understand-anything contributes none.
    assert.deepEqual(out.languages, [{ language: 'python', entries: 1 }]);

    // Concepts: only terms appearing in >= 2 entries are kept. 'auth' should
    // qualify (graph A's 'auth.py' / 'authenticate' tokens normalize to 'auth'?
    // No -- tokenize splits on non-letters but doesn't stem). The shared
    // term we engineered is 'login' (entry A: 'login flow'; entry B: 'login').
    const conceptTerms = out.concepts.map(c => c.term);
    assert.ok(conceptTerms.includes('login'), `expected 'login' in concepts, got ${conceptTerms.join(',')}`);
    const login = out.concepts.find(c => c.term === 'login');
    assert.equal(login.entries, 2);
    assert.deepEqual(login.samples.sort(), ['a/b', 'c/d']);

    // Stopwords (e.g. 'the', 'and') must never appear in concepts.
    for (const sw of ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'our', 'use', 'uses', 'used']) {
      assert.ok(!conceptTerms.includes(sw), `stopword leaked into concepts: ${sw}`);
    }

    // No concept term should appear with entries < 2.
    for (const c of out.concepts) assert.ok(c.entries >= 2, `${c.term} has entries=${c.entries}`);

    // Samples capped at 3 (we have 2 entries here so always <= 2, but the
    // length contract is well-defined).
    for (const c of out.concepts) assert.ok(c.samples.length <= 3);
  } finally { await closeServer(srv); }
});

test('aggregate: zero ok entries -> empty arrays + zero totals', async () => {
  const out = await aggregate({
    registry: {
      schema_version: 1, generated_at: '2026-05-07T00:00:00Z',
      entries: [
        // missing graph_url
        { id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1', status: 'ok', description: '' },
        // not ok
        { id: 'a/b', owner: 'a', repo: 'b', format: 'understand-anything@1', status: 'invalid',
          graph_url: 'http://example.invalid/g.json', description: '' }
      ]
    },
    fetchImpl: async () => { throw new Error('should not fetch'); },
    now: () => new Date('2026-05-07T00:00:00Z')
  });
  assert.equal(out.totals.entries, 0);
  assert.equal(out.totals.nodes, 0);
  assert.equal(out.totals.edges, 0);
  assert.deepEqual(out.kinds, []);
  assert.deepEqual(out.languages, []);
  assert.deepEqual(out.concepts, []);
});

test('aggregate: fetch failure on one entry is skipped, others counted', async () => {
  const okBody = JSON.stringify({
    nodes: [
      { id: 'n1', kind: 'function', label: 'login' },
      { id: 'n2', kind: 'function', label: 'logout' }
    ],
    edges: []
  });
  const { srv, port } = await startServer({
    '/ok.json': (_req, res) => { res.writeHead(200); res.end(okBody); },
    '/fail.json': (_req, res) => { res.writeHead(500); res.end(); }
  });
  try {
    const out = await aggregate({
      registry: {
        schema_version: 1, generated_at: '2026-05-07T00:00:00Z',
        entries: [
          { id: 'ok/one', owner: 'ok', repo: 'one', format: 'understand-anything@1', status: 'ok',
            graph_url: `http://127.0.0.1:${port}/ok.json`, description: '' },
          { id: 'bad/two', owner: 'bad', repo: 'two', format: 'understand-anything@1', status: 'ok',
            graph_url: `http://127.0.0.1:${port}/fail.json`, description: '' }
        ]
      },
      fetchImpl: fetch,
      now: () => new Date('2026-05-07T00:00:00Z')
    });
    assert.equal(out.totals.entries, 1);
    assert.equal(out.totals.nodes, 2);
  } finally { await closeServer(srv); }
});

test('aggregate: missing registry / null is non-throwing', async () => {
  const out = await aggregate({
    registry: null,
    fetchImpl: async () => { throw new Error('unreachable'); },
    now: () => new Date('2026-05-07T00:00:00Z')
  });
  assert.equal(out.totals.entries, 0);
  assert.deepEqual(out.kinds, []);
});
