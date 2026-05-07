<div align="center">

# 🧠 understand-quickly

**A public, machine-readable registry of code-knowledge graphs.**

Point AI agents at any indexed repo and they get a current, schema-validated graph — no scraping, no LLM cost on the registry side.

[![sync](https://github.com/amacsmith/understand-quickly/actions/workflows/sync.yml/badge.svg)](https://github.com/amacsmith/understand-quickly/actions/workflows/sync.yml)
[![pages](https://github.com/amacsmith/understand-quickly/actions/workflows/pages.yml/badge.svg)](https://amacsmith.github.io/understand-quickly/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Status:** private MVP under [`amacsmith/understand-quickly`](https://github.com/amacsmith/understand-quickly). Will move to a public org once core flows are battle-tested. Live registry at <https://amacsmith.github.io/understand-quickly/>.

[**Browse the registry →**](https://amacsmith.github.io/understand-quickly/) · [**Add your repo**](#add-your-repo) · [**Agent quickstart**](#agent-quickstart) · [**Design spec**](docs/superpowers/specs/2026-05-07-understand-quickly-registry-design.md)

</div>

---

## Why

Tools like [Understand-Anything](https://github.com/Lum1104/Understand-Anything), [GitNexus](https://github.com/abhigyanpatwari/GitNexus), and [code-review-graph](https://github.com/tirth8205/code-review-graph) turn a codebase into a queryable knowledge graph. The graph is JSON. Today there is no shared, current, machine-readable index of which public repos publish one.

`understand-quickly` is that index. One repo, one `registry.json`, three workflows. No backend.

## How it works

```
                 ┌──────────────────────┐
                 │ understand-quickly/  │
                 │      registry        │
                 │                      │
                 │  registry.json       │ ← canonical pointers
                 │  schemas/            │ ← per-format JSON Schemas
                 │  README.md           │ ← auto-rendered table
                 └────────┬─────────────┘
            PR / dispatch │ raw.githubusercontent.com
                          │
        ┌─────────────────┴───────────────────┐
        ▼                                     ▼
┌──────────────────┐                  ┌─────────────────────┐
│ Source repo with │                  │ AI agent / MCP /    │
│ knowledge graph  │                  │ human reader        │
└──────────────────┘                  └─────────────────────┘
```

- **Storage:** graphs live in their source repos. We store only pointers.
- **Validation:** every PR runs schema checks on `registry.json` and the graph body.
- **Freshness:** nightly cron resyncs every entry; source repos can opt-in to instant refresh via `repository_dispatch`.
- **Cost:** zero. GitHub Actions only.

## Agent quickstart

```bash
curl -fsSL https://amacsmith.github.io/understand-quickly/registry.json
```

Each entry that an agent should trust:

```jsonc
{
  "id": "Lum1104/Understand-Anything",
  "format": "understand-anything@1",
  "graph_url": "https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/.understand-anything/knowledge-graph.json",
  "status": "ok",       // ← only consume entries with status "ok"
  "last_sha": "…",      // ← cache key
  "last_synced": "…"    // ← if older than 7d, fetch graph_url directly
}
```

Schemas: [`schemas/`](./schemas/). Each `format` value (e.g. `understand-anything@1`) maps to `schemas/<format>.json`.

## Add your repo

1. Run [Understand-Anything](https://github.com/Lum1104/Understand-Anything) (or any supported tool) locally; commit `.understand-anything/knowledge-graph.json` to your repo.
2. Fork this repo.
3. Append an entry to `registry.json`:
   ```json
   {
     "id": "yourname/yourrepo",
     "owner": "yourname",
     "repo": "yourrepo",
     "format": "understand-anything@1",
     "graph_url": "https://raw.githubusercontent.com/yourname/yourrepo/main/.understand-anything/knowledge-graph.json",
     "description": "one-liner about your project",
     "tags": ["python", "agents"]
   }
   ```
4. Open a PR. The `validate` check will fetch your graph and verify the format. Maintainer reviews + merges.

### Optional: instant refresh on push

Drop [`docs/publish-template.yml`](./docs/publish-template.yml) into your repo as `.github/workflows/understand-quickly-publish.yml`. Add `UNDERSTAND_QUICKLY_TOKEN` (a fine-grained PAT scoped to `repository_dispatch` on this registry) to your repo secrets. From then on, every push that touches your graph file triggers an immediate registry sync.

## Supported formats

| Format | Source tool | Status |
| --- | --- | --- |
| `understand-anything@1` | [Understand-Anything](https://github.com/Lum1104/Understand-Anything) | first-class |
| `gitnexus@1` | [GitNexus](https://github.com/abhigyanpatwari/GitNexus) | parity |
| `generic@1` | any `{nodes, edges}` graph | escape hatch |

Adding a new format = PR `schemas/<name>@<int>.json` + an `ok` and `bad` fixture under `schemas/__fixtures__/<name>/`.

## Registry

> Auto-generated. Do not hand-edit between the markers.

<!-- BEGIN ENTRIES -->
| Repo | Format | Description | Status | Last synced |
| --- | --- | --- | :---: | --- |
<!-- END ENTRIES -->

## Status legend

| Emoji | Status | Meaning |
| :---: | --- | --- |
| 🆕 | `pending` | registered but not yet synced |
| ✅ | `ok` | fetched, validated, current |
| 🟡 | `missing` | 404 in last sync (will retry) |
| ⚠️ | `invalid` | body failed schema validation |
| 📦 | `oversize` | graph > 50 MB; not fetched |
| 🔁 | `transient_error` | network / 5xx; retried |
| 💀 | `dead` | 7+ consecutive misses |
| ↪️ | `renamed` | superseded by `renamed_to` |

## Development

```bash
nvm use            # Node 20
npm install
npm test           # node:test
npm run test:coverage
npm run validate   # validate registry.json + (optionally) all graphs
npm run sync       # resync all entries (writes registry.json)
npm run smoke      # dry-run sync against tests/registry-smoke.json
npm run render     # regenerate README table
```

## Roadmap

- [ ] Thin MCP server wrapping `registry.json` (separate repo).
- [ ] Static GitHub Pages browser with embedded graph viewer.
- [ ] `entries/<a-z>.json` shard split when index passes 1k entries.
- [ ] Per-entry semantic search.

## License

MIT © 2026 Mac Macdonald-Smith. See [LICENSE](LICENSE).
