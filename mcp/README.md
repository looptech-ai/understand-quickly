# @understand-quickly/mcp

A thin [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes the [understand-quickly](https://looptech-ai.github.io/understand-quickly/)
registry to any MCP client (Claude Desktop, Codex, Cursor, etc.).

> Status: stub-quality. It works end-to-end but is intentionally minimal —
> no streaming, no embeddings, no auth.

## What it does

It wraps the public `registry.json` and exposes three tools:

| Tool | Params | Returns |
| --- | --- | --- |
| `list_repos` | `{ format?, tag?, status? }` | Array of `{ id, format, description, status, tags, last_synced, graph_url }` |
| `get_graph` | `{ id }` | Parsed graph JSON for that entry's `graph_url` |
| `search_concepts` | `{ query, id? }` | Substring matches across node `label` / `name` / `id`. With `id` given, scopes to one graph; without, scans up to the first 5 `status: ok` entries (stub cap) |

The registry response is cached in-memory for 60 seconds.

## Install

```bash
cd mcp
npm install
npm run build   # compiles TypeScript -> dist/
npm test        # runs node:test against the registry/cache logic
```

Node 20+ is required (uses the global `fetch`).

## Run locally

For development:

```bash
npm run dev
```

For a built binary:

```bash
npm start
```

The server speaks stdio JSON-RPC. It will not respond to keystrokes — point an
MCP client at it.

## Register with Claude Desktop

Add the following to Claude Desktop's `claude_desktop_config.json` (the path is
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "understand-quickly": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/understand-quickly/mcp/src/index.ts"
      ],
      "env": {
        "UNDERSTAND_QUICKLY_REGISTRY": "https://looptech-ai.github.io/understand-quickly/registry.json"
      }
    }
  }
}
```

Replace `/absolute/path/to/...` with the actual path to your checkout. Restart
Claude Desktop after saving.

If you would rather run the compiled output, swap to:

```json
{
  "mcpServers": {
    "understand-quickly": {
      "command": "node",
      "args": ["/absolute/path/to/understand-quickly/mcp/dist/index.js"]
    }
  }
}
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `UNDERSTAND_QUICKLY_REGISTRY` | `https://looptech-ai.github.io/understand-quickly/registry.json` | Override the registry source (e.g. point at a local file or a fork). |

## Current limitations

- **In-memory cache only.** Every server process refetches once a minute. No
  cross-process or on-disk cache.
- **Cross-graph search is capped at 5 entries.** When `search_concepts` runs
  without an `id`, it scans only the first 5 `status: ok` entries sequentially.
- **Substring search is dumb.** No fuzzy matching, no ranking, no embeddings.
- **No streaming or progress reporting.** Tools block until the upstream
  responds.
- **Best-effort node enumeration.** The search assumes the graph has a
  `nodes` / `entities` / `concepts` / `items` array; otherwise it walks
  top-level array values.
- **No retries or backoff** on upstream `graph_url` fetch failures — failed
  fetches return an empty result for that entry instead of erroring out.

These are all acceptable for an MVP. If you need more, open an issue.
