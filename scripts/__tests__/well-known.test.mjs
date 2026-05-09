import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAboutRecord,
  buildReposRecord,
  buildIndexRecord,
  renderWellKnown
} from '../well-known.mjs';

test('buildAboutRecord: returns valid object with all 7 service fields', () => {
  const about = buildAboutRecord();
  assert.equal(about.schema_version, 1);
  assert.ok(about.service && typeof about.service === 'object', 'service block must exist');
  const expected = ['name', 'url', 'registry_url', 'stats_url', 'badge_base', 'spec_url', 'discovery_url'];
  for (const k of expected) {
    assert.ok(typeof about.service[k] === 'string' && about.service[k].length > 0,
      `service.${k} must be a non-empty string`);
  }
  assert.equal(Object.keys(about.service).sort().join(','), expected.slice().sort().join(','),
    'service must contain exactly the 7 documented fields');
});

test('buildAboutRecord: respects --base override', () => {
  const about = buildAboutRecord({ base: 'https://example.invalid/foo' });
  assert.equal(about.service.url, 'https://example.invalid/foo/');
  assert.equal(about.service.registry_url, 'https://example.invalid/foo/registry.json');
  assert.equal(about.service.discovery_url, 'https://example.invalid/foo/.well-known/code-graph-discovery.html');
});

test('buildReposRecord: filters to status: ok only', () => {
  const reg = {
    entries: [
      { id: 'a/b', format: 'understand-anything@1', graph_url: 'https://x/g.json', status: 'ok',
        last_synced: '2026-05-09T00:00:00Z', source_sha: 'aabbcc' },
      { id: 'c/d', format: 'gitnexus@1', graph_url: 'https://x/h.json', status: 'invalid',
        last_synced: '2026-05-09T00:00:00Z', source_sha: null },
      { id: 'e/f', format: 'understand-anything@1', graph_url: 'https://x/i.json', status: 'pending',
        last_synced: null, source_sha: null },
      { id: 'g/h', format: 'code-review-graph@1', graph_url: 'https://x/j.json', status: 'oversize',
        last_synced: '2026-05-09T00:00:00Z', source_sha: null }
    ]
  };
  const out = buildReposRecord(reg);
  assert.equal(out.schema_version, 1);
  assert.equal(out.repos.length, 1);
  assert.equal(out.repos[0].id, 'a/b');
});

test('buildReposRecord: each repo has exactly the documented 6 fields', () => {
  const reg = {
    entries: [
      {
        id: 'a/b', format: 'understand-anything@1', graph_url: 'https://x/g.json',
        status: 'ok', last_synced: '2026-05-09T00:00:00Z', source_sha: 'aabbcc',
        // Internal/extra fields the agent index MUST NOT expose.
        miss_count: 0, last_error: null, drift_checked_at: '2026-05-09T00:00:00Z',
        nodes_count: 7, edges_count: 7, languages: ['python']
      }
    ]
  };
  const out = buildReposRecord(reg);
  assert.equal(out.repos.length, 1);
  const expected = ['id', 'format', 'graph_url', 'last_synced', 'status', 'source_sha'];
  const got = Object.keys(out.repos[0]).sort();
  assert.deepEqual(got, expected.slice().sort(),
    `repo record must have exactly: ${expected.join(', ')}; got: ${got.join(', ')}`);
});

test('buildReposRecord: empty registry returns { schema_version: 1, repos: [] }', () => {
  assert.deepEqual(buildReposRecord({ entries: [] }), { schema_version: 1, repos: [] });
  assert.deepEqual(buildReposRecord({}), { schema_version: 1, repos: [] });
  assert.deepEqual(buildReposRecord(null), { schema_version: 1, repos: [] });
  assert.deepEqual(buildReposRecord(undefined), { schema_version: 1, repos: [] });
});

test('buildReposRecord: missing optional fields default to null (not undefined)', () => {
  const reg = {
    entries: [
      { id: 'a/b', format: 'understand-anything@1', graph_url: 'https://x/g.json', status: 'ok' }
    ]
  };
  const out = buildReposRecord(reg);
  assert.equal(out.repos[0].last_synced, null);
  assert.equal(out.repos[0].source_sha, null);
  // Confirm JSON.stringify doesn't drop fields (undefined would be silently removed).
  const round = JSON.parse(JSON.stringify(out));
  assert.ok('last_synced' in round.repos[0]);
  assert.ok('source_sha' in round.repos[0]);
});

test('buildIndexRecord: lists three documented endpoints', () => {
  const idx = buildIndexRecord();
  assert.equal(idx.schema_version, 1);
  assert.equal(idx.endpoints.length, 3);
  const paths = idx.endpoints.map(e => e.path).sort();
  assert.deepEqual(paths, [
    '/.well-known/code-graph-discovery.html',
    '/.well-known/code-graph.json',
    '/.well-known/repos.json'
  ]);
  for (const ep of idx.endpoints) {
    assert.equal(typeof ep.url, 'string');
    assert.equal(typeof ep.description, 'string');
    assert.equal(ep.schema_version, 1);
  }
});

test('renderWellKnown: writes 3 files for an empty registry', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-well-known-empty-'));
  const result = renderWellKnown({ registry: { entries: [] }, outDir: out });
  assert.equal(result.total, 3);
  assert.equal(result.written, 3);
  assert.equal(result.repos, 0);
  const files = readdirSync(out).sort();
  assert.deepEqual(files, ['code-graph.json', 'index.json', 'repos.json']);
  const repos = JSON.parse(readFileSync(join(out, 'repos.json'), 'utf8'));
  assert.deepEqual(repos, { schema_version: 1, repos: [] });
});

test('renderWellKnown: re-running with no changes is a no-op', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-well-known-noop-'));
  const reg = {
    entries: [
      { id: 'a/b', format: 'understand-anything@1', graph_url: 'https://x/g.json',
        status: 'ok', last_synced: '2026-05-09T00:00:00Z', source_sha: 'aabbcc' }
    ]
  };
  const first = renderWellKnown({ registry: reg, outDir: out });
  assert.equal(first.written, 3);
  const second = renderWellKnown({ registry: reg, outDir: out });
  assert.equal(second.written, 0);
  assert.equal(second.skipped, 3);
});

test('renderWellKnown: produces valid JSON in all three files', () => {
  const out = mkdtempSync(join(tmpdir(), 'uq-well-known-json-'));
  const reg = {
    entries: [
      { id: 'a/b', format: 'understand-anything@1', graph_url: 'https://x/g.json', status: 'ok' }
    ]
  };
  renderWellKnown({ registry: reg, outDir: out });
  const about = JSON.parse(readFileSync(join(out, 'code-graph.json'), 'utf8'));
  const repos = JSON.parse(readFileSync(join(out, 'repos.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'));
  assert.equal(about.schema_version, 1);
  assert.equal(repos.schema_version, 1);
  assert.equal(index.schema_version, 1);
});
