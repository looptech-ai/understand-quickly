<div align="center">

# 🧠 understand-quickly

**A public, machine-readable registry of code-knowledge graphs.**

Point AI agents at any indexed repo and they get a current, schema-validated graph — one URL, one fetch.

[![sync](https://github.com/looptech-ai/understand-quickly/actions/workflows/sync.yml/badge.svg)](https://github.com/looptech-ai/understand-quickly/actions/workflows/sync.yml)
[![pages](https://github.com/looptech-ai/understand-quickly/actions/workflows/pages.yml/badge.svg)](https://looptech-ai.github.io/understand-quickly/)
[![release](https://img.shields.io/github/v/release/looptech-ai/understand-quickly?label=release&sort=semver)](https://github.com/looptech-ai/understand-quickly/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![issues](https://img.shields.io/github/issues/looptech-ai/understand-quickly)](https://github.com/looptech-ai/understand-quickly/issues)
[![last commit](https://img.shields.io/github/last-commit/looptech-ai/understand-quickly)](https://github.com/looptech-ai/understand-quickly/commits/main)

[**Browse →**](https://looptech-ai.github.io/understand-quickly/) · [**Add your repo (wizard)**](https://looptech-ai.github.io/understand-quickly/add.html) · [**Quickstart**](#quickstart) · [**Contributing**](CONTRIBUTING.md)

</div>

---

## Quickstart

### I'm an AI agent / SDK user

```bash
curl -fsSL https://looptech-ai.github.io/understand-quickly/registry.json
```

Pick entries with `status: "ok"`. Fetch `entry.graph_url`. Cache by `last_sha`. That's the whole API.

### I want to register my repo

Pick the path that fits:

- 🖱️ **Wizard:** [Add your repo →](https://looptech-ai.github.io/understand-quickly/add.html). Fills the issue for you; the bot opens the PR.
- 💻 **CLI:** `npx @understand-quickly/cli add` — auto-detects everything.
- ✍️ **Manual PR:** see [Add your repo](#add-your-repo) below.

### I want to use it from Claude / Codex / Cursor (MCP)

```jsonc
{
  "mcpServers": {
    "understand-quickly": {
      "command": "npx",
      "args": ["tsx", "/path/to/understand-quickly/mcp/src/index.ts"]
    }
  }
}
```

Tools: `list_repos`, `get_graph`, `search_concepts`. See [`mcp/README.md`](mcp/README.md).

### I'm a developer / contributor

```bash
git clone https://github.com/looptech-ai/understand-quickly
cd understand-quickly
npm install && npm test
```

Then read [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## How it works

```
                 ┌──────────────────────┐
                 │   looptech-ai/       │
                 │  understand-quickly  │
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

- **Storage:** graphs live in source repos. The registry stores only pointers.
- **Validation:** every PR runs schema checks on `registry.json` and the graph body.
- **Freshness:** nightly sync resyncs every entry; source repos can opt-in to instant refresh via `repository_dispatch`.

## Supported formats

| Format | Source tool | Tier |
| --- | --- | --- |
| `understand-anything@1` | [Understand-Anything](https://github.com/Lum1104/Understand-Anything) | first-class |
| `gitnexus@1` | [GitNexus](https://github.com/abhigyanpatwari/GitNexus) | first-class |
| `code-review-graph@1` | [code-review-graph](https://github.com/tirth8205/code-review-graph) | first-class |
| `generic@1` | any `{nodes, edges}` graph | fallback |

Adding a new format: PR `schemas/<name>@<int>.json` + an `ok` and `bad` fixture under `schemas/__fixtures__/<name>/`. Full instructions in [CONTRIBUTING.md](CONTRIBUTING.md).

## Add your repo

The fastest path is the [wizard](https://looptech-ai.github.io/understand-quickly/add.html) or `npx @understand-quickly/cli add`. The manual flow:

1. Run a [supported tool](#supported-formats) locally and commit its output to your repo.
2. Fork this repo.
3. Append an entry to `registry.json`:

   ```json
   {
     "id": "you/yourrepo",
     "owner": "you",
     "repo": "yourrepo",
     "format": "understand-anything@1",
     "graph_url": "https://raw.githubusercontent.com/you/yourrepo/main/.understand-anything/knowledge-graph.json",
     "description": "one-liner about your project",
     "tags": ["python", "agents"]
   }
   ```

4. Open a PR. Validation runs automatically.

### Optional: instant refresh on push

Drop [`docs/publish-template.yml`](docs/publish-template.yml) into your repo as `.github/workflows/understand-quickly-publish.yml`. Add a fine-grained `UNDERSTAND_QUICKLY_TOKEN` PAT (scoped to `repository_dispatch` on this registry) to your repo secrets. Every push that touches your graph file triggers an immediate registry sync.

## Registry

> Auto-generated. Do not hand-edit between the markers.

<!-- BEGIN ENTRIES -->
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
npm run validate   # validate registry.json + graphs
npm run sync       # resync all entries (writes registry.json)
npm run smoke      # dry-run sync against tests/registry-smoke.json
npm run render     # regenerate README table
```

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) walks through every contribution flow. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [`SECURITY.md`](SECURITY.md).

## License

MIT © 2026 Alex Macdonald-Smith. See [LICENSE](LICENSE).
