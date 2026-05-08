# PR draft — gitingest → understand-quickly

Target repo: [`cyclotruc/gitingest`](https://github.com/cyclotruc/gitingest)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI surface (`gitingest`, `python -m gitingest`, the web UI export path) and the conventional output filename (this draft assumes `digest.md` for the body and a sidecar `.gitingest/digest.bundle.json` for the registry pointer). The rest is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge **and** code-context artifacts that ships an MCP server and a stable `registry.json` API. gitingest is one of the most-used "pack a repo into context" tools; the registry's [`bundle@1`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json) format was designed exactly to index gitingest-style outputs.

Wiring a `--publish` flag means any user who runs gitingest can land in the registry with one flag, and AI agents (Claude, Codex, Cursor via MCP) can resolve a repo URL to its packed-context digest via the registry's `find_graph_for_repo` tool.

- **Discoverability.** Every published gitingest digest appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** The markdown digest stays in the user's repo; the registry only stores a small JSON pointer (`bundle@1` manifest) plus the `content_url`.
- **Agent-consumable.** MCP clients can fetch the digest through the registry without each user maintaining a private mapping.

## What changes

- Add a `--publish` flag (or equivalent — `--register`, `--publish-to-uq`) to the gitingest CLI / web export.
- After the existing digest step, when `--publish` is set:
  1. Write a small JSON sidecar at `.gitingest/digest.bundle.json` that conforms to the registry's [`bundle@1`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json) schema. The sidecar carries `manifest.tool = "gitingest"`, `tool_version`, `generated_at`, `commit`, `file_count`, `byte_count`, `token_estimate`, `format = "markdown"`, and `content_url` pointing at the existing markdown digest in the same repo (e.g. `https://raw.githubusercontent.com/$OWNER/$REPO/main/digest.md`).
  2. If `$UNDERSTAND_QUICKLY_TOKEN` is set, fire a `repository_dispatch` event at `looptech-ai/understand-quickly`. Otherwise, write the sidecar locally and exit cleanly.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx @understand-quickly/cli add` or the wizard and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the gitingest README.

## Why a sidecar

The registry indexes a small JSON manifest (the `bundle@1` shape), not the markdown digest itself. Keeping these as two files means:

- Existing gitingest users see no change to their digest output.
- The registry fetches a small sidecar quickly, validates schema, and then optionally streams the larger body via `content_url`.
- Future bundle schema revisions don't require regenerating the digest.

A reference fixture lives at [`schemas/__fixtures__/bundle/real-sample.json`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/__fixtures__/bundle/real-sample.json).

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, gitingest writes the sidecar and prints one informational line — no network call, no exit-1.

## Token setup

Fine-grained GitHub PAT, single permission:

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

Drop-in workflow at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation produces the same digest as before — no sidecar.
- [ ] `gitingest --publish` writes both the digest AND `.gitingest/digest.bundle.json`.
- [ ] The sidecar validates against `schemas/bundle@1.json`.
- [ ] With `UNDERSTAND_QUICKLY_TOKEN` set and the repo registered, `--publish` fires the dispatch.
- [ ] With the token set but the repo unregistered, prints the registration hint; exit code 0.
- [ ] `manifest.commit` is the 40-hex `git rev-parse HEAD`; `manifest.tool == "gitingest"`; `manifest.format == "markdown"`.

## Notes for the maintainer

- This is opt-in for early adopters; nothing in gitingest's existing surface needs to break.
- Once gitingest has shipped this and a few users land in the registry, we can add `cyclotruc/gitingest` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates from the integration.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `bundle@1` schema: <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
