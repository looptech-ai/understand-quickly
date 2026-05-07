#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { listRepos } from "./tools/list-repos.js";
import { getGraph } from "./tools/get-graph.js";
import { searchConcepts } from "./tools/search-concepts.js";

const server = new McpServer(
  {
    name: "understand-quickly-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorContent(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "list_repos",
  {
    description:
      "List entries in the understand-quickly registry. Optional filters: format, tag, status.",
    inputSchema: {
      format: z
        .string()
        .optional()
        .describe("Exact match on entry.format (e.g. \"understand-anything@1\")."),
      tag: z
        .string()
        .optional()
        .describe("Returns entries whose tags array contains this string."),
      status: z
        .string()
        .optional()
        .describe("Exact match on entry.status (typically \"ok\")."),
    },
  },
  async ({ format, tag, status }) => {
    try {
      const repos = await listRepos({ format, tag, status });
      return jsonContent(repos);
    } catch (err) {
      return errorContent(err);
    }
  },
);

server.registerTool(
  "get_graph",
  {
    description:
      "Fetch and return the parsed knowledge graph JSON for a registry entry by id.",
    inputSchema: {
      id: z
        .string()
        .min(1)
        .describe("Registry entry id, e.g. \"Lum1104/Understand-Anything\"."),
    },
  },
  async ({ id }) => {
    try {
      const graph = await getGraph({ id });
      return jsonContent(graph);
    } catch (err) {
      return errorContent(err);
    }
  },
);

server.registerTool(
  "search_concepts",
  {
    description:
      "Substring-search node label/name/id fields. If `id` is given, search just that graph; otherwise scan up to the first 5 status:ok entries.",
    inputSchema: {
      query: z.string().min(1).describe("Substring to search for (case-insensitive)."),
      id: z
        .string()
        .optional()
        .describe("Optional entry id to scope the search to a single graph."),
    },
  },
  async ({ query, id }) => {
    try {
      const result = await searchConcepts({ query, id });
      return jsonContent(result);
    } catch (err) {
      return errorContent(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we don't pollute the JSON-RPC stream on stdout.
  // eslint-disable-next-line no-console
  console.error("understand-quickly MCP server ready on stdio");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal MCP server error:", err);
  process.exit(1);
});
