import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { syncEntry } from '../sync.mjs';
import { fetchAndValidate } from '../validate.mjs';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = process.cwd();

function startServer(routes) {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      const handler = routes[req.url];
      if (!handler) { res.writeHead(404); res.end(); return; }
      handler(req, res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

function closeServer(srv) {
  return new Promise(resolve => srv.close(() => resolve()));
}

test('integration: 200 ok body validates', async () => {
  const okBody = readFileSync('schemas/__fixtures__/understand-anything/ok.json', 'utf8');
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(okBody); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'ok');
    assert.ok(r.last_sha);
  } finally { await closeServer(srv); }
});

test('integration: 500 yields transient_error', async () => {
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(500); res.end('boom'); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'transient_error');
  } finally { await closeServer(srv); }
});

test('integration: malformed JSON marks invalid', async () => {
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('not json'); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'invalid');
  } finally { await closeServer(srv); }
});

test('integration: useHead HEAD-not-ok still proceeds to GET', async () => {
  const okBody = readFileSync('schemas/__fixtures__/understand-anything/ok.json', 'utf8');
  const { srv, port } = await startServer({
    '/g.json': (req, res) => {
      if (req.method === 'HEAD') { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(okBody);
    }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    }, { useHead: true });
    assert.equal(r.status, 'ok');
  } finally { await closeServer(srv); }
});

test('integration: 403 unexpected status maps to transient_error', async () => {
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(403); res.end(); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'transient_error');
    assert.match(r.last_error, /403/);
  } finally { await closeServer(srv); }
});

test('integration: oversize body marks oversize', async () => {
  const big = 'x'.repeat(50 * 1024 * 1024 + 1);
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(big); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'oversize');
  } finally { await closeServer(srv); }
});

test('integration: ETag is sent and 304 honored', async () => {
  let sentIfNoneMatch = null;
  const { srv, port } = await startServer({
    '/g.json': (req, res) => {
      sentIfNoneMatch = req.headers['if-none-match'] || null;
      res.writeHead(304); res.end();
    }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd',
      last_sha: 'abc'
    }, { etagFor: () => '"etag-1"' });
    assert.equal(sentIfNoneMatch, '"etag-1"');
    assert.equal(r.status, 'ok');
  } finally { await closeServer(srv); }
});

test('integration: fetchAndValidate happy path', async () => {
  const okBody = readFileSync('schemas/__fixtures__/understand-anything/ok.json', 'utf8');
  const { srv, port } = await startServer({
    '/g.json': (req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-length': String(Buffer.byteLength(okBody)) });
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(okBody);
    }
  });
  try {
    const r = await fetchAndValidate({
      format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`
    });
    assert.equal(r.ok, true);
  } finally { await closeServer(srv); }
});

test('integration: fetchAndValidate HEAD failure', async () => {
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(404); res.end(); }
  });
  try {
    const r = await fetchAndValidate({
      format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`
    });
    assert.equal(r.ok, false);
    assert.match(r.errors[0].message, /HEAD/);
  } finally { await closeServer(srv); }
});

test('integration: fetchAndValidate oversize via HEAD content-length', async () => {
  const { srv, port } = await startServer({
    '/g.json': (req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-length': String(60 * 1024 * 1024) });
        res.end();
        return;
      }
      res.writeHead(200); res.end('{}');
    }
  });
  try {
    const r = await fetchAndValidate({
      format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`
    });
    assert.equal(r.ok, false);
    assert.match(r.errors[0].message, /oversize/);
  } finally { await closeServer(srv); }
});

test('integration: fetchAndValidate GET failure after HEAD ok', async () => {
  const { srv, port } = await startServer({
    '/g.json': (req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-length': '10' });
        res.end();
        return;
      }
      res.writeHead(500); res.end();
    }
  });
  try {
    const r = await fetchAndValidate({
      format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`
    });
    assert.equal(r.ok, false);
    assert.match(r.errors[0].message, /GET/);
  } finally { await closeServer(srv); }
});

test('integration: fetchAndValidate invalid JSON', async () => {
  const { srv, port } = await startServer({
    '/g.json': (req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-length': '5' });
        res.end();
        return;
      }
      res.writeHead(200); res.end('nope');
    }
  });
  try {
    const r = await fetchAndValidate({
      format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`
    });
    assert.equal(r.ok, false);
    assert.match(r.errors[0].message, /JSON/);
  } finally { await closeServer(srv); }
});

// CLI / main() coverage via subprocess. c8 instruments child processes via
// NODE_V8_COVERAGE which it sets when running the parent test runner.
//
// Use async spawn (not spawnSync) for tests that depend on a local HTTP
// server in the same process — spawnSync blocks the event loop and the
// server cannot respond, deadlocking the test.
function runNode(scriptRel, args, { cwd = PROJECT_ROOT, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(PROJECT_ROOT, scriptRel), ...args], {
      cwd,
      env: { ...process.env, ...env }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`runNode timeout: ${scriptRel} ${args.join(' ')}\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 30000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ status: code, signal, stdout, stderr });
    });
    child.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

function copySchemas(dst) {
  const schemasSrc = join(PROJECT_ROOT, 'schemas');
  cpSync(schemasSrc, dst, { recursive: true });
}

