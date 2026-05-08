import {
  findEntryById,
  loadRegistry,
  resolveRegistrySource,
} from "../registry.js";
import type {
  FetchImpl,
  FindGraphForRepoParams,
  RegistryEntry,
} from "../types.js";

// Registry id pattern: `<owner>/<repo>` with the same character class the
// site/scripts already use in error messages and validation.
const ID_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const HTTPS_GITHUB_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+)(?:[\/?#].*)?$/i;
const SSH_GITHUB_RE = /^git@github\.com:([^/\s]+)\/([^/\s?#]+?)(?:\.git)?$/i;

/**
 * Parse a github URL into a registry id. Accepts:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - https://github.com/owner/repo/ (trailing slash)
 *   - https://github.com/owner/repo/tree/branch/...
 *   - git@github.com:owner/repo.git
 */
export function parseGithubUrl(url: string): string | undefined {
  if (typeof url !== "string" || url.length === 0) return undefined;
  const trimmed = url.trim();

  const ssh = trimmed.match(SSH_GITHUB_RE);
  if (ssh) {
    const owner = ssh[1];
    const repo = ssh[2].replace(/\.git$/i, "");
    if (!owner || !repo) return undefined;
    return `${owner}/${repo}`;
  }

  const https = trimmed.match(HTTPS_GITHUB_RE);
  if (https) {
    const owner = https[1];
    let repo = https[2];
    repo = repo.replace(/\.git$/i, "");
    if (!owner || !repo) return undefined;
    return `${owner}/${repo}`;
  }

  return undefined;
}

/** Levenshtein distance, capped early when it exceeds `maxDistance` for speed. */
export function levenshtein(a: string, b: string, maxDistance = Infinity): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  if (Math.abs(al - bl) > maxDistance) return maxDistance + 1;

  // Two-row DP (rolling).
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

function suggestFuzzy(target: string, ids: string[], max = 5, maxDistance = 3): string[] {
  const targetLower = target.toLowerCase();
  const scored: Array<{ id: string; dist: number }> = [];
  for (const id of ids) {
    const d = levenshtein(targetLower, id.toLowerCase(), maxDistance);
    if (d <= maxDistance) scored.push({ id, dist: d });
  }
  scored.sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id));
  return scored.slice(0, max).map((s) => s.id);
}

function driftSummary(entry: RegistryEntry): string | undefined {
  const behind = entry.commits_behind;
  if (typeof behind === "number" && behind > 0) {
    return `behind by ${behind} commit${behind === 1 ? "" : "s"}`;
  }
  if (typeof behind === "number" && behind === 0) {
    return "up to date";
  }
  return undefined;
}

export interface FindGraphForRepoFoundResult {
  found: true;
  id: string;
  format: string;
  graph_url: string;
  status?: string;
  last_synced?: string;
  last_sha?: string;
  source_sha?: string;
  head_sha?: string;
  commits_behind?: number;
  drift_summary?: string;
}

export interface FindGraphForRepoNotFoundResult {
  found: false;
  suggestions: string[];
}

export type FindGraphForRepoResult =
  | FindGraphForRepoFoundResult
  | FindGraphForRepoNotFoundResult;

export interface FindGraphForRepoOptions {
  fetchImpl?: FetchImpl;
  source?: string;
}

export async function findGraphForRepo(
  params: FindGraphForRepoParams,
  options: FindGraphForRepoOptions = {},
): Promise<FindGraphForRepoResult> {
  const hasId = typeof params?.id === "string" && params.id.length > 0;
  const hasUrl =
    typeof params?.github_url === "string" && params.github_url.length > 0;

  if (!hasId && !hasUrl) {
    throw new Error(
      "Provide at least one of `id` or `github_url` (e.g. \"owner/repo\" or \"https://github.com/owner/repo\").",
    );
  }

  let resolvedId: string | undefined;
  if (hasId) {
    if (!ID_PATTERN.test(params.id as string)) {
      throw new Error(
        `\`id\` must match \`owner/repo\` (got "${params.id}").`,
      );
    }
    resolvedId = params.id as string;
  } else if (hasUrl) {
    const parsed = parseGithubUrl(params.github_url as string);
    if (!parsed) {
      throw new Error(
        `Could not extract owner/repo from \`github_url\`: "${params.github_url}".`,
      );
    }
    if (!ID_PATTERN.test(parsed)) {
      throw new Error(
        `Parsed id "${parsed}" does not match \`owner/repo\` pattern.`,
      );
    }
    resolvedId = parsed;
  }

  const registry = await loadRegistry({
    source: options.source ?? resolveRegistrySource(),
    fetchImpl: options.fetchImpl,
  });

  const entry = findEntryById(registry, resolvedId as string);
  if (!entry) {
    const suggestions = suggestFuzzy(
      resolvedId as string,
      registry.entries.map((e) => e.id),
    );
    return { found: false, suggestions };
  }

  const out: FindGraphForRepoFoundResult = {
    found: true,
    id: entry.id,
    format: entry.format,
    graph_url: entry.graph_url,
  };
  if (entry.status !== undefined) out.status = entry.status;
  if (entry.last_synced !== undefined) out.last_synced = entry.last_synced;
  if (entry.last_sha !== undefined) out.last_sha = entry.last_sha;
  if (entry.source_sha !== undefined) out.source_sha = entry.source_sha;
  if (entry.head_sha !== undefined) out.head_sha = entry.head_sha;
  if (typeof entry.commits_behind === "number") {
    out.commits_behind = entry.commits_behind;
  }
  const drift = driftSummary(entry);
  if (drift) out.drift_summary = drift;
  return out;
}

export const findGraphForRepoToolDefinition = {
  name: "find_graph_for_repo",
  description:
    "Look up a registry entry by `id` (\"owner/repo\") or `github_url` (https or ssh). Returns the entry's graph_url and drift metadata, or `{found:false, suggestions}` with up to 5 fuzzy-matched ids.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Registry id (\"owner/repo\"). At least one of `id` or `github_url` is required.",
      },
      github_url: {
        type: "string",
        description:
          "GitHub URL (https or ssh form). Branch/path suffixes and a trailing `.git` are tolerated.",
      },
    },
    additionalProperties: false,
  },
};
