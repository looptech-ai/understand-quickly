// scripts/render-latest.mjs
//
// Regenerate the "Latest" callout in README.md by querying public registry
// APIs (npm, PyPI, GitHub) for the live version of every published surface.
//
// Pure-Node — only stdlib `node:fs` + global `fetch` (Node 18+).
// Never fails the workflow: if any registry is unreachable, the script falls
// back to the previous values already encoded in README.md and exits 0.
//
// Markers (idempotent — re-running with no version drift is a no-op):
//
//   <!-- LATEST-START -->
//   > **Latest:** v<root> — CLI <cli>, MCP <mcp>, Python SDK <pysdk>, GH Action <action>. [CHANGELOG →](CHANGELOG.md)
//   <!-- LATEST-END -->
//
// CLI flags:
//   --registry-only   read local files only (no network), used in tests
//   --check           exit 1 if README would change (CI drift guard)
//   (default)         rewrite README.md in place

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BEGIN = '<!-- LATEST-START -->';
const END   = '<!-- LATEST-END -->';

const NPM_CLI_URL    = 'https://registry.npmjs.org/@looptech-ai/understand-quickly-cli/latest';
const NPM_MCP_URL    = 'https://registry.npmjs.org/@looptech-ai/understand-quickly-mcp/latest';
const PYPI_URL       = 'https://pypi.org/pypi/understand-quickly/json';
const GH_ACTION_URL  = 'https://api.github.com/repos/looptech-ai/uq-publish-action/releases/latest';

// -----------------------------------------------------------------------------
// Pure helpers (exported for tests)
// -----------------------------------------------------------------------------

export function buildLatestLine({ root, cli, mcp, pysdk, action }) {
  return `> **Latest:** v${root} — CLI ${cli}, MCP ${mcp}, Python SDK ${pysdk}, GH Action ${action}. [CHANGELOG →](CHANGELOG.md)`;
}

export function applyMarkers(template, replacement) {
  const i = template.indexOf(BEGIN);
  const j = template.indexOf(END);
  if (i < 0 || j < 0 || j < i) {
    throw new Error(`markers not found in template (expected ${BEGIN} … ${END})`);
  }
  return template.slice(0, i + BEGIN.length) + '\n' + replacement + '\n' + template.slice(j);
}

// Parse the current callout out of README so we can fall back to it on
// network failures (we never want to clobber known-good versions with "?").
export function extractCurrentLine(template) {
  const i = template.indexOf(BEGIN);
  const j = template.indexOf(END);
  if (i < 0 || j < 0 || j < i) return '';
  return template.slice(i + BEGIN.length, j).trim();
}

// Defensive small JSON fetch — bounded timeout, warns on failure, returns null.
async function fetchJson(url, fetchImpl) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const res = await fetchImpl(url, {
      headers: { 'user-agent': 'understand-quickly-docs-bot' },
      signal: ctl.signal
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`warn: ${url} -> HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`warn: ${url} -> ${err && err.message ? err.message : err}`);
    return null;
  }
}

export async function fetchLatest({ fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') {
    throw new Error('no fetch implementation available');
  }
  const [cliJson, mcpJson, pypiJson, ghJson] = await Promise.all([
    fetchJson(NPM_CLI_URL,   f),
    fetchJson(NPM_MCP_URL,   f),
    fetchJson(PYPI_URL,      f),
    fetchJson(GH_ACTION_URL, f)
  ]);
  return {
    cli:    cliJson?.version ?? null,
    mcp:    mcpJson?.version ?? null,
    pysdk:  pypiJson?.info?.version ?? null,
    action: ghJson?.tag_name ?? null
  };
}

// Merge fetched values with a fallback line parsed from the existing README.
// Anything we couldn't fetch falls back to what's already on disk.
export function mergeWithFallback(fetched, previousLine, rootVersion) {
  const prev = parsePreviousLine(previousLine);
  return {
    root:   rootVersion,
    cli:    fetched.cli    ?? prev.cli    ?? '?',
    mcp:    fetched.mcp    ?? prev.mcp    ?? '?',
    pysdk:  fetched.pysdk  ?? prev.pysdk  ?? '?',
    action: fetched.action ?? prev.action ?? '?'
  };
}

// Very tolerant parse of the previously rendered line — handles either the new
// `— CLI x.y.z, MCP …` format OR the older `**v0.2.0**` style line.
export function parsePreviousLine(line) {
  if (!line) return {};
  const out = {};
  // Capture up to the next `,` or `.` followed by space (sentence terminator),
  // or a trailing backtick — keeps the internal `.` characters of a semver.
  const cli    = line.match(/CLI\s+`?([^\s,`]+?)`?\s*(?:,|\.\s|$)/i);
  const mcp    = line.match(/MCP\s+`?([^\s,`]+?)`?\s*(?:,|\.\s|$)/i);
  const pysdk  = line.match(/Python SDK\s+`?([^\s,`]+?)`?\s*(?:,|\.\s|$)/i);
  const action = line.match(/GH Action\s+`?([^\s,`]+?)`?\s*(?:,|\.\s|$)/i);
  if (cli)    out.cli    = cli[1];
  if (mcp)    out.mcp    = mcp[1];
  if (pysdk)  out.pysdk  = pysdk[1];
  if (action) out.action = action[1];
  return out;
}

// -----------------------------------------------------------------------------
// CLI entrypoint
// -----------------------------------------------------------------------------

function readRootVersion() {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const registryOnly = args.has('--registry-only');
  const checkOnly    = args.has('--check');

  if (!existsSync('README.md')) {
    console.log('README.md not present; nothing to render');
    return 0;
  }
  const readme = readFileSync('README.md', 'utf8');
  if (!readme.includes(BEGIN) || !readme.includes(END)) {
    console.warn(`warn: markers ${BEGIN} … ${END} not found in README.md`);
    return 0;
  }

  const root = readRootVersion();
  const previousLine = extractCurrentLine(readme);

  // In --registry-only mode we never hit the network. We use the previously
  // rendered values verbatim — useful for deterministic tests + offline CI.
  const fetched = registryOnly
    ? { cli: null, mcp: null, pysdk: null, action: null }
    : await fetchLatest();

  const merged = mergeWithFallback(fetched, previousLine, root);
  const line = buildLatestLine(merged);
  const next = applyMarkers(readme, line);

  if (next === readme) {
    console.log('Latest callout up-to-date');
    return 0;
  }

  if (checkOnly) {
    console.error('drift detected — README "Latest" callout is stale');
    console.error('expected:', line);
    return 1;
  }

  writeFileSync('README.md', next);
  console.log(`Updated Latest callout -> ${line}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code || 0))
    // We deliberately never propagate a non-zero exit on unexpected error —
    // docs automation must never block a release.
    .catch((err) => { console.warn('warn: render-latest failed:', err?.message || err); process.exit(0); });
}
