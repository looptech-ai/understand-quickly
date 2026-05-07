# understand-quickly Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `understand-quickly/registry` GitHub repo: a public, machine-readable index of code-knowledge graphs (Understand-Anything, GitNexus, generic) that AI agents and humans can consume with zero backend.

**Architecture:** Single repo. Git is storage. GitHub Actions are the only compute. `registry.json` is the canonical index; per-format JSON Schemas validate entries; three Node scripts (`validate`, `sync`, `render-readme`) plus three workflows (`validate.yml`, `sync.yml`, `render.yml`) cover PR validation, nightly+dispatch resync, and auto-rendered README. Pointer-only — graphs live in source repos.

**Tech Stack:** Node 20 (built-in `node:test`, `node:http`, `fetch`), `ajv` (schema validation), `c8` (coverage), GitHub Actions, `peter-evans/repository-dispatch@v3` for source-repo opt-in.

**Parallelization:** Tasks are grouped into **waves**. Tasks within a wave are independent and SHOULD be dispatched in parallel via `superpowers:dispatching-parallel-agents`. Tasks across waves are sequential — each wave depends on the previous one.

```
Wave 0  → Task 1                              (scaffold)
Wave 1  → Tasks 2, 3, 4, 5         in parallel (schemas + fixtures)
Wave 2  → Tasks 6, 7, 8            in parallel (scripts)
Wave 3  → Task  9                              (integration test harness, depends on all scripts)
Wave 4  → Tasks 10, 11, 12         in parallel (workflows)
Wave 5  → Tasks 13, 14, 15         in parallel (README, publish template, self-register)
Wave 6  → Task 16                              (final coverage gate + repo polish)
```

---

## File Structure

```
understand-quickly/registry/
├── .github/
│   └── workflows/
│       ├── validate.yml          # Task 10
│       ├── sync.yml              # Task 11
│       └── render.yml            # Task 12
├── docs/
│   ├── superpowers/
│   │   ├── specs/2026-05-07-understand-quickly-registry-design.md  (already exists)
│   │   └── plans/2026-05-07-understand-quickly-registry.md         (this file)
│   └── publish-template.yml      # Task 14
├── schemas/
│   ├── meta.schema.json          # Task 2
│   ├── understand-anything@1.json # Task 3
│   ├── gitnexus@1.json           # Task 4
│   ├── generic@1.json            # Task 5
│   └── __fixtures__/
│       ├── understand-anything/{ok,bad}.json   # Task 3
│       ├── gitnexus/{ok,bad}.json              # Task 4
│       └── generic/{ok,bad}.json               # Task 5
├── scripts/
│   ├── validate.mjs              # Task 6
│   ├── sync.mjs                  # Task 7
│   ├── render-readme.mjs         # Task 8
│   └── __tests__/
│       ├── validate.test.mjs     # Task 6
│       ├── sync.test.mjs         # Task 7
│       ├── render-readme.test.mjs # Task 8
│       └── integration.test.mjs  # Task 9
├── tests/
│   └── registry-smoke.json       # Task 11
├── .gitignore                    # Task 1
├── .nvmrc                        # Task 1
├── package.json                  # Task 1
├── package-lock.json             # Task 1
├── registry.json                 # Task 1 (empty entries; Task 15 self-registers)
├── README.md                     # Task 13
└── LICENSE                       # Task 1 (MIT)
```

---

## Wave 0 — Scaffold

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `LICENSE`, `registry.json`

- [ ] **Step 1: Pin Node version**

Create `.nvmrc`:
```
20
```

- [ ] **Step 2: Add `.gitignore`**

Create `.gitignore`:
```
node_modules/
coverage/
.DS_Store
*.log
```

- [ ] **Step 3: Add MIT license**

Create `LICENSE` (paste standard MIT text, copyright 2026 Mac Macdonald-Smith).

- [ ] **Step 4: Create `package.json`**

Create `package.json`:
```json
{
  "name": "@understand-quickly/registry",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "validate": "node scripts/validate.mjs",
    "sync": "node scripts/sync.mjs",
    "render": "node scripts/render-readme.mjs",
    "test": "node --test scripts/__tests__/",
    "test:coverage": "c8 --check-coverage --lines 90 --functions 90 --branches 80 node --test scripts/__tests__/",
    "smoke": "node scripts/sync.mjs --registry tests/registry-smoke.json --dry-run"
  },
  "devDependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
    "c8": "^10.1.2"
  }
}
```

