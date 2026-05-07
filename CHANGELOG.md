# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
