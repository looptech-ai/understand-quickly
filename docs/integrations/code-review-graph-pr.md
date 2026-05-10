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

- Add `json` to the existing `--format` choices on the `visualize` subcommand. Runs `export_graph_data()` (the same dict the other formats are built from) and writes it to `<data_dir>/graph.json` (i.e. `.code-review-graph/graph.json`).
- Add a `--publish-to-uq` flag on `visualize`. Implies `--format json`. After the JSON is written, fires a `repository_dispatch` (`event_type=sync-entry`) at `looptech-ai/understand-quickly` so the registry resyncs the entry. Owner/repo is derived from `git remote get-url origin`.
- Embed `metadata.tool`, `metadata.tool_version`, `metadata.generated_at`, and (when in a git checkout) `metadata.commit = $(git rev-parse HEAD)` on the exported dict alongside the existing `nodes`, `edges`, `stats`, `flows`, `communities` fields.
- Add a one-line README mention next to the existing `--format` examples.
- Self-contained in a new `code_review_graph/publish.py` module; the `visualize` handler delegates to it. Stdlib only (`urllib.request`) — no new dependencies.

For users who don't want a flag and just want CI-driven publishing, a one-step **GitHub Action** ([`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action)) ships the same dispatch + metadata stamping. Recommend it in the README as the "set and forget" path; the `--publish-to-uq` flag stays the right answer for local one-off invocations.

## No-op default

`--publish-to-uq` is opt-in. Existing `visualize` invocations are unaffected. With the flag set but `UNDERSTAND_QUICKLY_TOKEN` unset, the tool writes the local artifact as usual and prints one informational line — no network call, no exit-1.

## Token setup

The user adds a fine-grained GitHub PAT to their environment (or repo secrets, when run from CI):

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

For CI-driven publishing — recommended for most users — drop the [`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action) Marketplace Action into a workflow:

```yaml
- uses: looptech-ai/uq-publish-action@v0.1.0
  with:
    graph-path: '.code-review-graph/graph.json'
    format: 'code-review-graph@1'
    tool-version: ${{ steps.gen.outputs.version }}
    token: ${{ secrets.UNDERSTAND_QUICKLY_TOKEN }}
```

Full template at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

Unit tests added in `tests/test_publish.py` cover:

- [x] `visualize` without the flag (default `--format html`) is unchanged — the existing `tests/test_visualization.py` suite still passes (1245 passed, 1 skipped, 2 xpassed locally).
- [x] `build_publish_payload()` embeds `metadata.tool == "code-review-graph"`, `metadata.tool_version`, and an ISO-8601 `metadata.generated_at`. `metadata.commit` is a 40-hex sha when present.
- [x] `--publish-to-uq` with `UNDERSTAND_QUICKLY_TOKEN` unset writes the JSON and prints `UNDERSTAND_QUICKLY_TOKEN not set; skipping repository_dispatch` — `urlopen` is never called.
- [x] `--publish-to-uq` with the token set fires a single POST to `https://api.github.com/repos/looptech-ai/understand-quickly/dispatches` with body `{"event_type":"sync-entry","client_payload":{"id":"<owner>/<repo>"}}` and an `Authorization: Bearer ...` header (mocked `urlopen`).
- [x] HTTPError from the dispatch (e.g. unregistered repo, 422) is soft-failed: the run still writes the JSON, prints `dispatch failed ... npx @understand-quickly/cli add`, and exits 0.
- [x] `git remote get-url origin` parsing handles both `https://github.com/owner/repo(.git)` and `git@github.com:owner/repo(.git)` shapes.

Manual smoke (run by maintainer if desired): `code-review-graph build && code-review-graph visualize --format json` writes `.code-review-graph/graph.json`; opening the file shows `metadata.commit` matching `git rev-parse HEAD`.

## Notes for the maintainer

- The registry is in early adoption; this is opt-in for early users. Nothing in code-review-graph's existing surface needs to break.
- Once code-review-graph has shipped this and a few users land in the registry, we can add `tirth8205/code-review-graph` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates.

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `code-review-graph@1` schema: <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/code-review-graph@1.json>
- Reusable Action: <https://github.com/looptech-ai/uq-publish-action>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