- [ ] **Step 5: Install deps**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`. No vulnerabilities reported.

- [ ] **Step 6: Seed empty `registry.json`**

Create `registry.json`:
```json
{
  "schema_version": 1,
  "generated_at": "2026-05-07T00:00:00Z",
  "entries": []
}
```

- [ ] **Step 7: Commit**

```bash
git add .nvmrc .gitignore LICENSE package.json package-lock.json registry.json
git commit -m "chore: scaffold project (Node 20, ajv, c8, MIT)"
```

---

## Wave 1 — Schemas + Fixtures (parallel)

> Dispatch tasks 2, 3, 4, 5 in parallel via `superpowers:dispatching-parallel-agents`. They write disjoint files and share no state.

### Task 2: Meta-schema for `registry.json`

**Files:**
- Create: `schemas/meta.schema.json`
- Test: covered transitively in Task 6

- [ ] **Step 1: Define meta-schema**

Create `schemas/meta.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://understand-quickly.dev/schemas/meta.schema.json",
  "type": "object",
  "required": ["schema_version", "generated_at", "entries"],
  "additionalProperties": false,
  "properties": {
    "schema_version": { "const": 1 },
    "generated_at": { "type": "string", "format": "date-time" },
    "entries": {
      "type": "array",
      "items": { "$ref": "#/$defs/entry" }
    }
  },
  "$defs": {
    "entry": {
      "type": "object",
      "required": ["id", "owner", "repo", "format", "graph_url", "description"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
        "owner": { "type": "string", "minLength": 1 },
        "repo": { "type": "string", "minLength": 1 },
        "default_branch": { "type": "string", "default": "main" },
        "format": { "type": "string", "pattern": "^[a-z0-9-]+@[0-9]+$" },
        "graph_url": { "type": "string", "format": "uri", "pattern": "^https://" },
        "description": { "type": "string", "maxLength": 200 },
        "tags": { "type": "array", "items": { "type": "string" }, "default": [] },
        "added_at": { "type": "string", "format": "date-time" },
        "last_synced": { "type": ["string", "null"], "format": "date-time" },
        "last_sha": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" },
        "size_bytes": { "type": ["integer", "null"], "minimum": 0 },
        "status": {
          "type": "string",
          "enum": ["ok", "missing", "invalid", "oversize", "transient_error", "dead", "renamed"],
          "default": "ok"
        },
        "last_error": { "type": ["string", "null"] },
        "miss_count": { "type": "integer", "minimum": 0, "default": 0 },
        "renamed_to": { "type": ["string", "null"], "pattern": "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" }
      }
    }
  }
}
```

- [ ] **Step 2: Sanity-check with ajv**

Run:
```bash
node -e "
import('ajv').then(({default:Ajv})=>import('ajv-formats').then(({default:f})=>{
  const a=new Ajv({strict:true,allErrors:true});f(a);
  const s=JSON.parse(require('fs').readFileSync('schemas/meta.schema.json','utf8'));
  a.compile(s);console.log('ok');
}));
"
```
Expected: `ok` (schema compiles).

- [ ] **Step 3: Commit**

```bash
git add schemas/meta.schema.json
git commit -m "feat(schemas): add registry.json meta-schema"
```

### Task 3: `understand-anything@1` schema + fixtures

**Files:**
- Create: `schemas/understand-anything@1.json`, `schemas/__fixtures__/understand-anything/ok.json`, `schemas/__fixtures__/understand-anything/bad.json`

- [ ] **Step 1: Define schema**

Create `schemas/understand-anything@1.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://understand-quickly.dev/schemas/understand-anything@1.json",
  "type": "object",
  "required": ["nodes", "edges"],
  "properties": {
    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "kind", "label"],
        "properties": {
          "id": { "type": "string" },
          "kind": { "type": "string", "enum": ["file", "function", "class", "module", "concept"] },
          "label": { "type": "string" },
          "path": { "type": "string" },
          "summary": { "type": "string" }
        }
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to", "kind"],
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" },
          "kind": { "type": "string" }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "tool": { "const": "understand-anything" },
        "tool_version": { "type": "string" },
        "generated_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

- [ ] **Step 2: Add valid fixture**

Create `schemas/__fixtures__/understand-anything/ok.json`:
```json
{
  "nodes": [
    { "id": "n1", "kind": "file", "label": "src/index.ts", "path": "src/index.ts" },
    { "id": "n2", "kind": "function", "label": "main", "path": "src/index.ts:1" }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "kind": "contains" }
  ],
  "metadata": {
    "tool": "understand-anything",
    "tool_version": "0.4.0",
    "generated_at": "2026-05-07T00:00:00Z"
  }
}
```

- [ ] **Step 3: Add invalid fixture**

Create `schemas/__fixtures__/understand-anything/bad.json`:
```json
{
  "nodes": [
    { "id": "n1", "kind": "asteroid", "label": "src/index.ts" }
  ],
  "edges": []
}
```
(`kind: "asteroid"` violates the enum.)

- [ ] **Step 4: Commit**

```bash
git add schemas/understand-anything@1.json schemas/__fixtures__/understand-anything/
git commit -m "feat(schemas): add understand-anything@1 schema and fixtures"
```

### Task 4: `gitnexus@1` schema + fixtures

**Files:**
- Create: `schemas/gitnexus@1.json`, `schemas/__fixtures__/gitnexus/ok.json`, `schemas/__fixtures__/gitnexus/bad.json`

- [ ] **Step 1: Define schema (loose, parity-only)**

