# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Component releases — 2026-05-10

- **`@looptech-ai/understand-quickly-cli@0.1.2`** — Node 18/20 test glob
  expansion fix (`tests/*.test.mjs` now passes on all supported Node
  versions, not just 22+); inherits publish-time version regression guard.
- **`@looptech-ai/understand-quickly-mcp@0.1.2`** — publish-time version
  regression guard via `scripts/check-versions.mjs` (no functional change to
  the MCP server itself); `mcp/server.json` version mirrored for MCP
  Registry consistency.
- **`understand-quickly` (PyPI) @ 0.1.1** — publish workflow now runs
  `scripts/check-versions.mjs` as a regression guard so a `pysdk-vX.Y.Z` tag
  can never publish a wheel whose `pyproject.toml` says a different
  version (no functional change to the SDK itself).

### Added (release automation)

- **`release-please-config.json` + `.release-please-manifest.json` +
  `.github/workflows/release-please.yml`** — `googleapis/release-please-action@v4`
  drives per-component release PRs (`root`, `cli`, `mcp`, `pysdk`) on every
  push to `main`. Merging a release PR creates the matching
  `<component>-v<version>` tag, which fires the existing `publish-*.yml`
  workflows. See [`docs/ops/release-process.md`](docs/ops/release-process.md)
  for the full flow + manual-override fallback.
