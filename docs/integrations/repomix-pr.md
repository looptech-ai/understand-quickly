# PR draft — Repomix → understand-quickly

Target repo: [`yamadashy/repomix`](https://github.com/yamadashy/repomix)

Paste the body below into the PR description on that repo. The author should confirm the exact CLI flag conventions (`repomix --output`, `repomix --style xml`, etc.) and the path Repomix users typically commit (`.repomix/repomix-output.xml` is the modern default; older configs commit at the repo root). The rest is repo-agnostic.

---

## Title

`Add --publish flag for understand-quickly registry integration`

## Why

[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) is a public registry of code-knowledge **and** code-context artifacts that ships an MCP server and a stable `registry.json` API. Repomix is the most popular repo-context packer in the AI-dev ecosystem; the registry's [`bundle@1`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json) format was designed specifically to index Repomix-style outputs without flattening their structure.

Wiring a `--publish` flag means any user who runs Repomix can land in the registry with one flag, and AI agents (Claude, Codex, Cursor via MCP) can resolve a repo URL to its packed-context bundle through the registry's `find_graph_for_repo` tool — no ad-hoc URL-sharing required.

- **Discoverability.** Every published Repomix bundle appears at <https://looptech-ai.github.io/understand-quickly/>.
- **No infrastructure on our side.** The XML/markdown body stays in the user's repo (`.repomix/repomix-output.xml`); the registry only stores a small JSON pointer (`bundle@1` manifest) plus the raw `content_url`.
- **Agent-consumable.** MCP clients can fetch the bundle via the registry without each user pointing at a private endpoint.

## What changes

- Add a `--publish` flag (or equivalent — `--register`, `--publish-to-uq`) to the Repomix CLI. Behavior is gated on the flag being set.
- After the existing pack step, when `--publish` is set:
  1. Write a small JSON sidecar at `.repomix/repomix.bundle.json` that conforms to the registry's [`bundle@1`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json) schema. The sidecar carries `manifest.tool = "repomix"`, `tool_version`, `generated_at`, `commit`, `file_count`, `byte_count`, `token_estimate`, `format`, and `content_url` pointing at the existing packed body in the same repo (e.g. `https://raw.githubusercontent.com/$OWNER/$REPO/main/.repomix/repomix-output.xml`).
  2. If `$UNDERSTAND_QUICKLY_TOKEN` is set, fire a `repository_dispatch` event at `looptech-ai/understand-quickly`. Otherwise, just write the sidecar and exit cleanly.
- If the user's repo isn't yet in the registry, print a friendly one-liner pointing at `npx @looptech-ai/understand-quickly-cli add` or the wizard and exit cleanly — don't fail the parent run.
- Add a "Publishing to understand-quickly" paragraph to the Repomix README.

## Why a sidecar instead of mutating the existing output

Repomix's primary output is a packed text body (XML / markdown / plaintext). The registry indexes a small JSON manifest (the `bundle@1` shape), not the body itself. Keeping these as two separate files means:

- Existing Repomix users see no change to their packed output.
- The registry can fetch the small sidecar fast, validate, and then optionally stream the larger body via `content_url`.
- Future revisions of the bundle schema don't require Repomix users to regenerate their packed body.

A reference fixture lives at [`schemas/__fixtures__/bundle/real-sample.json`](https://github.com/looptech-ai/understand-quickly/blob/main/schemas/__fixtures__/bundle/real-sample.json) — modeled directly on Repomix's output structure.

## No-op default

`--publish` is opt-in. Existing users see no change. With `--publish` but no `UNDERSTAND_QUICKLY_TOKEN`, Repomix writes the sidecar locally and prints one informational line — no network call, no exit-1.

## Token setup

Fine-grained GitHub PAT, single permission:

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Repository dispatches: write`. Nothing else.

Drop-in workflow at [`docs/integrations/sample-publish-workflow.yml`](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml).

## Test plan

- [ ] Default invocation produces the same packed body as before — no sidecar.
- [ ] `repomix --publish` writes both the packed body AND `.repomix/repomix.bundle.json`.
- [ ] The sidecar validates against `schemas/bundle@1.json` (run the registry's `npm test` against the fixture).
- [ ] With `UNDERSTAND_QUICKLY_TOKEN` set and the repo registered, `--publish` fires the dispatch.
- [ ] With the token set but the repo unregistered, prints the registration hint; exit code 0.
- [ ] `manifest.commit` is the 40-hex `git rev-parse HEAD`; `manifest.tool == "repomix"`.

## Notes for the maintainer

- This is opt-in for early adopters; nothing in Repomix's existing CLI surface needs to break.
- Once Repomix has shipped this and a few users land in the registry, we can add `yamadashy/repomix` to the [verified-publisher allowlist](https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md) for auto-merge of registry updates from the integration.

- **What this means licensing-wise for your users.** Submitting via `--publish` is governed by the [Understand-Quickly Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md) — see [protocol §10](https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md#10-licensing-of-submitted-data). It is opt-in, gated on the user setting `UNDERSTAND_QUICKLY_TOKEN`; consider mirroring this paragraph in your own `--publish` documentation so users know what they are consenting to.

## Links

- Registry: <https://github.com/looptech-ai/understand-quickly>
- Integration protocol: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/protocol.md>
- `bundle@1` schema: <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/bundle@1.json>
- `bundle@1` real-world fixture (modeled on Repomix): <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/__fixtures__/bundle/real-sample.json>
- Sample workflow: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/integrations/sample-publish-workflow.yml>
- Verified publishers: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/verified-publishers.md>