Create `schemas/gitnexus@1.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://understand-quickly.dev/schemas/gitnexus@1.json",
  "type": "object",
  "required": ["graph"],
  "properties": {
    "graph": {
      "type": "object",
      "required": ["nodes", "links"],
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id"],
            "properties": {
              "id": { "type": "string" },
              "type": { "type": "string" },
              "name": { "type": "string" }
            }
          }
        },
        "links": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["source", "target"],
            "properties": {
              "source": { "type": "string" },
              "target": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Valid fixture**

Create `schemas/__fixtures__/gitnexus/ok.json`:
```json
{
  "graph": {
    "nodes": [{ "id": "a", "type": "file", "name": "main.ts" }],
    "links": [{ "source": "a", "target": "a" }]
  }
}
```

- [ ] **Step 3: Invalid fixture**

Create `schemas/__fixtures__/gitnexus/bad.json`:
```json
{ "graph": { "nodes": [], "edges": [] } }
```
(`edges` should be `links`; `links` is required.)

- [ ] **Step 4: Commit**

```bash
git add schemas/gitnexus@1.json schemas/__fixtures__/gitnexus/
git commit -m "feat(schemas): add gitnexus@1 schema and fixtures"
```

### Task 5: `generic@1` schema + fixtures

**Files:**
- Create: `schemas/generic@1.json`, `schemas/__fixtures__/generic/ok.json`, `schemas/__fixtures__/generic/bad.json`

- [ ] **Step 1: Define schema (minimal)**

Create `schemas/generic@1.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://understand-quickly.dev/schemas/generic@1.json",
  "type": "object",
  "required": ["nodes", "edges"],
  "properties": {
    "nodes": { "type": "array" },
    "edges": { "type": "array" }
  }
}
```

- [ ] **Step 2: Valid fixture**

Create `schemas/__fixtures__/generic/ok.json`:
```json
{ "nodes": [], "edges": [] }
```

- [ ] **Step 3: Invalid fixture**

Create `schemas/__fixtures__/generic/bad.json`:
```json
{ "nodes": [] }
```
(missing `edges`)

- [ ] **Step 4: Commit**

```bash
git add schemas/generic@1.json schemas/__fixtures__/generic/
git commit -m "feat(schemas): add generic@1 schema and fixtures"
```

---

## Wave 2 — Scripts (parallel)

> Dispatch tasks 6, 7, 8 in parallel. Each script lives in its own file with its own test file. They share no state at import time.

### Task 6: `validate.mjs`

**Files:**
- Create: `scripts/validate.mjs`, `scripts/__tests__/validate.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `scripts/__tests__/validate.test.mjs`:
```javascript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- --test-name-pattern='validate'`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `validate.mjs`**

Create `scripts/validate.mjs`:
```javascript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMAS_DIR = 'schemas';
const META_PATH = join(SCHEMAS_DIR, 'meta.schema.json');

function loadAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function loadFormatSchemas() {
  const out = {};
  for (const f of readdirSync(SCHEMAS_DIR)) {
    if (f === 'meta.schema.json' || !f.endsWith('.json')) continue;
    const id = f.replace(/\.json$/, '');
    out[id] = JSON.parse(readFileSync(join(SCHEMAS_DIR, f), 'utf8'));
  }
  return out;
}

export function validateRegistry(registry) {
  const ajv = loadAjv();
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
  const validate = ajv.compile(meta);
  const ok = validate(registry);
  if (!ok) {
    return { ok: false, errors: validate.errors.map(e => ({ message: `${e.instancePath} ${e.message}` })) };
  }
  const seen = new Set();
  for (const e of registry.entries) {
    if (seen.has(e.id)) {
      return { ok: false, errors: [{ message: `duplicate id ${e.id}` }] };
    }
    seen.add(e.id);
  }
  return { ok: true, errors: [] };
}

export function validateGraph(format, body) {
  const schemas = loadFormatSchemas();
  if (!schemas[format]) {
    return { ok: false, errors: [{ message: `unknown format ${format}` }] };
  }
  const ajv = loadAjv();
  const validate = ajv.compile(schemas[format]);
  const ok = validate(body);
  return ok
    ? { ok: true, errors: [] }
    : { ok: false, errors: validate.errors.slice(0, 5).map(e => ({ message: `${e.instancePath} ${e.message}` })) };
}

export async function fetchAndValidate(entry, fetchImpl = fetch) {
  const head = await fetchImpl(entry.graph_url, { method: 'HEAD' });
  if (!head.ok) {
    return { ok: false, errors: [{ message: `HEAD ${entry.graph_url} returned ${head.status}` }] };
  }
  const sizeHeader = head.headers.get('content-length');
  const size = sizeHeader ? Number(sizeHeader) : null;
  if (size !== null && size > 50 * 1024 * 1024) {
    return { ok: false, errors: [{ message: `oversize: ${size} bytes` }] };
  }
  const res = await fetchImpl(entry.graph_url);
  if (!res.ok) return { ok: false, errors: [{ message: `GET ${entry.graph_url} returned ${res.status}` }] };
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ message: `invalid JSON: ${e.message}` }] };
  }
  return validateGraph(entry.format, body);
}

async function main() {
  const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
  const r = validateRegistry(registry);
  if (!r.ok) {
    console.error('REGISTRY INVALID:');
    for (const e of r.errors) console.error(`  - ${e.message}`);
    process.exit(1);
  }

  const changedIds = new Set((process.env.CHANGED_IDS || '').split(',').filter(Boolean));
  const subset = changedIds.size > 0
    ? registry.entries.filter(e => changedIds.has(e.id))
    : registry.entries;

  let failed = 0;
  for (const e of subset) {
    const v = await fetchAndValidate(e);
    if (!v.ok) {
      failed++;
      console.error(`ENTRY ${e.id}:`);
      for (const err of v.errors) console.error(`  - ${err.message}`);
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`OK: ${subset.length} entries validated`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- --test-name-pattern='validate'`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.mjs scripts/__tests__/validate.test.mjs
git commit -m "feat(scripts): add validate.mjs with meta + format validation"
```

### Task 7: `sync.mjs`

**Files:**
- Create: `scripts/sync.mjs`, `scripts/__tests__/sync.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `scripts/__tests__/sync.test.mjs`:
```javascript
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

const fixtureBody = JSON.stringify({ nodes: [{ id: 'n1', kind: 'file', label: 'a' }], edges: [] });
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
  const f = async (url, opts) => {
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
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npm test -- --test-name-pattern='sync'`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sync.mjs`**

Create `scripts/sync.mjs`:
```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateGraph } from './validate.mjs';

