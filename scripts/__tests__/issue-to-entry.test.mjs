import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseIssueBody,
  buildEntry,
  addEntryToRegistry
} from '../issue-to-entry.mjs';
import { validateRegistry } from '../validate.mjs';

const CLI = new URL('../issue-to-entry.mjs', import.meta.url).pathname;

// A realistic GitHub form-issue body — copy/pasted shape from how GitHub
// actually renders the add-repo.yml form when the user submits the issue.
const REAL_BODY = `### Repo id

you/yourrepo

### Graph format

understand-anything@1

### graph_url

https://example.com/graph.json

### Description

A graph for the example repo.

### Tags

python, agents, demo

### Optional add-ons

- [X] I'll also drop the publish workflow into my repo for instant-refresh on push.
`;

test('parseIssueBody happy path: realistic form body', () => {
  const out = parseIssueBody(REAL_BODY);
  assert.deepEqual(out, {
    id: 'you/yourrepo',
    format: 'understand-anything@1',
    graph_url: 'https://example.com/graph.json',
    description: 'A graph for the example repo.',
    tags: ['python', 'agents', 'demo'],
    instant_refresh: true
  });
});

test('parseIssueBody tolerates CRLF and extra blank lines', () => {
  const body = REAL_BODY
    .replace(/\n/g, '\r\n')
    .replace('### graph_url\r\n', '### graph_url\r\n\r\n');
  const out = parseIssueBody(body);
  assert.equal(out.graph_url, 'https://example.com/graph.json');
});

test('parseIssueBody returns empty array when tags is _No response_', () => {
  const body = REAL_BODY.replace('python, agents, demo', '_No response_');
  const out = parseIssueBody(body);
  assert.deepEqual(out.tags, []);
});

