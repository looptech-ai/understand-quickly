// Generate `.well-known/code-graph` discovery payloads from registry.json.
//
// Background: RFC 8615 standardizes the `.well-known/` URI prefix for stable,
// site-rooted metadata. We adopt the convention so AI agents can discover
// graphs without first hitting our registry — the producer publishes a
// `.well-known/code-graph.json` in their repo, and we mirror an aggregator
// view at `<our-pages>/.well-known/repos.json`.
//
// CLI:
//   node scripts/well-known.mjs --registry registry.json --out site/.well-known
//
// Outputs (under --out):
//
//   - code-graph.json   "about us" record describing this aggregator
//   - repos.json        flat list of `ok` entries — the agent-friendly index
//   - index.json        catalog of well-known endpoints + schema versions
//
// Idempotent: only writes if the on-disk bytes differ. Safe with empty
// registries (writes empty `repos.json` + a valid catalog).
//
// Exports `buildAboutRecord(opts)` and `buildReposRecord(registry)` for tests.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { Buffer } from 'node:buffer';
import { loadRegistry } from './shard.mjs';

const SCHEMA_VERSION = 1;
const DEFAULT_BASE = 'https://looptech-ai.github.io/understand-quickly';

// Compare bytes-for-bytes so we can no-op when content hasn't changed —
// keeps `git diff --quiet site/.well-known` honest in the sync workflow.
function isUnchanged(path, nextContent) {
  if (!existsSync(path)) return false;
  try {
    const prev = readFileSync(path);
    const next = Buffer.from(nextContent, 'utf8');
    return Buffer.compare(prev, next) === 0;
  } catch {
    return false;
  }
}

function writeIfChanged(path, content) {
  if (isUnchanged(path, content)) return false;
  writeFileSync(path, content);
  return true;
}

/**
 * Build the "about us" record describing this aggregator. Static metadata —
 * what consumers of the protocol need to know about who we are and where the
 * other endpoints live.
 *
 * @param {object} [opts]
 * @param {string} [opts.base] Pages base URL. Defaults to the production URL.
 * @returns {object} JSON-serializable record.
 */
export function buildAboutRecord({ base = DEFAULT_BASE } = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    service: {
      name: 'understand-quickly registry',
      url: `${base}/`,
      registry_url: `${base}/registry.json`,
      stats_url: `${base}/stats.json`,
      badge_base: `${base}/badges/`,
      spec_url: `${base}/docs/spec/code-graph-protocol.md`,
      discovery_url: `${base}/.well-known/code-graph-discovery.html`
    }
  };
}

/**
 * Build the agent-friendly flat index of `ok` entries. Smaller than the full
 * `registry.json` and stable across sync internals — does not expose
 * `miss_count`, `last_error`, `drift_checked_at`, etc.
 *
 * @param {object} registry Registry object with `entries`.
 * @returns {object} `{ schema_version, repos: [{...}] }`.
 */
export function buildReposRecord(registry) {
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  const repos = entries
    .filter(e => e?.status === 'ok')
    .map(e => ({
      id: e.id,
      format: e.format,
      graph_url: e.graph_url,
      last_synced: e.last_synced ?? null,
      status: e.status,
      source_sha: e.source_sha ?? null
    }));
  return { schema_version: SCHEMA_VERSION, repos };
}

/**
 * Build the catalog of well-known endpoints we publish.
 *
 * @param {object} [opts]
 * @param {string} [opts.base] Pages base URL.
 */
export function buildIndexRecord({ base = DEFAULT_BASE } = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    endpoints: [
      {
        path: '/.well-known/code-graph.json',
        url: `${base}/.well-known/code-graph.json`,
        description: 'About this aggregator: registry url, stats url, spec, discovery page.',
        schema_version: SCHEMA_VERSION
      },
      {
        path: '/.well-known/repos.json',
        url: `${base}/.well-known/repos.json`,
        description: 'Flat list of ok entries: { id, format, graph_url, last_synced, status, source_sha }.',
        schema_version: SCHEMA_VERSION
      },
      {
        path: '/.well-known/code-graph-discovery.html',
        url: `${base}/.well-known/code-graph-discovery.html`,
        description: 'Browser-friendly discovery UI; supports ?repo=<owner>/<repo> lookup.',
        schema_version: SCHEMA_VERSION
      }
    ]
  };
}

/**
 * Pure renderer — writes the well-known files to `outDir`. Returns counts so
 * callers can log a one-line summary (matches aggregate.mjs / render-badges
 * convention).
 */
export function renderWellKnown({ registry, outDir, base = DEFAULT_BASE }) {
  mkdirSync(outDir, { recursive: true });

  const about = buildAboutRecord({ base });
  const repos = buildReposRecord(registry);
  const index = buildIndexRecord({ base });

  const aboutJson = JSON.stringify(about, null, 2) + '\n';
  const reposJson = JSON.stringify(repos, null, 2) + '\n';
  const indexJson = JSON.stringify(index, null, 2) + '\n';

  let written = 0;
  let skipped = 0;
  const tally = (changed) => { changed ? written++ : skipped++; };

  tally(writeIfChanged(join(outDir, 'code-graph.json'), aboutJson));
  tally(writeIfChanged(join(outDir, 'repos.json'), reposJson));
  tally(writeIfChanged(join(outDir, 'index.json'), indexJson));

  return { written, skipped, total: 3, repos: repos.repos.length };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    registry: get('--registry', 'registry.json'),
    out: get('--out', 'site/.well-known'),
    base: get('--base', DEFAULT_BASE)
  };
}

async function main() {
  const { registry: regPath, out: outArg, base } = parseArgs(process.argv);

  const absReg = resolve(regPath);
  let registry;
  if (basename(absReg) === 'registry.json') {
    // Load via shard.mjs so sharded registries (when we eventually shard)
    // continue to work without a separate code path.
    registry = loadRegistry({ root: dirname(absReg) });
  } else {
    registry = JSON.parse(readFileSync(regPath, 'utf8'));
  }

  const outDir = resolve(outArg);
  const { written, skipped, total, repos } = renderWellKnown({ registry, outDir, base });
  console.log(`well-known: ${written} written, ${skipped} unchanged, ${total} files (repos=${repos}, out=${outDir})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