const MAX_SIZE = 50 * 1024 * 1024;
const DEAD_THRESHOLD = 7;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function withRetry(fn, { maxRetries = 2, delayMs = 100 } = {}) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < maxRetries) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export async function syncEntry(entry, opts = {}) {
  const {
    fetchImpl = fetch,
    now = () => new Date(),
    maxRetries = 2,
    useHead = false,
    etagFor = () => null
  } = opts;
  const out = { ...entry };
  const stamp = () => { out.last_synced = now().toISOString(); };

  try {
    if (useHead) {
      const head = await withRetry(() => fetchImpl(entry.graph_url, { method: 'HEAD' }), { maxRetries });
      if (head.ok) {
        const len = head.headers.get('content-length');
        if (len && Number(len) > MAX_SIZE) {
          out.status = 'oversize';
          out.last_error = `size ${len} > ${MAX_SIZE}`;
          stamp();
          return out;
        }
      }
    }

    const ifNoneMatch = etagFor(entry);
    const reqOpts = ifNoneMatch ? { headers: { 'If-None-Match': ifNoneMatch } } : {};
    const res = await withRetry(() => fetchImpl(entry.graph_url, reqOpts), { maxRetries });

    if (res.status === 304) {
      out.status = 'ok';
      out.miss_count = 0;
      out.last_error = null;
      stamp();
      return out;
    }

    if (res.status === 404) {
      out.miss_count = (entry.miss_count || 0) + 1;
      out.status = out.miss_count >= DEAD_THRESHOLD ? 'dead' : 'missing';
      out.last_error = '404';
      stamp();
      return out;
    }

    if (res.status >= 500) {
      out.status = 'transient_error';
      out.last_error = `${res.status}`;
      stamp();
      return out;
    }

    if (!res.ok) {
      out.status = 'transient_error';
      out.last_error = `unexpected ${res.status}`;
      stamp();
      return out;
    }

    const text = await res.text();
    if (text.length > MAX_SIZE) {
      out.status = 'oversize';
      out.last_error = `body ${text.length} > ${MAX_SIZE}`;
      stamp();
      return out;
    }
    const sha = sha256(text);

    let body;
    try { body = JSON.parse(text); } catch (e) {
      out.status = 'invalid';
      out.last_error = `JSON parse: ${e.message}`;
      stamp();
      return out;
    }

    const v = validateGraph(entry.format, body);
    if (!v.ok) {
      out.status = 'invalid';
      out.last_error = v.errors.map(e => e.message).join('; ');
      stamp();
      return out;
    }

    out.status = 'ok';
    out.miss_count = 0;
    out.last_error = null;
    out.last_sha = sha;
    out.size_bytes = text.length;
    stamp();
    return out;
  } catch (e) {
    out.status = 'transient_error';
    out.last_error = e.message || String(e);
    stamp();
    return out;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const onlyId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  const regIdx = args.indexOf('--registry');
  const regPath = regIdx >= 0 ? args[regIdx + 1] : 'registry.json';

  const registry = JSON.parse(readFileSync(regPath, 'utf8'));
  const targets = onlyId ? registry.entries.filter(e => e.id === onlyId) : registry.entries;

  const updated = [];
  for (const e of targets) {
    const r = await syncEntry(e);
    updated.push(r);
  }

  const next = {
    ...registry,
    generated_at: new Date().toISOString(),
    entries: registry.entries.map(orig => updated.find(u => u.id === orig.id) || orig)
  };

  if (dryRun) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  writeFileSync(regPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`synced ${updated.length} entries`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- --test-name-pattern='sync'`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync.mjs scripts/__tests__/sync.test.mjs
git commit -m "feat(scripts): add sync.mjs with retry, sha tracking, dead-flagging"
```

### Task 8: `render-readme.mjs`

**Files:**
- Create: `scripts/render-readme.mjs`, `scripts/__tests__/render-readme.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `scripts/__tests__/render-readme.test.mjs`:
```javascript
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
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `npm test -- --test-name-pattern='render'`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `render-readme.mjs`**

Create `scripts/render-readme.mjs`:
```javascript
import { readFileSync, writeFileSync } from 'node:fs';

const STATUS_EMOJI = {
  ok: '✅',
  missing: '🟡',
  invalid: '⚠️',
  oversize: '📦',
  transient_error: '🔁',
  dead: '💀',
  renamed: '↪️'
};

const BEGIN = '<!-- BEGIN ENTRIES -->';
const END = '<!-- END ENTRIES -->';

export function renderTable(registry) {
  const rows = [...registry.entries].sort((a, b) => a.id.localeCompare(b.id));
  const header = '| Repo | Format | Description | Status | Last synced |';
  const sep    = '| --- | --- | --- | :---: | --- |';
  const body = rows.map(e => {
    const emoji = STATUS_EMOJI[e.status] || '❔';
    const synced = e.last_synced ? e.last_synced.slice(0, 10) : '—';
    const desc = (e.description || '').replace(/\|/g, '\\|');
    return `| [${e.id}](https://github.com/${e.id}) | \`${e.format}\` | ${desc} | ${emoji} ${e.status} | ${synced} |`;
  });
  return [header, sep, ...body].join('\n');
}

export function applyMarkers(template, replacement) {
  const i = template.indexOf(BEGIN);
  const j = template.indexOf(END);
  if (i < 0 || j < 0 || j < i) throw new Error(`markers not found in template`);
  return template.slice(0, i + BEGIN.length) + '\n' + replacement + '\n' + template.slice(j);
}

async function main() {
  const registry = JSON.parse(readFileSync('registry.json', 'utf8'));
  const tpl = readFileSync('README.md', 'utf8');
  const next = applyMarkers(tpl, renderTable(registry));
  if (next === tpl) {
    console.log('README up-to-date');
    return;
  }
  writeFileSync('README.md', next);
  console.log('README updated');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- --test-name-pattern='render'`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-readme.mjs scripts/__tests__/render-readme.test.mjs
git commit -m "feat(scripts): add render-readme.mjs with status emoji + markers"
```

---

## Wave 3 — Integration test harness

### Task 9: Local-server integration test

**Files:**
- Create: `scripts/__tests__/integration.test.mjs`

- [ ] **Step 1: Write integration test**

Create `scripts/__tests__/integration.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { syncEntry } from '../sync.mjs';
import { readFileSync } from 'node:fs';

function startServer(routes) {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      const handler = routes[req.url];
      if (!handler) { res.writeHead(404); res.end(); return; }
      handler(req, res);
    });
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

test('integration: 200 ok body validates', async () => {
  const okBody = readFileSync('schemas/__fixtures__/understand-anything/ok.json', 'utf8');
  const { srv, port } = await startServer({
    '/g.json': (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(okBody); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'ok');
    assert.ok(r.last_sha);
  } finally { srv.close(); }
});

test('integration: 500 yields transient_error', async () => {
  const { srv, port } = await startServer({
    '/g.json': (req, res) => { res.writeHead(500); res.end('boom'); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'transient_error');
  } finally { srv.close(); }
});

test('integration: malformed JSON marks invalid', async () => {
  const { srv, port } = await startServer({
    '/g.json': (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('not json'); }
  });
  try {
    const r = await syncEntry({
      id: 'x/y', owner: 'x', repo: 'y', format: 'understand-anything@1',
      graph_url: `http://127.0.0.1:${port}/g.json`, description: 'd'
    });
    assert.equal(r.status, 'invalid');
  } finally { srv.close(); }
});
```

- [ ] **Step 2: Run integration tests**

Run: `npm test -- --test-name-pattern='integration'`
Expected: 3 tests PASS.

- [ ] **Step 3: Run full suite + coverage**

Run: `npm run test:coverage`
Expected: all tests pass; coverage ≥ 90% lines/functions, ≥ 80% branches on `scripts/`.

If coverage below threshold, add tests until it meets the bar — do not lower the bar.

- [ ] **Step 4: Commit**

```bash
git add scripts/__tests__/integration.test.mjs
git commit -m "test: add integration tests for sync against local HTTP server"
```

---

## Wave 4 — Workflows (parallel)

> Dispatch tasks 10, 11, 12 in parallel. They write disjoint workflow files.

### Task 10: `validate.yml`

**Files:**
- Create: `.github/workflows/validate.yml`

- [ ] **Step 1: Create workflow**

Create `.github/workflows/validate.yml`:
```yaml
name: validate