test('parseIssueBody returns empty array when tags is blank', () => {
  // Replace the tags value with whitespace only.
  const body = REAL_BODY.replace(/### Tags\n\npython, agents, demo/, '### Tags\n\n');
  const out = parseIssueBody(body);
  assert.deepEqual(out.tags, []);
});

test('parseIssueBody splits + trims tags, drops empties', () => {
  const body = REAL_BODY.replace(
    'python, agents, demo',
    '  python ,, agents,  ,demo,'
  );
  const out = parseIssueBody(body);
  assert.deepEqual(out.tags, ['python', 'agents', 'demo']);
});

test('parseIssueBody flags unchecked Optional add-ons as instant_refresh=false', () => {
  const body = REAL_BODY.replace('- [X]', '- [ ]');
  const out = parseIssueBody(body);
  assert.equal(out.instant_refresh, false);
});

test('parseIssueBody throws naming the missing required field (id)', () => {
  // Drop the entire "Repo id" section.
  const body = REAL_BODY.replace(/### Repo id\n\nyou\/yourrepo\n\n/, '');
  assert.throws(() => parseIssueBody(body), /Repo id/);
});

test('parseIssueBody throws naming the missing required field (graph_url)', () => {
  // Replace graph_url value with _No response_ — required, so should throw.
  const body = REAL_BODY.replace(
    'https://example.com/graph.json',
    '_No response_'
  );
  assert.throws(() => parseIssueBody(body), /graph_url/);
});

test('parseIssueBody trims whitespace around values', () => {
  const body = REAL_BODY.replace(
    'A graph for the example repo.',
    '   A graph for the example repo.   '
  );
  const out = parseIssueBody(body);
  assert.equal(out.description, 'A graph for the example repo.');
});

test('buildEntry: tags omitted when parsed list is empty', () => {
  const parsed = parseIssueBody(
    REAL_BODY.replace('python, agents, demo', '_No response_')
  );
  const entry = buildEntry(parsed);
  assert.equal('tags' in entry, false);
});

test('buildEntry: trims description and splits id into owner/repo', () => {
  const parsed = {
    id: 'foo/bar',
    format: 'generic@1',
    graph_url: 'https://example.com/g.json',
    description: '   spaced description   ',
    tags: [],
    instant_refresh: false
  };
  const entry = buildEntry(parsed);
  assert.equal(entry.owner, 'foo');
  assert.equal(entry.repo, 'bar');
  assert.equal(entry.description, 'spaced description');
});

test('buildEntry: invalid id throws', () => {
  assert.throws(
    () => buildEntry({
      id: 'no-slash',
      format: 'generic@1',
      graph_url: 'https://example.com/g.json',
      description: 'x',
      tags: []
    }),
    /Invalid id/
  );
});

test('buildEntry produces an ajv-valid registry entry', () => {
  const parsed = parseIssueBody(REAL_BODY);
  const entry = buildEntry(parsed);
  const r = validateRegistry({
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [entry]
  });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('validateRegistry catches a deliberately broken entry', () => {
  // Sanity check the negative case so we know the ajv plumbing is wired.
  const parsed = parseIssueBody(REAL_BODY);
  const entry = buildEntry(parsed);
  // Force an invalid graph_url (must start with https://).
  entry.graph_url = 'http://example.com/g.json';
  const r = validateRegistry({
    schema_version: 1,
    generated_at: '2026-05-07T00:00:00Z',
    entries: [entry]
  });
  assert.equal(r.ok, false);
});

test('addEntryToRegistry round-trips: writes valid JSON, no corruption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i2e-'));
  const path = join(dir, 'registry.json');
  try {
    const initial = {
      schema_version: 1,
      generated_at: '2026-05-07T00:00:00Z',
      entries: [{
        id: 'existing/one',
        owner: 'existing',
        repo: 'one',
        format: 'generic@1',
        graph_url: 'https://example.com/one.json',
        description: 'first'
      }]
    };
    writeFileSync(path, JSON.stringify(initial, null, 2) + '\n', 'utf8');

    const entry = buildEntry(parseIssueBody(REAL_BODY));
    addEntryToRegistry(path, entry);

    const after = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(after.entries.length, 2);
    assert.equal(after.entries[1].id, 'you/yourrepo');
    // Existing entry untouched.
    assert.equal(after.entries[0].id, 'existing/one');
    // The merged registry still passes the meta-schema.
    const r = validateRegistry(after);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    // File ends with a trailing newline (POSIX-friendly).
    assert.equal(readFileSync(path, 'utf8').endsWith('\n'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('addEntryToRegistry refuses duplicate id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i2e-'));
  const path = join(dir, 'registry.json');
  try {
    const entry = buildEntry(parseIssueBody(REAL_BODY));
    writeFileSync(
      path,
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-07T00:00:00Z',
        entries: [entry]
      }, null, 2) + '\n',
      'utf8'
    );
    assert.throws(() => addEntryToRegistry(path, entry), /already contains/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('addEntryToRegistry rejects a registry with no entries array', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i2e-'));
  const path = join(dir, 'registry.json');
  try {
    writeFileSync(path, JSON.stringify({ schema_version: 1 }), 'utf8');
    const entry = buildEntry(parseIssueBody(REAL_BODY));
    assert.throws(() => addEntryToRegistry(path, entry), /no entries array/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI tests — invoke the script as a subprocess to cover the main()/parseArgs
// path. We avoid network by either supplying invalid args (exits before
// fetch) or by using a body whose `id` is malformed (buildEntry throws first).
// ---------------------------------------------------------------------------

test('CLI: missing --body-file/--registry exits non-zero with usage', () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage:/);
});

test('CLI: parse failure exits 1 with single-line reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i2e-cli-'));
  const bodyPath = join(dir, 'body.md');
  const regPath = join(dir, 'registry.json');
  try {
    // Missing the entire "Repo id" section — required field, parser throws.
    writeFileSync(
      bodyPath,
      `### Graph format\n\ngeneric@1\n\n### graph_url\n\nhttps://x/g.json\n\n### Description\n\ntest\n`,
      'utf8'
    );
    writeFileSync(
      regPath,
      JSON.stringify({ schema_version: 1, generated_at: '2026-05-07T00:00:00Z', entries: [] }) + '\n',
      'utf8'
    );
    const r = spawnSync(
      process.execPath,
      [CLI, `--body-file=${bodyPath}`, `--registry=${regPath}`, '--dry-run'],
      { encoding: 'utf8' }
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Repo id/);
    // Single-line reason — no embedded newlines.
    assert.equal(r.stderr.trim().split('\n').length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
