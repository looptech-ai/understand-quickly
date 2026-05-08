# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- One-shot CLI: `npx @understand-quickly/cli add` — autodetects id/format/graph_url from your repo.
- MCP server in `mcp/` exposing `list_repos`, `get_graph`, `search_concepts` over stdio.
- Sharded read-path support (`entries/<a-z>.json`) for scaling beyond a single file.

[0.1.0]: https://github.com/looptech-ai/understand-quickly/releases/tag/v0.1.0