on:
  pull_request:
    paths:
      - 'registry.json'
      - 'schemas/**'
      - 'scripts/**'
      - 'package.json'
      - 'package-lock.json'

permissions:
  contents: read
  pull-requests: write

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci

      - name: Compute changed entry ids
        id: changed
        run: |
          CHANGED=$(git diff --unified=0 origin/${{ github.event.pull_request.base.ref }}..HEAD -- registry.json \
            | grep -E '^\+' | grep -Eo '"id": *"[^"]+"' | sed -E 's/.*"id": *"([^"]+)".*/\1/' | sort -u | paste -sd, -)
          echo "ids=${CHANGED}" >> $GITHUB_OUTPUT

      - name: Validate
        env:
          CHANGED_IDS: ${{ steps.changed.outputs.ids }}
        run: npm run validate

      - name: Run unit + integration tests
        run: npm test
```

- [ ] **Step 2: Manually dry-run via `act` if available**

Run (optional, requires `act`): `act pull_request -W .github/workflows/validate.yml`
Expected: workflow completes; validate + tests pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/validate.yml
git commit -m "ci: add validate.yml for PR registry checks"
```

### Task 11: `sync.yml` + smoke fixture

**Files:**
- Create: `.github/workflows/sync.yml`, `tests/registry-smoke.json`

