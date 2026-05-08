# PR draft — Graphify → understand-quickly

Target repo: [`safishamsi/graphify`](https://github.com/safishamsi/graphify)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI invocation (`graphify build`, `graphify export`, etc.), the conventional output path (this draft assumes `.graphify/graph.json` — update to whatever the tool already writes), and whether the existing emitted shape is closer to `gitnexus@1` or warrants a new `graphify@1` schema. The rest is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs that ships an MCP server and a stable `registry.json` API. Graphify already builds a knowledge graph from any folder of code — exactly the producer shape the registry is designed for. Wiring a `--publish` flag means any user who runs Graphify can land in the registry with one flag, and AI agents (Claude, Codex, Cursor via MCP) can discover and consume their graph immediately.

- **Discoverability.** Every published Graphify graph appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Graphs stay in the user's repo (`.graphify/graph.json`); the registry only stores pointers and fetches from `raw.githubusercontent.com`.
- **Agent-consumable.** Schema validation, drift detection (when `metadata.commit` is set), and a turnkey MCP server.

## What changes

- Add a `--publish` flag (or equivalent — `--register`, `--publish-to-uq`) to the Graphify CLI surface that writes the graph file. If a programmatic API is exposed, accept the same option there.
- After the existing graph emit step, when `--publish` is set: fire a `repository_dispatch` event at `looptech-ai/understand-quickly` using a token from `$UNDERSTAND_QUICKLY_TOKEN`.
- Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool == "graphify"`, `metadata.tool_version`, and `metadata.generated_at` in the emitted graph.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx @understand-quickly/cli add` or the wizard and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the README near the existing CLI docs.

## Schema fit

The Graphify output is a node/edge graph over a folder of code. Two paths:

1. **Reuse `gitnexus@1`** if the existing field names (`nodes[].id`, `nodes[].kind`, `edges[].source`, `edges[].target`) already match. This is the fastest path — register today, no new schema.
2. **Land a `graphify@1` schema** if Graphify uses different field names or carries shape-specific data (community detection results, embedding vectors, etc.). The format-authoring path is documented in [`docs/integrations/protocol.md §7`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring) — one PR adding `schemas/graphify@1.json` plus `ok.json` / `bad.json` / `real-sample.json` fixtures.

If you'd like, the registry maintainers can take the schema PR — drop a sample graph into a registry issue and we'll wire it up.

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, the tool writes the file as usual and prints one informational line — no network call, no exit-1.

## Token setup

The user adds a fine-grained GitHub PAT to their environment (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

A drop-in workflow snippet lives at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation writes the graph file exactly as before.
- [ ] `... --publish` with `UNDERSTAND_QUICKLY_TOKEN` unset writes the file and prints an informational message; exit code 0.
- [ ] `... --publish` with the token set and the repo registered fires the dispatch and the registry's `sync.yml` runs within roughly a minute.
- [ ] `... --publish` with the token set but the repo unregistered prints `register it once with: npx @understand-quickly/cli add`; exit code 0.
- [ ] Emitted graph contains `metadata.tool == "graphify"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha).

## Notes for the maintainer

- This is opt-in for early adopters; nothing in Graphify's existing API surface needs to break.
- Once Graphify has shipped this and a few users land in the registry, we can add `safishamsi/graphify` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates from the integration.

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `gitnexus@1` schema (closest fit): <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/gitnexus@1.json>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
