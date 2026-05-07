// Builders for registry entries, raw GitHub URLs, and prefilled GitHub
// issue / PR URLs. Pure functions — no I/O.

/**
 * Map a sniffed format string to its conventional graph file path.
 */
export const FORMAT_TO_PATH = {
  'understand-anything@1': '.understand-anything/knowledge-graph.json',
  'gitnexus@1': '.gitnexus/graph.json',
  'code-review-graph@1': '.code-review-graph/graph.json',
  'generic@1': 'graph.json'
};

/**
 * Build the canonical raw.githubusercontent.com URL for a path on a branch.
 */
export function buildRawGithubUrl(id, branch, relPath) {
  if (!id || !id.includes('/')) {
    throw new Error(`bad id: ${id}; expected owner/repo`);
  }
  if (!branch) throw new Error('branch is required');
  if (!relPath) throw new Error('relPath is required');
  // Encode each path segment so spaces / unicode don't break the URL.
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${id}/${branch}/${encoded}`;
}

/**
 * Build a registry entry. Output matches schemas/meta.schema.json.
 * Required: id, format, graph_url. Owner/repo are split from id.
 * Tags is normalized to a sorted unique array (or omitted if empty).
 */
export function buildEntry({
  id,
  format,
  graph_url,
  default_branch,
  description,
  tags
} = {}) {
  if (!id || !/^[^/]+\/[^/]+$/.test(id)) {
    throw new Error(`bad id: ${JSON.stringify(id)}; expected "owner/repo"`);
  }
  if (!format) throw new Error('format is required');
  if (!graph_url) throw new Error('graph_url is required');

  const [owner, repo] = id.split('/');
  const entry = {
    id,
    owner,
    repo,
    format,
    graph_url
  };
  if (default_branch) entry.default_branch = default_branch;
  if (description && String(description).trim().length > 0) {
    entry.description = String(description).trim();
  }
  if (Array.isArray(tags) && tags.length > 0) {
    const cleaned = Array.from(new Set(
      tags.map(t => String(t).trim()).filter(Boolean)
    )).sort();
    if (cleaned.length > 0) entry.tags = cleaned;
  }
  return entry;
}

/**
 * Parse a comma-separated tags string. Returns string[] (possibly empty).
 */
export function parseTags(s) {
  if (!s) return [];
  return String(s).split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Build the prefilled "Add my repo" GitHub issue URL for the registry repo.
 */
export function buildIssueUrl(registryRepo, entry) {
  if (!registryRepo || !registryRepo.includes('/')) {
    throw new Error(`bad registry repo: ${registryRepo}`);
  }
  const title = `Add ${entry.id} to registry`;
  const body =
    `<!-- The understand-quickly CLI generated this issue. Maintainers: ` +
    `the registry bot will translate this into a PR appending the entry below. -->\n\n` +
    `**Repo:** \`${entry.id}\`\n` +
    `**Format:** \`${entry.format}\`\n` +
    `**Graph URL:** ${entry.graph_url}\n\n` +
    (entry.description ? `**Description:** ${entry.description}\n\n` : '') +
    `**Entry JSON:**\n\n` +
    '```json\n' +
    JSON.stringify(entry, null, 2) + '\n' +
    '```\n';

  const params = new URLSearchParams();
  params.set('title', title);
  params.set('body', body);
  params.set('labels', 'add-repo');
  return `https://github.com/${registryRepo}/issues/new?${params.toString()}`;
}

/**
 * Append a new entry to a parsed registry object. Returns a deep-ish clone
 * with the new entry inserted in alphabetical order by id. If the id already
 * exists, throws. Used by --open-pr.
 */
export function insertEntry(registry, entry) {
  if (!registry || !Array.isArray(registry.entries)) {
    throw new Error('registry has no entries[] array');
  }
  if (registry.entries.some(e => e.id === entry.id)) {
    throw new Error(`entry already exists for id: ${entry.id}`);
  }
  const next = {
    ...registry,
    entries: [...registry.entries, entry].sort((a, b) => a.id.localeCompare(b.id))
  };
  return next;
}
