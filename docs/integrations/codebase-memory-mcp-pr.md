# PR draft — codebase-memory-mcp → understand-quickly

Target repo: [`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI / server command surface (whether the persistent KG is built via a separate `codebase-memory build` step or implicitly on first connect), the conventional graph file path (this draft assumes `.codebase-memory/graph.json`), and which existing schema is the closest fit. The rest is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs that ships its own MCP server and a stable `registry.json` API. codebase-memory-mcp is itself an MCP server backed by a persistent code-knowledge graph — the registry is the natural place for those graphs to be discovered by *other* agents (Claude, Codex, Cursor) without each user pointing at a private endpoint.

Wiring a `--publish` flag (or a one-off `codebase-memory publish` subcommand) means any user who builds a codebase-memory graph can land in the registry with a single token, and any MCP-aware agent can resolve their repo to a graph URL via the registry's `find_graph_for_repo` tool.

- **Discoverability.** Every published codebase-memory graph appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Graphs stay in the user's repo (`.codebase-memory/graph.json`); the registry only stores pointers and fetches from `raw.githubusercontent.com`.
- **Cross-agent reuse.** A graph built by codebase-memory-mcp becomes consumable by any agent that speaks the registry's MCP API — no shared server required.

## What changes

- Add a `--publish` flag (or `codebase-memory publish` subcommand) that flushes the in-memory KG to a stable JSON file at `.codebase-memory/graph.json` and, if `$UNDERSTAND_QUICKLY_TOKEN` is set, fires a `repository_dispatch` event at `looptech-ai/understand-quickly`.
- Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool == "codebase-memory-mcp"`, `metadata.tool_version`, and `metadata.generated_at` in the emitted graph.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx @understand-quickly/cli add` or the wizard and exit cleanly.
- Add a "Publishing to understand-quickly" paragraph to the README near the existing MCP server docs.

## Schema fit

codebase-memory-mcp emits a node/edge graph over a codebase. Two paths:

1. **Reuse `gitnexus@1`** if existing field names align (`nodes[].id`, `nodes[].kind`, `edges[].source`, `edges[].target`). Fastest path — register today, no schema PR.
2. **Land a `codebase-memory@1` schema** if the persisted shape carries memory-specific fields (recency, access counts, embedding refs). Format-authoring path: [`docs/integrations/protocol.md §7`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring) — one PR adding the schema + fixtures.

If you'd like, the registry maintainers can take the schema PR — drop a sample graph into a registry issue and we'll wire it up.

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, the tool writes the file as usual and prints one informational line — no network call, no exit-1.

## Token setup

The user adds a fine-grained GitHub PAT to their environment (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

A drop-in workflow snippet lives at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation behavior unchanged (no graph file written unless explicitly requested).
- [ ] `... --publish` with `UNDERSTAND_QUICKLY_TOKEN` unset writes `.codebase-memory/graph.json` and prints an informational message; exit code 0.
- [ ] `... --publish` with the token set and the repo registered fires the dispatch and the registry's `sync.yml` runs within roughly a minute.
- [ ] `... --publish` with the token set but the repo unregistered prints `register it once with: npx @understand-quickly/cli add`; exit code 0.
- [ ] Emitted graph contains `metadata.tool == "codebase-memory-mcp"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha).

## Notes for the maintainer

- This is opt-in for early adopters; nothing in codebase-memory-mcp's existing API surface needs to break.
- Once the integration ships and a few users land in the registry, we can add `DeusData/codebase-memory-mcp` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `gitnexus@1` schema (closest fit): <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/gitnexus@1.json>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
