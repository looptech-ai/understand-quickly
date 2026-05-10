# PR draft — Understand-Anything → understand-quickly

Target repo: [`Lum1104/Understand-Anything`](https://github.com/Lum1104/Understand-Anything)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI / plugin command name (`/understand`, `understand-anything`, etc.) before submitting — the rest of the wording is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge graphs that ships an MCP server and a stable `registry.json` API. Understand-Anything is the **reference implementation** of the `understand-anything@1` format already supported there. Wiring a `--publish` flag closes the loop so any user who runs Understand-Anything can land in the registry with one flag — and AI agents (Claude, Codex, Cursor, anything MCP-aware) can discover and consume their graph immediately.

- **Discoverability.** Every published Understand-Anything graph appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** Graphs stay in the user's repo (`.understand-anything/knowledge-graph.json`); the registry only stores pointers and fetches from `raw.githubusercontent.com`.
- **Agent-consumable.** Schema validation, drift detection (when `metadata.commit` is set), and a turnkey MCP server.

## What changes

- Add a `--publish` flag to the main Understand-Anything CLI / plugin command (the same surface that today writes `.understand-anything/knowledge-graph.json`).
- After the existing graph generation step, when `--publish` is set: fire a `repository_dispatch` event at `looptech-ai/understand-quickly` using a token from `$UNDERSTAND_QUICKLY_TOKEN`.
- Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool_version`, and `metadata.generated_at` in the emitted graph (the `understand-anything@1` schema already declares these fields).
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at the wizard / CLI and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the README under the existing CLI docs.

For users who don't want a flag and just want CI-driven publishing, a one-step **GitHub Action** ([`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action)) ships the same dispatch + metadata stamping. Recommend it in the README as the "set and forget" path; the `--publish` flag stays the right answer for local one-off invocations.

## No-op default

`--publish` is opt-in. Existing users see no change. Even with `--publish`, if `UNDERSTAND_QUICKLY_TOKEN` is unset the tool only writes the local file and prints a single informational line — no network call, no exit-1.

## Token setup

The user adds a fine-grained GitHub PAT to their environment (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

For CI-driven publishing — recommended for most users — drop the [`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action) Marketplace Action into a workflow:

```yaml
- uses: looptech-ai/uq-publish-action@v0.1.0
  with:
    graph-path: '.understand-anything/knowledge-graph.json'
    format: 'understand-anything@1'
    tool-version: ${{ steps.gen.outputs.version }}
    token: ${{ secrets.UNDERSTAND_QUICKLY_TOKEN }}
```

Full template at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation writes `.understand-anything/knowledge-graph.json` exactly as before.
- [ ] `... --publish` with `UNDERSTAND_QUICKLY_TOKEN` unset writes the file and prints an informational message; exit code 0.
- [ ] `... --publish` with the token set and the repo registered fires the dispatch and the registry's `sync.yml` runs within roughly a minute.
- [ ] `... --publish` with the token set but the repo unregistered prints `register it once with: npx understand-quickly-cli add`; exit code 0.
- [ ] Emitted graph contains `metadata.tool == "understand-anything"`, `metadata.tool_version`, `metadata.generated_at`, and `metadata.commit` (40-hex sha).

## Notes for the maintainer

- The registry is in early adoption; this integration is opt-in for early users. If you'd rather wait until adoption grows before merging, that's fine — users can still register manually via the wizard or CLI today.
- Once Understand-Anything has shipped this flag and a few users land in the registry, we can add `Lum1104/Understand-Anything` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md), which auto-merges registry-only PRs from the integration.

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `understand-anything@1` schema: <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/understand-anything@1.json>
- Reusable Action: <https://github.com/looptech-ai/uq-publish-action>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
