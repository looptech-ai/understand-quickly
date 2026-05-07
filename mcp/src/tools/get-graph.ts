import {
  fetchGraph,
  findEntryById,
  loadRegistry,
  resolveRegistrySource,
} from "../registry.js";
import type { GetGraphParams } from "../types.js";

export async function getGraph(params: GetGraphParams): Promise<unknown> {
  if (!params || typeof params.id !== "string" || params.id.length === 0) {
    throw new Error("`id` is required");
  }
  const registry = await loadRegistry({ source: resolveRegistrySource() });
  const entry = findEntryById(registry, params.id);
  if (!entry) {
    throw new Error(`No registry entry found with id "${params.id}"`);
  }
  return fetchGraph(entry.graph_url);
}

export const getGraphToolDefinition = {
  name: "get_graph",
  description:
    "Fetch and return the parsed knowledge graph JSON for a registry entry by id.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Registry entry id, e.g. \"Lum1104/Understand-Anything\".",
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
};
