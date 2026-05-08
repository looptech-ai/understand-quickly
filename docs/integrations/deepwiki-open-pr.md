# PR draft — deepwiki-open → understand-quickly

Target repo: [`AsyncFuncAI/deepwiki-open`](https://github.com/AsyncFuncAI/deepwiki-open)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI command (`deepwiki build`, `deepwiki gen`, etc.), the conventional output path (this draft assumes `.deepwiki/wiki.json`), and pick the schema target (`generic@1` for a fast first integration, or land a new `wiki@1` for richer wiki-specific structure). The rest of the wording is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs that ships an MCP server and a stable `registry.json` API. deepwiki-open is the open clone of DeepWiki — a wiki-from-code generator. Wiring a `--publish` flag means any user who generates a deepwiki for their repo can land in the registry with one flag, and AI agents (Claude, Codex, Cursor via MCP) can discover and consume their wiki immediately.

- **Discoverability.** Every published deepwiki appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Wiki output stays in the user's repo (`.deepwiki/wiki.json`); the registry only stores pointers and fetches from `raw.githubusercontent.com`.
- **Agent-consumable.** Schema validation, drift detection (when `metadata.commit` is set), and a turnkey MCP server.

## What changes

- Add a `--publish` flag (or equivalent — `--register`, `--publish-to-uq`) to the deepwiki-open generator command. If a programmatic API is exposed, accept the same option there.
- After the existing wiki generation step, when `--publish` is set: fire a `repository_dispatch` event at `looptech-ai/understand-quickly` using a token from `$UNDERSTAND_QUICKLY_TOKEN`.
- Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool == "deepwiki-open"`, `metadata.tool_version`, and `metadata.generated_at` in the emitted JSON.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx @understand-quickly/cli add` or the wizard and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the README.

## Schema fit

deepwiki-open emits a structured wiki (sections, articles, links). Two paths:

1. **Reuse `generic@1`** for a fast first integration — the fallback schema only requires `nodes` and `edges` arrays, so a flat node-per-article shape lands today with no schema PR. Good enough for "the registry knows this wiki exists" UX.
2. **Land a `wiki@1` schema** that captures wiki-specific structure (article headings, cross-links, citations). The format-authoring path is documented in [`docs/integrations/protocol.md §7`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring) — one PR adding `schemas/wiki@1.json` + fixtures (`ok.json`, `bad.json`, `real-sample.json`).

Recommended sequence: ship the integration first against `generic@1` to validate adoption; co-author `wiki@1` once a couple of users land in the registry.

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, the tool writes the wiki file as usual and prints one informational line — no network call, no exit-1.

## Token setup

The user adds a fine-grained GitHub PAT to their environment (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

A drop-in workflow snippet lives at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation writes `.deepwiki/wiki.json` exactly as before.
- [ ] `... --publish` with `UNDERSTAND_QUICKLY_TOKEN` unset writes the file and prints an informational message; exit code 0.
- [ ] `... --publish` with the token set and the repo registered fires the dispatch and the registry's `sync.yml` runs within roughly a minute.
- [ ] `... --publish` with the token set but the repo unregistered prints `register it once with: npx @understand-quickly/cli add`; exit code 0.
- [ ] Emitted file contains `metadata.tool == "deepwiki-open"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha).

## Notes for the maintainer

- This is opt-in for early adopters; nothing in deepwiki-open's existing API surface needs to break.
- Once the integration ships and a few users land in the registry, we can add `AsyncFuncAI/deepwiki-open` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `generic@1` schema (fast-path): <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/generic@1.json>
- Format authoring (for `wiki@1`): <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
