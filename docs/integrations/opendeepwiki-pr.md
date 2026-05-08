# PR draft — OpenDeepWiki → understand-quickly

Target repo: [`AIDotNet/OpenDeepWiki`](https://github.com/AIDotNet/OpenDeepWiki)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI / service surface (since OpenDeepWiki is a C#/TS server, the integration may be a plugin or service-side hook rather than a CLI flag) and the path the wiki is exported to. The rest is repo-agnostic.

---

## Title

`Add registry-publish hook for understand-quickly integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs that ships an MCP server and a stable `registry.json` API. OpenDeepWiki is the C#/TS DeepWiki implementation, broadening the audience beyond the Python-first AI ecosystem. Wiring a publish hook means any OpenDeepWiki deployment can land its generated wikis in the registry, and AI agents (Claude, Codex, Cursor via MCP) can discover and consume them immediately — without each user pointing at a private OpenDeepWiki endpoint.

- **Discoverability.** Every published OpenDeepWiki entry appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Wiki output stays in the user's repo; the registry only stores pointers and fetches from `raw.githubusercontent.com`.
- **Agent-consumable.** Schema validation, drift detection (when `metadata.commit` is set), and a turnkey MCP server.

## What changes

OpenDeepWiki's surface is a service rather than a CLI, so the integration is a hook rather than a flag. Two additions:

1. **A configurable export step.** When OpenDeepWiki finishes generating a wiki for a repo, optionally write a JSON knowledge-graph projection at `<repo>/.opendeepwiki/wiki.json` (or wherever the user already commits OpenDeepWiki output). The shape is a flat node/edge graph keyed to `generic@1` for v0; a richer `wiki@1` schema can follow.
2. **An optional registry dispatch.** If a configured `UNDERSTAND_QUICKLY_TOKEN` is present (env var or service config), fire a `repository_dispatch` event at `looptech-ai/understand-quickly` after the export. If not, only the local export happens — no network call.

Embed in the exported JSON:

- `metadata.tool == "opendeepwiki"`
- `metadata.tool_version` (the OpenDeepWiki release / git describe)
- `metadata.generated_at` (ISO-8601)
- `metadata.commit` (40-hex `git rev-parse HEAD` of the source repo when known)

If the user's repo isn't yet in the registry, log a friendly one-liner pointing at `npx @understand-quickly/cli add` or the wizard — don't fail the parent run.

## Schema fit

Two paths:

1. **Reuse `generic@1`** for a fast first integration — only requires `nodes` and `edges` arrays, so a flat node-per-article / node-per-source-file shape lands today with no schema PR.
2. **Land a `wiki@1` schema** that captures wiki-specific structure (article headings, cross-links, citations). Format-authoring path: [`docs/integrations/protocol.md §7`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring).

Recommended sequence: ship against `generic@1` first to validate adoption; co-author `wiki@1` together with `deepwiki-open` once both producers exist.

## No-op default

The publish hook is opt-in (gated on a config flag and the env var). Default OpenDeepWiki behavior is unchanged.

## Token setup

Fine-grained GitHub PAT, single permission:

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

Drop-in workflow at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default OpenDeepWiki behavior unchanged with the publish hook disabled.
- [ ] With the publish hook enabled but no token, OpenDeepWiki writes the export file and logs an informational message; no network call.
- [ ] With the token set and the repo registered, the dispatch fires and the registry's `sync.yml` runs within roughly a minute.
- [ ] With the token set but the repo unregistered, the log message points at `npx @understand-quickly/cli add`; no failure.
- [ ] Exported JSON contains `metadata.tool == "opendeepwiki"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha when known).

## Notes for the maintainer

- This is opt-in for early adopters; nothing in OpenDeepWiki's existing surface needs to break.
- A Python/TS reference implementation of this dispatch lives in the registry's `docs/integrations/sample-publish-workflow.yml` — happy to translate to C# / .NET 8 helpers as a follow-up PR if useful.
- Once the integration ships and a few users land in the registry, we can add `AIDotNet/OpenDeepWiki` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `generic@1` schema (fast-path): <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/generic@1.json>
- Format authoring (for `wiki@1`): <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#7-format-authoring>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
