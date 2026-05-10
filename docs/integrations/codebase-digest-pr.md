# PR draft — codebase-digest → understand-quickly

Target repo: [`kamilstanuch/codebase-digest`](https://github.com/kamilstanuch/codebase-digest)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI invocation (`codebase-digest`, `python -m codebase_digest`, etc.) and the conventional output filename (this draft assumes `codebase-digest.txt` for the body and a sidecar `.codebase-digest/digest.bundle.json` for the registry pointer). The rest is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge **and** code-context artifacts that ships an MCP server and a stable `registry.json` API. codebase-digest is a top-of-mind packer + analyzer in the AI-dev ecosystem; the registry's [`bundle@1`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json) format indexes its digest output natively and surfaces its analyzer metrics (`file_count`, `byte_count`, `token_estimate`) in the registry table.

Wiring a `--publish` flag means any user who runs codebase-digest can land in the registry with one flag, and AI agents (Claude, Codex, Cursor via MCP) can resolve a repo URL to its digest via the registry's `find_graph_for_repo` tool — with the analyzer metrics already populated in the registry entry.

- **Discoverability.** Every published digest appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** The plaintext digest stays in the user's repo; the registry only stores a small JSON pointer (`bundle@1` manifest).
- **Agent-consumable.** MCP clients fetch the digest through the registry without each user maintaining a private mapping.

## What changes

- Add a `--publish` flag (or equivalent — `--register`, `--publish-to-uq`) to the codebase-digest CLI.
- After the existing digest + analysis step, when `--publish` is set:
  1. Write a small JSON sidecar at `.codebase-digest/digest.bundle.json` that conforms to the registry's [`bundle@1`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json) schema. The sidecar carries `manifest.tool = "codebase-digest"`, `tool_version`, `generated_at`, `commit`, `file_count`, `byte_count`, `token_estimate`, `format = "plaintext"`, and `content_url` pointing at the existing digest in the same repo. The analyzer metrics codebase-digest already computes map directly onto these fields.
  2. If `$UNDERSTAND_QUICKLY_TOKEN` is set, fire a `repository_dispatch` event at `looptech-ai/understand-quickly`. Otherwise, write the sidecar locally and exit cleanly.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx understand-quickly-cli add` or the wizard and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the codebase-digest README.

## Why a sidecar

The registry indexes a small JSON manifest (the `bundle@1` shape), not the digest body. Two files keeps the existing digest output unchanged, lets the registry fetch quickly + validate, and decouples body churn from manifest churn. A reference fixture lives at [`schemas/__fixtures__/bundle/real-sample.json`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/__fixtures__/bundle/real-sample.json).

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, codebase-digest writes the sidecar and prints one informational line — no network call, no exit-1.

## Token setup

Fine-grained GitHub PAT, single permission:

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

Drop-in workflow at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation produces the same digest as before — no sidecar.
- [ ] `codebase-digest --publish` writes both the digest AND `.codebase-digest/digest.bundle.json`.
- [ ] The sidecar validates against `schemas/bundle@1.json`.
- [ ] With `UNDERSTAND_QUICKLY_TOKEN` set and the repo registered, `--publish` fires the dispatch.
- [ ] With the token set but the repo unregistered, prints the registration hint; exit code 0.
- [ ] `manifest.commit` is the 40-hex `git rev-parse HEAD`; `manifest.tool == "codebase-digest"`; `manifest.format == "plaintext"`; analyzer metrics populated.

## Notes for the maintainer

- This is opt-in for early adopters; nothing in codebase-digest's existing surface needs to break.
- Once codebase-digest has shipped this and a few users land in the registry, we can add `kamilstanuch/codebase-digest` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge.

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `bundle@1` schema: <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
