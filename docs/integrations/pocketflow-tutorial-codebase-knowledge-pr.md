# PR draft — PocketFlow-Tutorial-Codebase-Knowledge → understand-quickly

Target repo: [`The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge`](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge)

Paste the body below into the PR description on that repo. The author should confirm the exact run command (`python main.py`, `pocketflow-tutorial`, etc.) and the conventional output path (this draft assumes `.pocketflow/tutorial.json` for the knowledge graph and the existing tutorial markdown stays where it is). The rest is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs that ships an MCP server and a stable `registry.json` API. PocketFlow-Tutorial-Codebase-Knowledge generates code-knowledge tutorials from any repo — the per-codebase knowledge artifact it produces is a natural fit for the registry's `generic@1` (or, with one schema PR, a richer `tutorial@1`).

Wiring a `--publish` flag means any user who generates a tutorial for their repo can land in the registry with one flag, and AI agents (Claude, Codex, Cursor via MCP) can discover and consume their tutorial-knowledge graph immediately.

- **Discoverability.** Every published tutorial appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Tutorial output stays in the user's repo; the registry only stores pointers and fetches from `raw.githubusercontent.com`.
- **Agent-consumable.** Schema validation, drift detection (when `metadata.commit` is set), and a turnkey MCP server.

## What changes

- Add a `--publish` flag (or equivalent — `--register`, `--publish-to-uq`) to the PocketFlow tutorial generator command.
- After the existing tutorial generation step, when `--publish` is set:
  1. Emit a small JSON knowledge graph at `.pocketflow/tutorial.json` capturing the chapters / concepts / source-file pointers as `nodes` and the chapter-to-source / cross-references as `edges` (matches `generic@1`).
  2. Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool == "pocketflow-tutorial-codebase-knowledge"`, `metadata.tool_version`, and `metadata.generated_at`.
  3. If `$UNDERSTAND_QUICKLY_TOKEN` is set, fire a `repository_dispatch` event at `looptech-ai/understand-quickly`. Otherwise, write the file locally and exit cleanly.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx understand-quickly-cli add` or the wizard and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the README.

## Schema fit

Two paths:

1. **Reuse `generic@1`** for a fast first integration — only requires `nodes` and `edges` arrays, so a flat node-per-chapter / node-per-source-file shape lands today with no schema PR.
2. **Land a `tutorial@1` schema** that captures tutorial-specific structure (chapter ordering, prerequisite edges, source-file citations). Format-authoring path: [`docs/integrations/protocol.md §7`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring).

Recommended sequence: ship against `generic@1` first to validate adoption; co-author `tutorial@1` once a couple of users land in the registry.

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, the tool writes the knowledge-graph file and prints one informational line — no network call, no exit-1.

## Token setup

Fine-grained GitHub PAT, single permission:

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

Drop-in workflow at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation behavior unchanged — no extra files unless requested.
- [ ] `... --publish` with `UNDERSTAND_QUICKLY_TOKEN` unset writes `.pocketflow/tutorial.json` and prints an informational message; exit code 0.
- [ ] `... --publish` with the token set and the repo registered fires the dispatch and the registry's `sync.yml` runs within roughly a minute.
- [ ] `... --publish` with the token set but the repo unregistered prints the registration hint; exit code 0.
- [ ] Emitted file contains `metadata.tool == "pocketflow-tutorial-codebase-knowledge"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha).

## Notes for the maintainer

- This is opt-in for early adopters; nothing in PocketFlow's existing surface needs to break.
- Once the integration ships and a few users land in the registry, we can add `The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge.

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `generic@1` schema (fast-path): <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/generic@1.json>
- Format authoring (for `tutorial@1`): <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
