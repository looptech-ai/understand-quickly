import {
  filterEntries,
  loadRegistry,
  resolveRegistrySource,
} from "../registry.js";
import type {
  ListReposParams,
  RegistryEntry,
  RepoSummary,
} from "../types.js";

function toSummary(entry: RegistryEntry): RepoSummary {
  return {
    id: entry.id,
    format: entry.format,
    description: entry.description,
    status: entry.status,
    tags: entry.tags,
    last_synced: entry.last_synced,
    graph_url: entry.graph_url,
  };
}

export async function listRepos(
  params: ListReposParams = {},
): Promise<RepoSummary[]> {
  const registry = await loadRegistry({ source: resolveRegistrySource() });
  const filtered = filterEntries(registry.entries, (entry) => {
    if (params.format && entry.format !== params.format) return false;
    if (params.status && entry.status !== params.status) return false;
    if (params.tag) {
      const tags = entry.tags ?? [];
      if (!tags.includes(params.tag)) return false;
    }
    return true;
  });
  return filtered.map(toSummary);
}

export const listReposToolDefinition = {
  name: "list_repos",
  description:
    "List entries in the understand-quickly registry. Optional filters: `format`, `tag`, `status`.",
  inputSchema: {
    type: "object" as const,
    properties: {
      format: {
        type: "string",
        description: "Exact match on entry.format (e.g. \"understand-anything@1\").",
      },
      tag: {
        type: "string",
        description: "Returns entries whose `tags` array contains this string.",
      },
      status: {
        type: "string",
        description: "Exact match on entry.status (typically \"ok\").",
      },
    },
    additionalProperties: false,
  },
};