- [ ] **Step 1: Create smoke fixture**

Create `tests/registry-smoke.json`:
```json
{
  "schema_version": 1,
  "generated_at": "2026-05-07T00:00:00Z",
  "entries": [
    {
      "id": "Lum1104/Understand-Anything",
      "owner": "Lum1104",
      "repo": "Understand-Anything",
      "default_branch": "main",
      "format": "understand-anything@1",
      "graph_url": "https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/.understand-anything/knowledge-graph.json",
      "description": "smoke target"
    }
  ]
}
```

- [ ] **Step 2: Create workflow**

Create `.github/workflows/sync.yml`:
```yaml
name: sync

on:
  schedule:
    - cron: '0 3 * * *'
  repository_dispatch:
    types: [sync-entry]
  workflow_dispatch:
    inputs:
      id:
        description: 'Single entry id (owner/repo) to sync'
        required: false
        type: string
      revalidate:
        description: 'Resync all entries even if unchanged'
        required: false
        type: boolean
        default: false

permissions:
  contents: write

concurrency:
  group: sync-${{ github.event.client_payload.id || github.event.inputs.id || 'all' }}
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci

      - name: Resolve target id
        id: target
        run: |
          ID="${{ github.event.client_payload.id || github.event.inputs.id }}"
          if [ -n "$ID" ]; then echo "args=--only $ID" >> $GITHUB_OUTPUT
          else echo "args=" >> $GITHUB_OUTPUT
          fi

      - name: Smoke (dry-run, never commits)
        run: npm run smoke

      - name: Sync
        run: node scripts/sync.mjs ${{ steps.target.outputs.args }}

      - name: Commit changes
        run: |
          if ! git diff --quiet registry.json; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add registry.json
            git commit -m "chore(sync): update registry"
            git push
          else
            echo "no changes"
          fi
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync.yml tests/registry-smoke.json
git commit -m "ci: add sync.yml (cron + dispatch + workflow_dispatch) and smoke fixture"
```

### Task 12: `render.yml`

**Files:**
- Create: `.github/workflows/render.yml`

- [ ] **Step 1: Create workflow**

Create `.github/workflows/render.yml`:
```yaml
name: render-readme

on:
  push:
    branches: [main]
    paths: ['registry.json']

permissions:
  contents: write

jobs:
  render:
    if: github.actor != 'github-actions[bot]' || !startsWith(github.event.head_commit.message, 'docs(readme):')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run render
      - name: Commit README
        run: |
          if ! git diff --quiet README.md; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add README.md
            git commit -m "docs(readme): regenerate entry table"
            git push
          else
            echo "no changes"
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/render.yml
git commit -m "ci: add render.yml for auto-rendered README"
```

---

## Wave 5 — README, publish template, self-register (parallel)

> Tasks 13, 14, 15 are independent: 13 writes `README.md`, 14 writes `docs/publish-template.yml`, 15 edits `registry.json`. Dispatch in parallel.

### Task 13: README (beautiful, agent-friendly)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README content**

