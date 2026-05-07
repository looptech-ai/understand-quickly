import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGitRemote,
  sniffFormat
} from '../src/detect.mjs';
import {
  buildEntry,
  buildRawGithubUrl,
  buildIssueUrl,
  parseTags,
  insertEntry
} from '../src/format.mjs';

// ---------- parseGitRemote ----------

test('parseGitRemote: SSH URL with .git suffix', () => {
  assert.equal(parseGitRemote('git@github.com:looptech-ai/understand-quickly.git'), 'looptech-ai/understand-quickly');
});

test('parseGitRemote: HTTPS URL with .git suffix', () => {
  assert.equal(parseGitRemote('https://github.com/looptech-ai/understand-quickly.git'), 'looptech-ai/understand-quickly');
});

test('parseGitRemote: HTTPS URL without .git suffix', () => {
  assert.equal(parseGitRemote('https://github.com/looptech-ai/understand-quickly'), 'looptech-ai/understand-quickly');
});

test('parseGitRemote: HTTPS URL with trailing slash', () => {
  assert.equal(parseGitRemote('https://github.com/looptech-ai/understand-quickly/'), 'looptech-ai/understand-quickly');
});

test('parseGitRemote: SSH URL without .git suffix', () => {
  assert.equal(parseGitRemote('git@github.com:looptech-ai/understand-quickly'), 'looptech-ai/understand-quickly');
});

test('parseGitRemote: junk URL throws', () => {
  assert.throws(() => parseGitRemote('https://gitlab.com/foo/bar'), /unrecognized git remote/);
});

test('parseGitRemote: empty string throws', () => {
  assert.throws(() => parseGitRemote(''), /git remote is empty/);
});

test('parseGitRemote: non-string throws', () => {
  assert.throws(() => parseGitRemote(null), /git remote is empty/);
});

// ---------- sniffFormat ----------

test('sniffFormat: understand-anything via metadata.tool', () => {
  const body = {
    nodes: [{ id: 'n1' }],
    edges: [],
    metadata: { tool: 'understand-anything', tool_version: '0.4.0' }
  };
  assert.equal(sniffFormat(body), 'understand-anything@1');
});

test('sniffFormat: gitnexus via graph.nodes + graph.links', () => {
  const body = {
    graph: {
      nodes: [{ id: 'proj:demo' }],
      links: [{ source: 'a', target: 'b' }]
    }
  };
  assert.equal(sniffFormat(body), 'gitnexus@1');
});

test('sniffFormat: code-review-graph via stats.nodes_by_kind', () => {
  const body = {
    nodes: [{ id: 1, kind: 'File' }],
    edges: [],
    stats: { total_nodes: 1, total_edges: 0, nodes_by_kind: { File: 1 } }
  };
  assert.equal(sniffFormat(body), 'code-review-graph@1');
});

test('sniffFormat: generic via nodes+edges', () => {
  const body = { nodes: [], edges: [] };
  assert.equal(sniffFormat(body), 'generic@1');
});

test('sniffFormat: unknown shape returns null', () => {
  assert.equal(sniffFormat({ random: 'thing', vertices: [] }), null);
  assert.equal(sniffFormat({}), null);
  assert.equal(sniffFormat(null), null);
  assert.equal(sniffFormat('a string'), null);
});

test('sniffFormat: prefers understand-anything over generic when both shapes match', () => {
  // understand-anything fixtures often have nodes+edges AND metadata.tool;
  // metadata.tool wins.
  const body = {
    nodes: [], edges: [],
    metadata: { tool: 'understand-anything' }
  };
  assert.equal(sniffFormat(body), 'understand-anything@1');
});

// ---------- buildEntry ----------

test('buildEntry: minimal valid entry', () => {
  const e = buildEntry({
    id: 'looptech-ai/understand-quickly',
    format: 'generic@1',
    graph_url: 'https://example.com/graph.json'
  });
  assert.equal(e.id, 'looptech-ai/understand-quickly');
  assert.equal(e.owner, 'looptech-ai');
  assert.equal(e.repo, 'understand-quickly');
  assert.equal(e.format, 'generic@1');
  assert.equal(e.graph_url, 'https://example.com/graph.json');
  assert.equal(e.description, undefined);
  assert.equal(e.tags, undefined);
});

