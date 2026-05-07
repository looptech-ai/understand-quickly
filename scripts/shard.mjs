// Shard utility: transparent read-path merge of entries/<a-z0-9>.json shards
// into the top-level registry.json. No write/migration logic — that's a future
// task. We only ship the read path + a `shouldShard` predicate so callers can
// log when the registry crosses the threshold.

import * as nodeFs from 'node:fs';
import { join } from 'node:path';

// Pattern for valid shard filenames: a single [a-z0-9] character + `.json`.
// e.g. `a.json`, `0.json`, `z.json`. Anything else (e.g. `aa.json`, `A.json`,
// `tmp-a.json`) is ignored — that lets shard files coexist with unrelated
// content in `entries/` without surprises.
const SHARD_RE = /^[a-z0-9]\.json$/;

const ENTRIES_DIR = 'entries';
const REGISTRY_FILE = 'registry.json';

/**
 * Default fs adapter — maps the subset of `node:fs` we use into a small,
 * easy-to-fake interface. Tests can pass `{ fs: fakeFs }` instead of touching
 * the real disk.
 *
 * The adapter only needs:
 *   - existsSync(path) -> boolean
 *   - readFileSync(path, encoding) -> string
 *   - readdirSync(path) -> string[]
 *   - statSync(path) -> { isFile(): boolean }
 */
const defaultFs = {
  existsSync: (p) => nodeFs.existsSync(p),
  readFileSync: (p, enc) => nodeFs.readFileSync(p, enc),
  readdirSync: (p) => nodeFs.readdirSync(p),
  statSync: (p) => nodeFs.statSync(p)
};

/**
 * Build a fake fs adapter from a flat `{ path: contents }` map. Useful for
 * tests. Directories are inferred from any entry whose path is a prefix.
 */
export function makeMapFs(map) {
  const files = new Map(Object.entries(map));
  const dirs = new Set();
  for (const p of files.keys()) {
    let i = p.lastIndexOf('/');
    while (i > 0) {
      dirs.add(p.slice(0, i));
      i = p.lastIndexOf('/', i - 1);
    }
  }
  return {
    existsSync: (p) => files.has(p) || dirs.has(p),
    readFileSync: (p) => {
      if (!files.has(p)) {
        const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return files.get(p);
    },
    readdirSync: (p) => {
      const prefix = p.endsWith('/') ? p : p + '/';
      const out = new Set();
      for (const f of files.keys()) {
        if (f.startsWith(prefix)) {
          const rest = f.slice(prefix.length);
          const slash = rest.indexOf('/');
          out.add(slash === -1 ? rest : rest.slice(0, slash));
        }
      }
      if (out.size === 0 && !dirs.has(p)) {
        const err = new Error(`ENOENT: no such file or directory, scandir '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
      return [...out];
    },
    statSync: (p) => ({ isFile: () => files.has(p) })
  };
}

/**
 * Read a JSON file via the fs adapter. Returns `null` if the file doesn't
 * exist; throws on parse error so the caller fails loudly on a corrupt shard.
 */
function readJson(fs, path) {
  if (!fs.existsSync(path)) return null;
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

/**
 * List shard filenames in `<root>/entries/`, in deterministic sorted order.
 * Only files matching `[a-z0-9]\.json` are considered — see SHARD_RE.
 *
 * Returns an empty array if `<root>/entries/` doesn't exist.
 */
export function listShardFiles(root, fs = defaultFs) {
  const dir = join(root, ENTRIES_DIR);
  if (!fs.existsSync(dir)) return [];
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw e;
  }
  return names
    .filter(n => SHARD_RE.test(n))
    .filter(n => {
      try { return fs.statSync(join(dir, n)).isFile(); }
      catch { return false; }
    })
    .sort();
}

/**
 * Load the registry from `<root>/registry.json` and merge in any shard files
 * at `<root>/entries/<a-z0-9>.json`. Each shard is expected to be of the form
 * `{ "entries": [...] }` — extra top-level keys are ignored.
 *
 * Merge rules:
 *   - The returned object is the top-level registry shape (schema_version,
 *     generated_at, etc.) with `entries` replaced by the merged union.
 *   - Dedupe by `id`. On collision:
 *       - top-level `registry.json` wins (it's the canonical write target).
 *       - shard-vs-shard collisions: first-seen wins (sorted by filename).
 *       - any collision emits a `console.warn` so it's visible in CI logs.
 *
 * @param {object}   args
 * @param {string}   args.root  Repository root (the dir containing
 *                              `registry.json` and `entries/`).
 * @param {object}  [args.fs]   Optional fs adapter (see defaultFs / makeMapFs).
 * @param {Function}[args.warn] Optional warn sink (defaults to console.warn).
 *                              Tests inject this to assert on collision logs.
 * @returns {object} Registry object with merged `entries`.
 */
export function loadRegistry({ root, fs = defaultFs, warn = console.warn } = {}) {
  if (!root) throw new Error('loadRegistry: root is required');

  const regPath = join(root, REGISTRY_FILE);
  const registry = readJson(fs, regPath);
  if (registry === null) {
    throw new Error(`loadRegistry: ${regPath} not found`);
  }
  const baseEntries = Array.isArray(registry.entries) ? registry.entries : [];

  // Track which entries are claimed by id, and where they came from, so we
  // can produce informative collision warnings.
  const byId = new Map();
  for (const e of baseEntries) {
    if (e && typeof e.id === 'string') byId.set(e.id, { entry: e, source: REGISTRY_FILE });
  }

  for (const name of listShardFiles(root, fs)) {
    const shardPath = join(root, ENTRIES_DIR, name);
    const shard = readJson(fs, shardPath);
    if (!shard || !Array.isArray(shard.entries)) continue;
    for (const e of shard.entries) {
      if (!e || typeof e.id !== 'string') continue;
      const prior = byId.get(e.id);
      if (prior) {
        // Top-level wins, and earlier shard wins over later shard. Either way
        // the existing claim stays — we just warn so the collision is visible.
        warn(
          `[shard] collision on id=${e.id}: keeping ${prior.source}, ignoring entries/${name}`
        );
        continue;
      }
      byId.set(e.id, { entry: e, source: `entries/${name}` });
    }
  }

  return {
    ...registry,
    entries: [...byId.values()].map(v => v.entry)
  };
}

/**
 * Predicate: should this registry be sharded? True when the merged registry
 * has *more than* `threshold` entries.
 *
 * The spec ("once the registry passes 1k entries") is strict-greater: at
 * exactly 1000 we're still single-file; at 1001 we should shard. We only
 * use this for a warning today — no actual write/migration happens here.
 */
export function shouldShard(registry, threshold = 1000) {
  if (!registry || !Array.isArray(registry.entries)) return false;
  return registry.entries.length > threshold;
}
