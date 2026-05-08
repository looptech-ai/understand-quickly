import {
  fetchGraph,
  findEntryById,
  loadRegistry,
  loadStats,
  resolveRegistrySource,
  resolveStatsSource,
} from "../registry.js";
import type {
  FetchImpl,
  RegistryEntry,
  SearchConceptsParams,
  SearchHit,
  StatsConcept,
} from "../types.js";

// Stub-quality cap on cross-graph searches. A real implementation would either
// stream results or build a server-side index — for now we just bound the work.
const CROSS_GRAPH_LIMIT = 5;
const CONCEPTS_RESULT_CAP = 50;
const SAMPLES_CAP = 3;

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
  fetchImpl?: FetchImpl,
): Promise<SearchHit[]> {
  let graph: unknown;
  try {
    graph = await fetchGraph(graphUrl, fetchImpl);
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
  // Single-graph mode (id given) or fan-out fallback mode.
  results?: Array<{
    id: string;
    graph_url: string;
    hits: SearchHit[];
  }>;
  // stats.json-backed mode (default).
  matches?: Array<{
    term: string;
    count: number;
    entries: number;
    samples: string[];
  }>;
  source: "stats" | "graph" | "fanout";
  truncated?: boolean;
  scanned?: number;
}

export interface SearchConceptsOptions {
  fetchImpl?: FetchImpl;
  registrySource?: string;
  statsSource?: string;
}

async function fanoutSearch(
  query: string,
  fetchImpl: FetchImpl | undefined,
  registrySource: string,
): Promise<SearchConceptsResult> {
  const registry = await loadRegistry({ source: registrySource, fetchImpl });
  const okEntries: RegistryEntry[] = registry.entries.filter(
    (entry) => entry.status === "ok",
  );
  const slice = okEntries.slice(0, CROSS_GRAPH_LIMIT);
  const results: NonNullable<SearchConceptsResult["results"]> = [];
  // Sequential to keep the stub gentle on remote hosts.
  for (const entry of slice) {
    const hits = await searchOneGraph(entry.graph_url, query, fetchImpl);
    if (hits.length > 0) {
      results.push({ id: entry.id, graph_url: entry.graph_url, hits });
    }
  }
  return {
    query,
    source: "fanout",
    scanned: slice.length,
    truncated: okEntries.length > slice.length,
    results,
  };
}

function searchStatsConcepts(
  query: string,
  concepts: StatsConcept[],
): SearchConceptsResult["matches"] {
  const lower = query.toLowerCase();
  const out: NonNullable<SearchConceptsResult["matches"]> = [];
  for (const c of concepts) {
    if (typeof c?.term !== "string") continue;
    if (!c.term.toLowerCase().includes(lower)) continue;
    out.push({
      term: c.term,
      count: c.entries,
      entries: c.entries,
      samples: Array.isArray(c.samples) ? c.samples.slice(0, SAMPLES_CAP) : [],
    });
    if (out.length >= CONCEPTS_RESULT_CAP) break;
  }
  return out;
}

export async function searchConcepts(
  params: SearchConceptsParams,
  options: SearchConceptsOptions = {},
): Promise<SearchConceptsResult> {
  if (!params || typeof params.query !== "string" || params.query.length === 0) {
    throw new Error("`query` is required");
  }
  const registrySource = options.registrySource ?? resolveRegistrySource();
  const statsSource = options.statsSource ?? resolveStatsSource();
  const fetchImpl = options.fetchImpl;

  // Single-graph mode: keep the legacy fan-out behavior for one specific graph
  // since stats.json is repo-keyed by sample only and is not a substitute.
  if (params.id) {
    const registry = await loadRegistry({ source: registrySource, fetchImpl });
    const entry = findEntryById(registry, params.id);
    if (!entry) {
      throw new Error(`No registry entry found with id "${params.id}"`);
    }
    const hits = await searchOneGraph(entry.graph_url, params.query, fetchImpl);
    return {
      query: params.query,
      source: "graph",
      scanned: 1,
      results: [{ id: entry.id, graph_url: entry.graph_url, hits }],
    };
  }

  // Default: stats.json-backed concept search. Cheap (one GET, cached 60s).
  try {
    const stats = await loadStats({ source: statsSource, fetchImpl });
    const matches = searchStatsConcepts(params.query, stats.concepts);
    return {
      query: params.query,
      source: "stats",
      matches,
    };
  } catch (err) {
    // Fall through to the legacy fan-out so an outage on stats.json does not
    // break this tool entirely.
    return fanoutSearch(params.query, fetchImpl, registrySource);
  }
}

export const searchConceptsToolDefinition = {
  name: "search_concepts",
  description:
    "Search aggregated concept terms (default: precomputed `stats.json`). Pass `id` to fall back to a single-graph node search. If `stats.json` is unavailable, falls back to a capped cross-graph node fan-out.",
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
          "Optional entry id. If given, scopes the search to that single graph (legacy node-level mode).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};
