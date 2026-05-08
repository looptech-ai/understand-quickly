# @understand-quickly/mcp

A thin [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes the [understand-quickly](https://looptech-ai.github.io/understand-quickly/)
registry to any MCP client (Claude Desktop, Codex, Cursor, etc.).

> Status: stub-quality. It works end-to-end but is intentionally minimal —
> no streaming, no embeddings, no auth.

## What it does

It wraps the public `registry.json` and exposes four tools:

| Tool | Params | Returns |
| --- | --- | --- |
| `list_repos` | `{ format?, tag?, status? }` | Array of `{ id, format, description, status, tags, last_synced, graph_url }` |
| `find_graph_for_repo` | `{ id?, github_url? }` (at least one required) | Single registry entry's graph_url + drift metadata, or `{ found: false, suggestions: [...] }` with up to 5 fuzzy-matched ids |
| `get_graph` | `{ id }` | Parsed graph JSON for that entry's `graph_url` |
| `search_concepts` | `{ query, id? }` | Default: aggregated concept matches from the precomputed `stats.json` (single GET, cached 60s). With `id`: substring match across one graph's nodes. Falls back to a capped cross-graph fan-out if `stats.json` is unreachable. |

The registry response is cached in-memory for 60 seconds. `stats.json` uses an
identical 60-second TTL cache.

### `find_graph_for_repo`

Accepts either an `id` (the registry id, `owner/repo`) or a `github_url`. The
URL parser tolerates:

- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `https://github.com/owner/repo/` (trailing slash)
- `https://github.com/owner/repo/tree/main/...` (branch / sub-path)
- `git@github.com:owner/repo.git`

When the entry is found, the response includes `last_synced`, `last_sha`,
`source_sha`, `head_sha`, `commits_behind`, and a pretty `drift_summary`
(e.g. `"behind by 17 commits"`) when those fields are present in the registry.

If the entry is not found, the response is
`{ found: false, suggestions: [...] }` with up to 5 fuzzy-matched ids
(Levenshtein distance ≤ 3 against the lowercased id).

### `search_concepts`

By default — that is, when `id` is not provided — `search_concepts` reads the
precomputed `stats.json` aggregate (a single, cached GET) and returns matching
concept terms with their entry counts and up to 3 sample registry ids. This
replaces the previous behaviour, which fanned out up to 5 graph fetches at
request time.

When `id` is provided, it falls back to the legacy single-graph node search
(substring match against `id` / `label` / `name`). When `stats.json` is
unavailable (404 or schema mismatch), it falls back to the capped cross-graph
fan-out for backward compatibility.

The `source` field on the response indicates which mode served the request:
`"stats"`, `"graph"`, or `"fanout"`.

## Install

```bash
cd mcp
npm install
npm run build   # compiles TypeScript -> dist/
npm test        # runs node:test across registry/cache and tool logic
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
| `UNDERSTAND_QUICKLY_STATS` | `https://looptech-ai.github.io/understand-quickly/stats.json` | Override the precomputed stats source consumed by `search_concepts`. |

## Current limitations

- **In-memory cache only.** Every server process refetches once a minute. No
  cross-process or on-disk cache.
- **Cross-graph fan-out is only a fallback.** When `search_concepts` falls back
  (no stats.json), it scans only the first 5 `status: ok` entries sequentially.
- **Substring search is dumb.** No fuzzy matching, no ranking, no embeddings.
- **No streaming or progress reporting.** Tools block until the upstream
  responds.
- **Best-effort node enumeration.** The single-graph fallback assumes the graph
  has a `nodes` / `entities` / `concepts` / `items` array; otherwise it walks
  top-level array values.
- **No retries or backoff** on upstream `graph_url` fetch failures — failed
  fetches return an empty result for that entry instead of erroring out.

These are all acceptable for an MVP. If you need more, open an issue.
