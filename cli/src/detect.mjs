// Pure helpers for git/file detection and format sniffing.
// No side effects beyond the obvious filesystem reads / spawns.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tryRunCapture } from './spawn.mjs';

/**
 * Parse a GitHub remote URL into `owner/repo`.
 * Supports the three common forms (SSH, HTTPS with .git, HTTPS without .git).
 * Throws on anything else with a friendly message.
 */
export function parseGitRemote(url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('git remote is empty; pass --id owner/repo');
  }
  const trimmed = url.trim();

  // SSH: git@github.com:owner/repo(.git)?
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

  // HTTPS: https://github.com/owner/repo(.git)?
  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

  throw new Error(
    `unrecognized git remote: ${trimmed}\n` +
    `  expected a github.com SSH or HTTPS URL.\n` +
    `  pass --id owner/repo to override.`
  );
}

/**
 * Read `origin` URL by spawning `git remote get-url origin`.
 * Honors a custom cwd. Returns null if the command fails (not a git repo / no remote).
 */
export function readOriginUrl(cwd = process.cwd()) {
  const out = tryRunCapture('git', ['remote', 'get-url', 'origin'], { cwd });
  return out ? out.trim() || null : null;
}

/**
 * Find the .git dir for `cwd` by walking up until we hit one.
 * Returns null if not inside a repo.
 */
export function findGitDir(cwd = process.cwd()) {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, '.git');
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Find the working-tree root for `cwd` (i.e. the directory that contains .git).
 * Returns null if not inside a repo.
 */
export function findRepoRoot(cwd = process.cwd()) {
  const gitDir = findGitDir(cwd);
  return gitDir ? join(gitDir, '..') : null;
}

/**
 * Read default branch by parsing .git/HEAD first; fall back to git CLI.
 */
export function readDefaultBranch(cwd = process.cwd()) {
  const gitDir = findGitDir(cwd);
  if (gitDir) {
    try {
      const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
      const m = head.match(/^ref:\s+refs\/heads\/(.+)$/);
      if (m) return m[1];
    } catch {
      // fall through to git CLI
    }
  }
  const out = tryRunCapture('git', ['symbolic-ref', '--short', 'HEAD'], { cwd });
  if (out) {
    const branch = out.trim();
    if (branch) return branch;
  }
  return null;
}

/**
 * Candidate paths for an existing graph file, relative to repo root.
 * Returned in the priority order we want to surface to the user.
 */
export const GRAPH_CANDIDATES = [
  '.understand-anything/knowledge-graph.json',
  '.gitnexus/graph.json',
  '.code-review-graph/graph.json',
  'graph.json'
];

/**
 * Find graph candidates that actually exist on disk under `root`.
 * Returns an array of { path: absolute, rel: repo-relative } in priority order.
 */
export function findGraphFiles(root) {
  const found = [];
  for (const rel of GRAPH_CANDIDATES) {
    const abs = join(root, rel);
    if (existsSync(abs)) found.push({ path: abs, rel });
  }
  return found;
}

/**
 * Sniff a parsed JSON body and return the best-guess format string,
 * or null if nothing matches.
 */
export function sniffFormat(body) {
  if (!body || typeof body !== 'object') return null;

  // 1. understand-anything: metadata.tool === "understand-anything"
  if (body.metadata && typeof body.metadata === 'object' && body.metadata.tool === 'understand-anything') {
    return 'understand-anything@1';
  }

  // 2. gitnexus: top-level graph.nodes && graph.links
  if (
    body.graph && typeof body.graph === 'object' &&
    Array.isArray(body.graph.nodes) && Array.isArray(body.graph.links)
  ) {
    return 'gitnexus@1';
  }

  // 3. code-review-graph: nodes && edges && stats with nodes_by_kind
  if (
    Array.isArray(body.nodes) && Array.isArray(body.edges) &&
    body.stats && typeof body.stats === 'object' &&
    body.stats.nodes_by_kind && typeof body.stats.nodes_by_kind === 'object'
  ) {
    return 'code-review-graph@1';
  }

  // 4. generic: nodes + edges, no stats
  if (Array.isArray(body.nodes) && Array.isArray(body.edges) && !body.stats) {
    return 'generic@1';
  }

  return null;
}

/**
 * Read a graph file from disk and try to sniff its format.
 * Returns { format, parseError } where exactly one is set.
 */
export function sniffGraphFile(absPath) {
  let raw;
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch (e) {
    return { format: null, parseError: `read failed: ${e.message}` };
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return { format: null, parseError: `JSON parse: ${e.message}` };
  }
  return { format: sniffFormat(body), parseError: null };
}
