## What
<!-- One line: what does this PR change? -->

## Why
<!-- The motivation in 1-3 sentences. Link an issue if relevant. -->

## Type of change
<!-- Check all that apply. -->
- [ ] **Registry entry** — adds or edits a row in `registry.json` for an existing format.
- [ ] **New format** — adds a `schemas/<name>@<int>.json` plus `ok` / `bad` fixtures.
- [ ] **Code / docs / tooling** — changes scripts, MCP, CLI, site, workflows, or docs.

## Checklist
<!-- Skip any that don't apply. -->
- [ ] If this adds a registry entry: the new `id` matches `owner/repo` and is unique.
- [ ] If this adds a schema or fixture: ajv compiles, the `ok` fixture validates, the `bad` fixture fails.
- [ ] `npm test` is green locally.
- [ ] `npm run validate` is green (or the PR explains why a `graph_url` 404s in CI).
- [ ] No third-party CDN added without a pinned version + integrity hash where possible.
- [ ] No backend / always-on LLM dependency introduced — the registry stays a static-pointer service (see [How it works](../blob/main/README.md#how-it-works)).
- [ ] First-time contributor? Include a `Signed-off-by:` line per [DCO](https://developercertificate.org/), or note in the PR that you'd like help adding one.

## For non-technical contributors 👋

If this is your first PR, just fill in **What** and **Why**. A maintainer will help with anything else.
