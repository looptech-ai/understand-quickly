import {
  fetchGraph,
  findEntryById,
  loadRegistry,
  resolveRegistrySource,
} from "../registry.js";
import type {
  RegistryEntry,
  SearchConceptsParams,
  SearchHit,
} from "../types.js";

// Stub-quality cap on cross-graph searches. A real implementation would either
// stream results or build a server-side index — for now we just bound the work.
const CROSS_GRAPH_LIMIT = 5;

interface NodeLike {
  id?: unknown;
  label?: unknown;
  name?: unknown;
  [key: string]: unknown;
}

/**
 * Best-effort node enumeration. Different graph formats nest nodes differently
 * (`nodes`, `entities`, `concepts`, …). For the stub we accept any of those
 * common shapes and fall back to walking the top-level object's array values.
 */
function collectNodes(graph: unknown): NodeLike[] {
  if (!graph || typeof graph !== "object") return [];
  const obj = graph as Record<string, unknown>;
  const candidates = ["nodes", "entities", "concepts", "items"];
  for (const key of candidates) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is NodeLike => !!item && typeof item === "object",
      );
    }
  }
  // Fallback: pull every array value and concat.
  const collected: NodeLike[] = [];
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") collected.push(item as NodeLike);
      }
    }
  }
  return collected;
}

function matchNode(node: NodeLike, query: string): SearchHit | undefined {
  const lower = query.toLowerCase();
  const fields: Array<["id" | "label" | "name", unknown]> = [
    ["id", node.id],
    ["label", node.label],
    ["name", node.name],
  ];
  for (const [field, raw] of fields) {
    if (typeof raw === "string" && raw.toLowerCase().includes(lower)) {
      return {
        node_id: typeof node.id === "string" ? node.id : undefined,
        label: typeof node.label === "string" ? node.label : undefined,
        name: typeof node.name === "string" ? node.name : undefined,
        matched_field: field,
        matched_value: raw,
      };
    }
  }
  return undefined;
}

async function searchOneGraph(
  graphUrl: string,
  query: string,
): Promise<SearchHit[]> {
  let graph: unknown;
  try {
    graph = await fetchGraph(graphUrl);
  } catch (err) {
    // For the stub, swallow per-graph fetch errors so a single 404 does not
    // poison the whole result set.
    return [];
  }
  const nodes = collectNodes(graph);
  const hits: SearchHit[] = [];
  for (const node of nodes) {
    const hit = matchNode(node, query);
    if (hit) hits.push(hit);
  }
  return hits;
}

export interface SearchConceptsResult {
  query: string;
  results: Array<{
    id: string;
    graph_url: string;
    hits: SearchHit[];
  }>;
  truncated?: boolean;
  scanned: number;
}

export async function searchConcepts(
  params: SearchConceptsParams,
): Promise<SearchConceptsResult> {
  if (!params || typeof params.query !== "string" || params.query.length === 0) {
    throw new Error("`query` is required");
  }
  const registry = await loadRegistry({ source: resolveRegistrySource() });

  if (params.id) {
    const entry = findEntryById(registry, params.id);
    if (!entry) {
      throw new Error(`No registry entry found with id "${params.id}"`);
    }
    const hits = await searchOneGraph(entry.graph_url, params.query);
    return {
      query: params.query,
      scanned: 1,
      results: [{ id: entry.id, graph_url: entry.graph_url, hits }],
    };
  }

  const okEntries: RegistryEntry[] = registry.entries.filter(
    (entry) => entry.status === "ok",
  );
  const slice = okEntries.slice(0, CROSS_GRAPH_LIMIT);
  const results: SearchConceptsResult["results"] = [];
  // Sequential to keep the stub gentle on remote hosts.
  for (const entry of slice) {
    const hits = await searchOneGraph(entry.graph_url, params.query);
    if (hits.length > 0) {
      results.push({ id: entry.id, graph_url: entry.graph_url, hits });
    }
  }
  return {
    query: params.query,
    scanned: slice.length,
    truncated: okEntries.length > slice.length,
    results,
  };
}

export const searchConceptsToolDefinition = {
  name: "search_concepts",
  description:
    "Substring-search node label/name/id fields across one graph (if `id` is given) or up to the first 5 ok-status entries.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Substring to search for (case-insensitive).",
      },
      id: {
        type: "string",
        description:
          "Optional entry id to scope the search to a single graph.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};
