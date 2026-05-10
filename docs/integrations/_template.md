# PR draft template — `<TOOL>` → understand-quickly

Copy this file to `<tool>-pr.md`, fill in the `<TOOL>`, `<TOKEN_NAME>`, `<GRAPH_PATH>`, and `<CLI_INVOCATION>` placeholders, then paste into a PR description on the upstream repo.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public, machine-readable registry of code-knowledge graphs. AI agents (Claude, Codex, Cursor via MCP) and human readers point at it to discover graphs and fetch them by URL — `<TOOL>`'s users get all of that for free with one flag and one token.

- **Discoverability.** Every published `<TOOL>` graph appears in the registry with status, schema validation, and drift detection.
- **No infrastructure on our side.** Graphs stay in the user's repo and are fetched from `raw.githubusercontent.com`. The registry only stores pointers.
- **Agent-consumable.** The registry ships with an MCP server and a stable `registry.json`, so a `<TOOL>`-emitted graph becomes addressable by any agent without further work.

## What changes

- Add a `--publish` flag (opt-in) to `<CLI_INVOCATION>`.
- After the existing graph generation step, when `--publish` is set: fire a `repository_dispatch` event at `looptech-ai/understand-quickly` using a token from the `<TOKEN_NAME>` env var (or a CLI-provided override).
- Embed `metadata.commit = $(git rev-parse HEAD)`, `metadata.tool_version`, and `metadata.generated_at` in the emitted graph at `<GRAPH_PATH>` (if not already present) so the registry can do drift detection.
- If the user's repo isn't in the registry yet, surface a one-line message pointing at `npx @understand-quickly/cli add` or the wizard and exit cleanly — don't fail the parent run.
- Document the flag in the README with a one-paragraph "Publishing to understand-quickly" section. The recommended CI snippet is the [`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action) Marketplace Action, which collapses the publish step to ~5 lines of YAML for users.

## No-op default

`--publish` is opt-in. Without the flag, behavior is unchanged. Without `<TOKEN_NAME>` set, `--publish` only writes the local file and prints an informational message — no network call, no failure.

## Token setup

Users add a fine-grained GitHub PAT to the env (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

The drop-in CI workflow uses the [`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action) Marketplace Action:

```yaml
- uses: looptech-ai/uq-publish-action@v0.1.0
  with:
    graph-path: '<GRAPH_PATH>'
    format: '<FORMAT>'
    token: ${{ secrets.<TOKEN_NAME> }}
```

The full template lives at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml). For environments that can't use Marketplace Actions, the raw `gh api` / `curl` dispatch in [protocol §4](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#4-auto-publish-tool-side) is the fallback.

## Test plan

- [ ] `<CLI_INVOCATION> --publish` writes the graph file as before.
- [ ] With `<TOKEN_NAME>` unset, `--publish` prints an informational message and exits 0.
- [ ] With `<TOKEN_NAME>` set and the repo registered, `--publish` fires the dispatch and the registry's `sync.yml` workflow runs within ~minute.
- [ ] With `<TOKEN_NAME>` set but the repo not registered, the message points at `npx @understand-quickly/cli add` and exits 0.
- [ ] `metadata.commit`, `metadata.tool_version`, `metadata.generated_at` are present in the emitted graph.

## Notes for the maintainer

- The registry is in early adoption; this integration is opt-in for early users. Nothing breaks if you don't merge — users can still register manually via the wizard or CLI.
- For a path to auto-merge of registry updates from `<TOOL>`, see the [verified publisher process](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md).

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- Reusable Action: <https://github.com/looptech-ai/uq-publish-action>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
