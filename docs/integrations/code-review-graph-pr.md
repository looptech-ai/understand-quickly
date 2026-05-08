# PR draft — code-review-graph → understand-quickly

Target repo: [`tirth8205/code-review-graph`](https://github.com/tirth8205/code-review-graph)

Paste the body below into the PR description on that repo. The author should confirm the exact subcommand and `export_graph_data` entry point before submitting.

---

## Title

`Add --publish-to-uq flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs with an MCP server and a stable `registry.json` API. code-review-graph is one of three first-class formats already supported (`code-review-graph@1`). Wiring a `--publish-to-uq` flag into the existing `visualize` subcommand (or the `export_graph_data` step that backs it) means any user who runs code-review-graph can land in the registry with one flag — and AI agents using the registry's MCP server can consume their graph immediately.

- **Discoverability.** Every published code-review-graph artifact appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Graphs stay in the user's repo (`.crg/graph.json`, or wherever `export_graph_data` writes); the registry only stores pointers.
- **Agent-consumable.** Schema validation, drift detection (when `metadata.commit` is set), MCP server out of the box.

## What changes

- Add a `--publish-to-uq` flag to the `visualize` subcommand (or whichever surface `export_graph_data` is wired into).
- After the existing local artifact write, when `--publish-to-uq` is set: fire a `repository_dispatch` event at `looptech-ai/understand-quickly` using a token from `$UNDERSTAND_QUICKLY_TOKEN`.
- Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool_version`, and `metadata.generated_at` in the exported graph alongside the existing `_SCHEMA_SQL`-derived fields. The `code-review-graph@1` JSON Schema already declares the metadata block.
- If the user's repo isn't yet in the registry, print a one-liner pointing at the wizard / CLI and exit cleanly — don't fail the visualize run.
- Add a short "Publishing to understand-quickly" paragraph to the README near the `visualize` docs.

## No-op default

`--publish-to-uq` is opt-in. Existing `visualize` invocations are unaffected. With the flag set but `UNDERSTAND_QUICKLY_TOKEN` unset, the tool writes the local artifact as usual and prints one informational line — no network call, no exit-1.

## Token setup

The user adds a fine-grained GitHub PAT to their environment (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

A drop-in workflow snippet lives at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] `visualize` without the flag writes the local artifact exactly as before.
- [ ] `visualize --publish-to-uq` with `UNDERSTAND_QUICKLY_TOKEN` unset writes the artifact and prints an informational message; exit code 0.
- [ ] `visualize --publish-to-uq` with the token set and the repo registered fires the dispatch and the registry's `sync.yml` runs within roughly a minute.
- [ ] `visualize --publish-to-uq` with the token set but the repo unregistered prints `register it once with: npx @understand-quickly/cli add`; exit code 0.
- [ ] Exported JSON contains `metadata.tool == "code-review-graph"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha).

## Notes for the maintainer

- The registry is in early adoption; this is opt-in for early users. Nothing in code-review-graph's existing surface needs to break.
- Once code-review-graph has shipped this and a few users land in the registry, we can add `tirth8205/code-review-graph` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `code-review-graph@1` schema: <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/code-review-graph@1.json>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