- **`scripts/check-versions.mjs` + `scripts/__tests__/check-versions.test.mjs`**
  (from #15) — pre-publish regression guard. Wired into `publish-cli`,
  `publish-mcp`, `publish-pysdk` so a malformed semver or a tag/version
  mismatch fails the workflow before anything reaches the registry.

## [0.2.0] — 2026-05-10

Distribution + protocol + producer integrations. Same registry shape (`schema_version: 1`), additive only.

### Added (distribution surface — 4 new packages live)

- **MCP Registry** — `io.github.looptech-ai/understand-quickly` listed at <https://registry.modelcontextprotocol.io>.
- **npm CLI** — `@looptech-ai/understand-quickly-cli` (`npx @looptech-ai/understand-quickly-cli add`).
- **npm MCP server** — `@looptech-ai/understand-quickly-mcp` (bin: `understand-quickly-mcp`).
- **PyPI SDK** — `pip install understand-quickly`.
- **GitHub Action** — `looptech-ai/uq-publish-action@v0.1.0` on the Marketplace.

### Added (protocol)

- **CKGP v1 spec** — RFC-style protocol doc at `docs/spec/code-graph-protocol.md`. Multi-vendor framing.
- **`.well-known/code-graph` discovery** — agents probe a stable URI for graph pointers without going through the registry.
- **`stats.json`** — cross-graph aggregate (totals, kinds, languages, concepts) via `scripts/aggregate.mjs`.
- **MCP tool `find_graph_for_repo`** — agent-ergonomic lookup by GitHub URL.
- **MCP `search_concepts`** — wired to precomputed `stats.json` (no fan-out).

### Added (formats + entry fields)

- New first-class format `bundle@1` for repo-context packers (Repomix, gitingest, codebase-digest).
- Entry fields (all optional, additive): `nodes_count`, `edges_count`, `top_kinds[]`, `languages[]`, `source_sha`, `head_sha`, `commits_behind`, `drift_checked_at`.
- New status `revoked` — maintainer-only retraction; agents must skip.

### Added (producer ecosystem)

- **`looptech-ai/uq-publish-action@v0.1.0`** — drops integration PR diff to ~5 lines of YAML.
- 12 upstream PRs opened across the producer ecosystem (1 merged into GitNexus, 1 closed, 10 awaiting review).
- Producer protocol docs + `_template.md` + 9 ready-to-paste PR drafts under `docs/integrations/`.

### Added (community + marketing)

- **GitHub Discussions** enabled with 5 seed threads (announcement + 2 Q&A + show-and-tell + ideas).
- Marketing pack staged in `docs/marketing/`: tweet thread, Bluesky thread, Reddit drafts, dev.to blog, final Show HN, ranked promotion-target list.
- README polished: 13-badge two-row layout, distribution table, three-way MCP install snippet.

### Added (Pages + UX)

- Vendored `vis-network` locally — no CDN dependency.
- Cloudflare Web Analytics integration (token-gated, free).
- Mobile fixes: topbar stacking, sidebar strip, legend collapse, hide-minimap < 700px, label clipping.
- Desktop tour upgrade: side panel + neighbors + outline + step strip.
- Per-entry SVG status badges + aggregate count badge for upstream README embedding.
- Playwright smoke tests (chromium + webkit) on PR.

### Added (security + supply chain — see prior Unreleased entries from v0.2 follow-ups for full detail)

### Added (v0.2 follow-ups — discoverability + supply chain + producer ergonomics)

- **`scripts/render-sitemap.mjs`** + `npm run sitemap` — generates
  `site/sitemap.xml` with one URL per non-revoked registry entry plus the
  three canonical site pages. Wired into `pages.yml` so each deploy
  refreshes the sitemap. 5 new tests under `scripts/__tests__/render-sitemap.test.mjs`.
- **JSON-LD `Dataset` block + Open Graph / Twitter Card meta tags** on
  `site/index.html` so the registry surfaces in search engine rich-results
  and social-link previews.
- **`site/robots.txt`** declaring full indexability and pointing at the
  sitemap.
- **`site/.well-known/security.txt`** (RFC 9116) directing security
  researchers at GitHub Security Advisories + a contact email, with a
  one-year expiration set.
- **`docs/privacy.md`** — plain-language privacy notice covering Pages
  logs, Cloudflare Web Analytics retention, and the producer-data flow.
- **`docs/alternatives.md`** — frank side-by-side vs. awesome-lists,
  DevDocs, DeepWiki / deepwiki-open / OpenDeepWiki, Sourcegraph, and the
  packer producers (Repomix / gitingest / codebase-digest). Helps readers
  decide when the registry is and isn't the right tool.
- **`docs/badge.md` + `site/badge.svg`** — embeddable "Indexed by
  understand-quickly" badge for producer READMEs, with shields.io,
  self-hosted SVG, and status-aware variants.
- **`scripts/sync.mjs` bounded concurrency** — replaced the serial
  per-entry loop with a fixed-size worker pool (default `SYNC_CONCURRENCY=6`,
  override via env). Concurrent fetches saturate `raw.githubusercontent.com`
  while keeping total open sockets bounded; node 20+ undici keep-alive
  reuses connections for free.
- **`.github/workflows/validate.yml`** — `npm audit --audit-level=high`
  runs after `npm ci` and fails the job on high/critical CVEs. Lower
  severities continue to be handled via Dependabot.
- **README** — `Alternatives` and `Badge` links added to the top
  navigation row.

### Changed (licensing — breaking for downstream re-use semantics)

- **Code license switched from MIT to Apache License 2.0.** Adds an explicit
  patent grant and contributor terms while remaining permissive. Copyright is
  now joint **Alex Macdonald-Smith and LoopTech.AI**. New `NOTICE` file per
  Apache convention.
- **New Data License 1.0** in `DATA-LICENSE.md`. Governs registry data
  (`registry.json`, schemas, aggregates, MCP responses, ingested third-party
  graphs). Grants Users perpetual, sublicensable rights including AI/ML
  training; in exchange, every User and Forker grants Alex Macdonald-Smith
  and LoopTech.AI a perpetual, sublicensable back-grant. Producer
  submissions carry an explicit ingestion grant. The Beneficiary back-grant
  travels with any fork or extension.

### Added (formats and integrations)

- New `bundle@1` format for repo-context packers (Repomix, gitingest,
  codebase-digest). Schema + fixtures + extractor support; bundle source-sha
  sniffing accepts both `manifest.commit` and `metadata.commit` for
  cross-format compatibility.
- 8 new producer-side PR drafts under `docs/integrations/`:
  graphify, codebase-memory-mcp, deepwiki-open (Wave 1, no schema dep);
  repomix, gitingest, codebase-digest, pocketflow-tutorial-codebase-knowledge,
  opendeepwiki (Wave 2, bundle@1 / generic@1).

### Added (security and hardness)

- **MCP**: SSRF guard on graph fetches blocking loopback, RFC1918, link-local
  (incl. AWS/GCP `169.254.169.254`), unique-local IPv6, `*.internal` /
  `*.local`. Schema-version assertion. Stale-cache fallback on registry 5xx.
- **Sync**: atomic registry write (tmp + rename), deterministic id-sort
  before write, wrapped legacy JSON parse, drift errors logged to stderr.
- **Validate**: `CHANGED_IDS` env var validated against owner/repo regex with
  a 1000-entry cap. Ajv `strict: 'log'`. Better validation error context
  with format-specific schema link in the headline.
- **Schemas**: tightened `meta.schema.json` `owner`/`repo` to
  `^[A-Za-z0-9_.-]+$` with a 100-char cap.
- **Aggregator**: per-fetch `AbortController` 30s timeout, `Content-Length`
  pre-check + post-buffer cap at 50MB, label-tokenization cap at 256 chars.
- **Issue parser**: replaced ReDoS-prone regex with O(n) split-based parser;
  200k-char body cap.
- **README rendering**: description sanitization (HTML-escape, strip
  `javascript:` / `data:` / `vbscript:` / `file:` link schemes).
- **Site**: `Content-Security-Policy` `<meta>` headers on `index.html`,
  `add.html`, `about.html` — locks scripts to `'self'` + Cloudflare beacon,
  blocks `frame-ancestors`, restricts `connect-src` to known endpoints.

### Added (efficiency)

- Memoized Ajv compilation + format-schema cache (test suite 4.0s → 2.7s).
- Parallel aggregator fetches via bounded worker pool (concurrency=6) with
  deterministic serial fold.

### Added (UX for non-technical users and producers)

- New plain-English [`docs/faq.md`](docs/faq.md) — "what is this?", "what's a
  knowledge graph?", "what rights am I granting?", glossary.
- New "New here?" section at the top of the README with a one-paragraph
  pitch.
- Status legend expanded with "What to do" column for each status.
- Issue templates: rewritten add-repo form with friendlier copy, `bundle@1`
  added to the format dropdown, plain-language hints per field, "what
  happens next" footer with SLA expectations.
- Issue config: extra contact links (wizard, FAQ, Discussions, security).
- PR template: clearer change-type checklist, explicit DCO note, "for
  non-technical contributors" footer.
- Wizard (`add.html`): "View schema ↗" link next to every format, plain-language
  format hints, expanded FAQ (license rights, SLA, format guide), updated
  footer to Apache 2.0 + Data License 1.0.
- CLI: top-level help shows examples and FAQ link; `add --help` lists
  producer paths and schema folder hints; explicit Node-20-required check
  with a friendly install pointer; error messages link to wizard / FAQ /
  issue tracker.
- Site footer: Apache 2.0 + Data License 1.0 links, FAQ link, direct link
  to `meta.schema.json` (not the `schemas/` directory).

### Added (GitHub repo polish)

- New `CodeQL` workflow scanning JavaScript/TypeScript on push, PRs touching
  scanned source, and weekly. Vendored `site/vendor/` excluded.
- `FUNDING.yml` for GitHub Sponsors.
- Dependabot updated: `/cli` directory now scanned (was missed); dev
  dependencies grouped per ecosystem; `chore(actions|deps|deps-mcp|deps-cli)`
  commit prefixes.

## [0.1.0] — 2026-05-07

First public release.

### Added

- Registry index file (`registry.json`) with JSON Schema validation for entries.
- First-class graph formats: `understand-anything@1`, `gitnexus@1`, `code-review-graph@1`. Fallback format: `generic@1`. Each ships an `ok`/`bad` fixture and a real-sample fixture.
- Three workflows: `validate.yml` (PR check), `sync.yml` (nightly + dispatch + workflow_dispatch), `render.yml` (auto-rendered README table), `pages.yml` (static site deploy), `add-from-issue.yml` (issue-to-PR bot).
- Pages site at <https://looptech-ai.github.io/understand-quickly/> with searchable entry browser, force-directed graph viewer, and an "Add your repo" wizard.
- One-shot CLI: `npx @looptech-ai/understand-quickly-cli add` — autodetects id/format/graph_url from your repo.
- MCP server in `mcp/` exposing `list_repos`, `get_graph`, `search_concepts` over stdio.
- Sharded read-path support (`entries/<a-z>.json`) for scaling beyond a single file.

### Distribution

Four packages went live alongside v0.1.0:

- **MCP Registry** — `io.github.looptech-ai/understand-quickly` listed in <https://registry.modelcontextprotocol.io>.
- **npm CLI** — [`@looptech-ai/understand-quickly-cli`](https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli).
- **npm MCP server** — [`@looptech-ai/understand-quickly-mcp`](https://www.npmjs.com/package/@looptech-ai/understand-quickly-mcp) (bin: `understand-quickly-mcp`).
- **PyPI SDK** — [`understand-quickly`](https://pypi.org/project/understand-quickly/) (`pip install understand-quickly`).
- **GitHub Action** — [`looptech-ai/uq-publish-action@v0.1.0`](https://github.com/marketplace/actions/understand-quickly-publish) on the Marketplace.

[0.1.0]: https://github.com/looptech-ai/understand-quickly/releases/tag/v0.1.0

[0.2.0]: https://github.com/looptech-ai/understand-quickly/releases/tag/v0.2.0