Create `README.md`:
```markdown
<div align="center">

# 🧠 understand-quickly

**A public, machine-readable registry of code-knowledge graphs.**

Point AI agents at any indexed repo and they get a current, schema-validated graph — no scraping, no LLM cost on the registry side.

[![validate](https://github.com/understand-quickly/registry/actions/workflows/validate.yml/badge.svg)](https://github.com/understand-quickly/registry/actions/workflows/validate.yml)
[![sync](https://github.com/understand-quickly/registry/actions/workflows/sync.yml/badge.svg)](https://github.com/understand-quickly/registry/actions/workflows/sync.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[**Browse entries ↓**](#registry) · [**Add your repo**](#add-your-repo) · [**Agent quickstart**](#agent-quickstart) · [**Design spec**](docs/superpowers/specs/2026-05-07-understand-quickly-registry-design.md)

</div>

---

## Why

Tools like [Understand-Anything](https://github.com/Lum1104/Understand-Anything), [GitNexus](https://github.com/abhigyanpatwari/GitNexus), and [code-review-graph](https://github.com/tirth8205/code-review-graph) turn a codebase into a queryable knowledge graph. The graph is JSON. Today there is no shared, current, machine-readable index of which public repos publish one.

`understand-quickly` is that index. One repo, one `registry.json`, three workflows. No backend.

## How it works

```
                 ┌──────────────────────┐
                 │ understand-quickly/  │
                 │      registry        │
                 │                      │
                 │  registry.json       │ ← canonical pointers
                 │  schemas/            │ ← per-format JSON Schemas
                 │  README.md           │ ← auto-rendered table
                 └────────┬─────────────┘
            PR / dispatch │ raw.githubusercontent.com
                          │
        ┌─────────────────┴───────────────────┐
        ▼                                     ▼
┌──────────────────┐                  ┌─────────────────────┐
│ Source repo with │                  │ AI agent / MCP /    │
│ knowledge graph  │                  │ human reader        │
└──────────────────┘                  └─────────────────────┘
```

- **Storage:** graphs live in their source repos. We store only pointers.
- **Validation:** every PR runs schema checks on `registry.json` and the graph body.
- **Freshness:** nightly cron resyncs every entry; source repos can opt-in to instant refresh via `repository_dispatch`.
- **Cost:** zero. GitHub Actions only.

## Agent quickstart

```bash
curl -fsSL https://raw.githubusercontent.com/understand-quickly/registry/main/registry.json
```

Each entry that an agent should trust:

```jsonc
{
  "id": "Lum1104/Understand-Anything",
  "format": "understand-anything@1",
  "graph_url": "https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/.understand-anything/knowledge-graph.json",
  "status": "ok",       // ← only consume entries with status "ok"
  "last_sha": "…",      // ← cache key
  "last_synced": "…"    // ← if older than 7d, fetch graph_url directly
}
```

Schemas: [`schemas/`](./schemas/). Each `format` value (e.g. `understand-anything@1`) maps to `schemas/<format>.json`.

## Add your repo

1. Run [Understand-Anything](https://github.com/Lum1104/Understand-Anything) (or any supported tool) locally; commit `.understand-anything/knowledge-graph.json` to your repo.
2. Fork this repo.
3. Append an entry to `registry.json`:
   ```json
   {
     "id": "yourname/yourrepo",
     "owner": "yourname",
     "repo": "yourrepo",
     "format": "understand-anything@1",
     "graph_url": "https://raw.githubusercontent.com/yourname/yourrepo/main/.understand-anything/knowledge-graph.json",
     "description": "one-liner about your project",
     "tags": ["python", "agents"]
   }
   ```
4. Open a PR. The `validate` check will fetch your graph and verify the format. Maintainer reviews + merges.

### Optional: instant refresh on push

Drop [`docs/publish-template.yml`](./docs/publish-template.yml) into your repo as `.github/workflows/understand-quickly-publish.yml`. Add `UNDERSTAND_QUICKLY_TOKEN` (a fine-grained PAT scoped to `repository_dispatch` on this registry) to your repo secrets. From then on, every push that touches your graph file triggers an immediate registry sync.

## Supported formats

| Format | Source tool | Status |
| --- | --- | --- |
| `understand-anything@1` | [Understand-Anything](https://github.com/Lum1104/Understand-Anything) | first-class |
| `gitnexus@1` | [GitNexus](https://github.com/abhigyanpatwari/GitNexus) | parity |
| `generic@1` | any `{nodes, edges}` graph | escape hatch |

Adding a new format = PR `schemas/<name>@<int>.json` + an `ok` and `bad` fixture under `schemas/__fixtures__/<name>/`.

## Registry

> Auto-generated. Do not hand-edit between the markers.

<!-- BEGIN ENTRIES -->
<!-- END ENTRIES -->

## Status legend

| Emoji | Status | Meaning |
| :---: | --- | --- |
| ✅ | `ok` | fetched, validated, current |
| 🟡 | `missing` | 404 in last sync (will retry) |
| ⚠️ | `invalid` | body failed schema validation |
| 📦 | `oversize` | graph > 50 MB; not fetched |
| 🔁 | `transient_error` | network / 5xx; retried |
| 💀 | `dead` | 7+ consecutive misses |
| ↪️ | `renamed` | superseded by `renamed_to` |

## Development

```bash
nvm use            # Node 20
npm install
npm test           # node:test
npm run test:coverage
npm run validate   # validate registry.json + (optionally) all graphs
npm run sync       # resync all entries (writes registry.json)
npm run smoke      # dry-run sync against tests/registry-smoke.json
npm run render     # regenerate README table
```

## Roadmap

- [ ] Thin MCP server wrapping `registry.json` (separate repo).
- [ ] Static GitHub Pages browser with embedded graph viewer.
- [ ] `entries/<a-z>.json` shard split when index passes 1k entries.
- [ ] Per-entry semantic search.

## License

MIT © 2026 Mac Macdonald-Smith. See [LICENSE](LICENSE).
```