test('cli: sync --dry-run prints JSON with empty registry', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    const regPath = join(tmp, 'registry.json');
    writeFileSync(regPath, JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: []
    }) + '\n');
    const r = await runNode('scripts/sync.mjs', ['--registry', regPath, '--dry-run']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.schema_version, 1);
    assert.equal(parsed.entries.length, 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('cli: sync --only filters and writes registry', async () => {
  const okBody = readFileSync('schemas/__fixtures__/understand-anything/ok.json', 'utf8');
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(okBody); }
  });
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    const regPath = join(tmp, 'registry.json');
    writeFileSync(regPath, JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: [
        {
          id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
          graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
        },
        {
          id: 'a/b', owner: 'a', repo: 'b', format: 'understand-anything@1',
          graph_url: `http://127.0.0.1:${port}/missing`, description: 'd2'
        }
      ]
    }) + '\n');
    const r = await runNode('scripts/sync.mjs', ['--registry', regPath, '--only', 'x/y']);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const written = JSON.parse(readFileSync(regPath, 'utf8'));
    const xy = written.entries.find(e => e.id === 'x/y');
    const ab = written.entries.find(e => e.id === 'a/b');
    assert.equal(xy.status, 'ok');
    assert.equal(ab.status, undefined);
  } finally { await closeServer(srv); rmSync(tmp, { recursive: true, force: true }); }
});

test('cli: render-readme handles missing README', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    writeFileSync(join(tmp, 'registry.json'), JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: []
    }) + '\n');
    const r = await runNode('scripts/render-readme.mjs', [], { cwd: tmp });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /skipping render/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('cli: render-readme updates and is idempotent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    writeFileSync(join(tmp, 'registry.json'), JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: [{
        id: 'foo/bar', owner: 'foo', repo: 'bar', format: 'understand-anything@1',
        graph_url: 'https://example.com/g.json', description: 'hi',
        status: 'ok', last_synced: '2026-05-07T00:00:00Z'
      }]
    }) + '\n');
    const tpl = 'PRE\n<!-- BEGIN ENTRIES -->\nold\n<!-- END ENTRIES -->\nPOST\n';
    writeFileSync(join(tmp, 'README.md'), tpl);
    const r = await runNode('scripts/render-readme.mjs', [], { cwd: tmp });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /README updated/);
    const out = readFileSync(join(tmp, 'README.md'), 'utf8');
    assert.match(out, /foo\/bar/);
    const r2 = await runNode('scripts/render-readme.mjs', [], { cwd: tmp });
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /up-to-date/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('cli: validate happy path with empty entries', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    copySchemas(join(tmp, 'schemas'));
    writeFileSync(join(tmp, 'registry.json'), JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: []
    }) + '\n');
    const r = await runNode('scripts/validate.mjs', [], { cwd: tmp });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, /OK: 0 entries validated/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('cli: validate fails fast on invalid registry', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    copySchemas(join(tmp, 'schemas'));
    writeFileSync(join(tmp, 'registry.json'), JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: [{
        id: 'foo/bar', owner: 'foo', repo: 'bar', format: 'understand-anything@1',
        description: 'x'
      }]
    }) + '\n');
    const r = await runNode('scripts/validate.mjs', [], { cwd: tmp });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /REGISTRY INVALID/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('cli: validate uses CHANGED_IDS subset and reports ENTRY error on bad fetch', async () => {
  // Use a real local server that returns 500 so HEAD fails -> validate exits 1.
  const { srv, port } = await startServer({
    '/g.json': (_req, res) => { res.writeHead(500); res.end(); }
  });
  const tmp = mkdtempSync(join(tmpdir(), 'uq-itest-'));
  try {
    copySchemas(join(tmp, 'schemas'));
    writeFileSync(join(tmp, 'registry.json'), JSON.stringify({
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: [
        {
          id: 'foo/bar', owner: 'foo', repo: 'bar', format: 'understand-anything@1',
          graph_url: `http://127.0.0.1:${port}/g.json`, description: 'x'
        },
        {
          id: 'baz/qux', owner: 'baz', repo: 'qux', format: 'understand-anything@1',
          graph_url: `http://127.0.0.1:${port}/other`, description: 'y'
        }
      ]
    }) + '\n');
    // Note: schema requires https graph_url, so registry validation will fail
    // before fetchAndValidate runs. To exercise fetchAndValidate via main(),
    // patch the meta schema in the temp dir to allow http:.
    const metaPath = join(tmp, 'schemas', 'meta.schema.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    // Find graph_url constraint and relax pattern.
    const entryProps = meta?.$defs?.entry?.properties;
    if (entryProps && entryProps.graph_url && entryProps.graph_url.pattern) {
      entryProps.graph_url.pattern = '^https?://';
    }
    writeFileSync(metaPath, JSON.stringify(meta));
    const r = await runNode('scripts/validate.mjs', [], {
      cwd: tmp,
      env: { CHANGED_IDS: 'foo/bar' }
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ENTRY foo\/bar/);
    assert.doesNotMatch(r.stderr, /ENTRY baz\/qux/);
  } finally { await closeServer(srv); rmSync(tmp, { recursive: true, force: true }); }
});
