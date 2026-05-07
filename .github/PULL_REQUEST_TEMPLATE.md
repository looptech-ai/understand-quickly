## What
<!-- one line: what does this PR change? -->

## Why
<!-- the motivation; link an issue if relevant -->

## Checklist
- [ ] If this adds a registry entry, the new `id` matches `owner/repo` and is unique.
- [ ] If this adds a schema or fixture, ajv compiles + the `ok` fixture passes and the `bad` fixture fails.
- [ ] `npm test` is green.
- [ ] `npm run validate` is green (or the PR explains why a `graph_url` 404s in CI).
- [ ] No third-party CDN added without a pinned version.
- [ ] No backend/LLM-on-registry dependency introduced — see [Zero cost](../blob/main/README.md#zero-cost).