test('buildEntry: with description, tags, branch', () => {
  const e = buildEntry({
    id: 'a/b',
    format: 'generic@1',
    graph_url: 'https://example.com/graph.json',
    default_branch: 'main',
    description: '  trims whitespace  ',
    tags: ['py', 'agents', 'py', '']
  });
  assert.equal(e.description, 'trims whitespace');
  assert.deepEqual(e.tags, ['agents', 'py']);
  assert.equal(e.default_branch, 'main');
});

test('buildEntry: throws on bad id', () => {
  assert.throws(() => buildEntry({ id: 'no-slash', format: 'generic@1', graph_url: 'x' }), /bad id/);
  assert.throws(() => buildEntry({ id: 'a/b/c', format: 'generic@1', graph_url: 'x' }), /bad id/);
});

test('buildEntry: throws on missing format / graph_url', () => {
  assert.throws(() => buildEntry({ id: 'a/b', graph_url: 'x' }), /format is required/);
  assert.throws(() => buildEntry({ id: 'a/b', format: 'generic@1' }), /graph_url is required/);
});

// ---------- buildRawGithubUrl ----------

test('buildRawGithubUrl: standard path', () => {
  assert.equal(
    buildRawGithubUrl('a/b', 'main', '.understand-anything/knowledge-graph.json'),
    'https://raw.githubusercontent.com/a/b/main/.understand-anything/knowledge-graph.json'
  );
});

test('buildRawGithubUrl: encodes path segments individually', () => {
  // Slashes must be preserved; spaces inside a segment must be encoded.
  assert.equal(
    buildRawGithubUrl('a/b', 'main', 'sub dir/file name.json'),
    'https://raw.githubusercontent.com/a/b/main/sub%20dir/file%20name.json'
  );
});

// ---------- buildIssueUrl ----------

test('buildIssueUrl: encodes title and body', () => {
  const entry = buildEntry({
    id: 'a/b',
    format: 'generic@1',
    graph_url: 'https://example.com/graph.json',
    description: 'has & chars and "quotes"'
  });
  const url = buildIssueUrl('looptech-ai/understand-quickly', entry);
  // URL is parseable
  const parsed = new URL(url);
  assert.equal(parsed.hostname, 'github.com');
  assert.equal(parsed.pathname, '/looptech-ai/understand-quickly/issues/new');
  // Special chars round-trip correctly through URLSearchParams.
  const body = parsed.searchParams.get('body');
  assert.match(body, /has & chars and "quotes"/);
  const title = parsed.searchParams.get('title');
  assert.equal(title, 'Add a/b to registry');
  assert.equal(parsed.searchParams.get('labels'), 'add-repo');
});

// ---------- parseTags ----------

test('parseTags: comma-separated', () => {
  assert.deepEqual(parseTags('python, agents,llm '), ['python', 'agents', 'llm']);
});

test('parseTags: empty / null', () => {
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags(undefined), []);
});

// ---------- insertEntry ----------

test('insertEntry: inserts in alphabetical order', () => {
  const reg = {
    schema_version: 1,
    entries: [
      { id: 'b/b', format: 'generic@1', graph_url: 'x' },
      { id: 'd/d', format: 'generic@1', graph_url: 'x' }
    ]
  };
  const next = insertEntry(reg, { id: 'c/c', format: 'generic@1', graph_url: 'x' });
  assert.deepEqual(next.entries.map(e => e.id), ['b/b', 'c/c', 'd/d']);
});

test('insertEntry: throws on duplicate id', () => {
  const reg = { entries: [{ id: 'a/a', format: 'generic@1', graph_url: 'x' }] };
  assert.throws(() => insertEntry(reg, { id: 'a/a', format: 'generic@1', graph_url: 'y' }), /already exists/);
});