- [ ] **Step 2: Verify markers parse**

Run: `npm run render`
Expected: `README updated` (table populated from current entries) or `README up-to-date` if entries empty.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with quickstart, status legend, registry markers"
```

### Task 14: Publish template for source repos

**Files:**
- Create: `docs/publish-template.yml`

- [ ] **Step 1: Write template**

Create `docs/publish-template.yml`:
```yaml
# Drop this file into your repo as
#   .github/workflows/understand-quickly-publish.yml
# and add a fine-grained PAT named UNDERSTAND_QUICKLY_TOKEN to your repo secrets.
# The PAT only needs `repository_dispatch` permission on understand-quickly/registry.
name: understand-quickly publish

on:
  push:
    branches: [main]
    paths:
      - '.understand-anything/**'
      - '.gitnexus/**'

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.UNDERSTAND_QUICKLY_TOKEN }}
          repository: understand-quickly/registry
          event-type: sync-entry
          client-payload: '{"id":"${{ github.repository }}"}'
```

- [ ] **Step 2: Commit**

```bash
git add docs/publish-template.yml
git commit -m "docs: add copy-paste publish template for source repos"
```

### Task 15: Self-register the registry repo

**Files:**
- Modify: `registry.json`

- [ ] **Step 1: Append self entry**

Edit `registry.json` to:
```json
{
  "schema_version": 1,
  "generated_at": "2026-05-07T00:00:00Z",
  "entries": [
    {
      "id": "understand-quickly/registry",
      "owner": "understand-quickly",
      "repo": "registry",
      "default_branch": "main",
      "format": "generic@1",
      "graph_url": "https://raw.githubusercontent.com/understand-quickly/registry/main/registry.json",
      "description": "The registry indexes itself; useful as a meta entry."
    }
  ]
}
```

- [ ] **Step 2: Validate locally**

Run: `npm run validate`
Expected: `OK: 1 entries validated`.

- [ ] **Step 3: Render README**

Run: `npm run render`
Expected: `README updated`.

- [ ] **Step 4: Commit**

```bash
git add registry.json README.md
git commit -m "feat: self-register the registry as entry zero"
```

---

## Wave 6 — Polish & gate

### Task 16: Final coverage gate + repo polish

**Files:**
- Modify: `package.json` (only if tweaks needed)
- Verify only

- [ ] **Step 1: Full test + coverage run**

Run: `npm run test:coverage`
Expected: all tests pass; coverage ≥ 90% lines/functions, ≥ 80% branches.

- [ ] **Step 2: Lint workflows (optional, if `actionlint` installed)**

Run: `actionlint`
Expected: no findings. If `actionlint` not installed, skip with `echo "actionlint not installed; skipping"`.

- [ ] **Step 3: Verify scripts run end-to-end**

```bash
npm run validate
npm run sync       # may update last_synced for self entry
npm run render
```

Expected: each command exits 0; `git diff registry.json README.md` shows only `last_synced` / generated table updates.

- [ ] **Step 4: Confirm repo settings checklist (manual, document only)**

Add to PR description (do not script):
- Branch protection on `main`: require `validate` check, require PR review, disallow force-push.
- Secrets: none needed beyond default `GITHUB_TOKEN`.
- Repo description: "Public registry of code-knowledge graphs for AI agents."
- Topics: `knowledge-graph`, `ai-agents`, `understand-anything`, `registry`.

- [ ] **Step 5: Final commit if anything changed**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: final coverage + sync pass"
```

---

## Self-Review Checklist (already run — do not re-run)

- ✅ Spec coverage: every section of the design spec maps to a task (architecture → all; schema → Task 2; formats → 3,4,5; scripts → 6,7,8; data flows A–D → workflows 10,11,12 + scripts; error handling → 6,7 tests; testing → 7,9,16).
- ✅ No placeholders: every code block is concrete; no "TODO" / "TBD" / "similar to".
- ✅ Type consistency: `last_sha` (sha256 hex) used identically across schema (Task 2), validate (Task 6), sync (Task 7); `status` enum identical across schema, sync, render emoji map.
- ✅ Parallelization safe: parallel tasks within a wave write disjoint files. Wave boundaries enforce sequential dependencies (schemas before scripts before workflows before docs).

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-07-understand-quickly-registry.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task; within each wave I dispatch the parallel tasks concurrently and review their diffs before advancing to the next wave.
2. **Inline Execution** — I work tasks myself in this session, using waves as checkpoints.

Which approach?
