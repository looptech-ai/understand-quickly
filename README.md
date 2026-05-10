<div align="center">

# 🧠 understand-quickly

**A public, machine-readable registry of code-knowledge graphs.**

Point AI agents at any indexed repo and they get a current, schema-validated graph — one URL, one fetch.

<!-- Row 1 — repo health -->
[![sync](https://github.com/looptech-ai/understand-quickly/actions/workflows/sync.yml/badge.svg)](https://github.com/looptech-ai/understand-quickly/actions/workflows/sync.yml)
[![pages](https://github.com/looptech-ai/understand-quickly/actions/workflows/pages.yml/badge.svg)](https://looptech-ai.github.io/understand-quickly/)
[![release](https://img.shields.io/github/v/release/looptech-ai/understand-quickly?label=release&sort=semver)](https://github.com/looptech-ai/understand-quickly/releases)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Data License](https://img.shields.io/badge/Data%20License-UQ--Data%201.0-orange.svg)](DATA-LICENSE.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![issues](https://img.shields.io/github/issues/looptech-ai/understand-quickly)](https://github.com/looptech-ai/understand-quickly/issues)
[![last commit](https://img.shields.io/github/last-commit/looptech-ai/understand-quickly)](https://github.com/looptech-ai/understand-quickly/commits/main)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/looptech-ai/understand-quickly/badge)](https://scorecard.dev/viewer/?uri=github.com/looptech-ai/understand-quickly)

<!-- Row 2 — distribution surfaces -->
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-blue)](https://registry.modelcontextprotocol.io)
[![npm CLI](https://img.shields.io/npm/v/@looptech-ai/understand-quickly-cli?label=npm%20cli)](https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli)
[![npm MCP](https://img.shields.io/npm/v/@looptech-ai/understand-quickly-mcp?label=npm%20mcp)](https://www.npmjs.com/package/@looptech-ai/understand-quickly-mcp)
[![PyPI](https://img.shields.io/pypi/v/understand-quickly)](https://pypi.org/project/understand-quickly/)
[![Marketplace](https://img.shields.io/badge/marketplace-uq--publish--action-orange)](https://github.com/marketplace/actions/understand-quickly-publish)
[![npm downloads CLI](https://img.shields.io/npm/dm/@looptech-ai/understand-quickly-cli?label=cli%20dl%2Fmo)](https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli)
[![npm downloads MCP](https://img.shields.io/npm/dm/@looptech-ai/understand-quickly-mcp?label=mcp%20dl%2Fmo)](https://www.npmjs.com/package/@looptech-ai/understand-quickly-mcp)
[![PyPI downloads](https://img.shields.io/pypi/dm/understand-quickly?label=pypi%20dl%2Fmo)](https://pypi.org/project/understand-quickly/)

> **Latest:** **v0.2.0** — CLI `0.1.2`, MCP `0.1.2`, Python SDK `0.1.1`, GH Action `v0.1.0`. Releases automated via [release-please](docs/ops/release-process.md). [CHANGELOG →](CHANGELOG.md)

[**Browse →**](https://looptech-ai.github.io/understand-quickly/) · [**Add your repo (wizard)**](https://looptech-ai.github.io/understand-quickly/add.html) · [**Quickstart**](#quickstart) · [**FAQ (plain English)**](docs/faq.md) · [**Alternatives**](docs/alternatives.md) · [**Badge**](docs/badge.md) · [**Contributing**](CONTRIBUTING.md)

</div>

---

## New here? Read this first 👋

**It's a public directory of "map files" for codebases.** Each entry points at a JSON file (a *knowledge graph* or *context bundle*) that describes a project's structure — files, functions, modules, how they connect — in a shape that AI tools can read in one network request.

If you're a **project maintainer**, you can add your repo so AI assistants can understand it instantly. If you're an **AI agent or tooling developer**, you can fetch any indexed graph by URL with no auth and no SDK.

- **No code required to be listed.** Use the [wizard](https://looptech-ai.github.io/understand-quickly/add.html) — fill four fields, the bot opens the PR.
- **No infrastructure, no costs.** Graphs stay in your repo; we only store pointers.
- **Open and public.** Apache 2.0 code; permissive [Data License](DATA-LICENSE.md) for the registry.

> First time? The [FAQ](docs/faq.md) answers "what is a knowledge graph?", "do I need this?", and "what happens after I submit?" in plain language.

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
- 💻 **CLI:** `npx @looptech-ai/understand-quickly-cli add` — auto-detects everything. ([npm](https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli))
- ✍️ **Manual PR:** see [Add your repo](#add-your-repo) below.

### I want to use it from Claude / Codex / Cursor (MCP)

Three ways, pick whichever your MCP client likes best:

```jsonc
{
  "mcpServers": {
    // 1. Via the MCP Registry — package name; client resolves it.
    "understand-quickly": {
      "package": "io.github.looptech-ai/understand-quickly"
    },

    // 2. Via npm — install once, run the bin.
    //    npm i -g @looptech-ai/understand-quickly-mcp
    "understand-quickly-npm": {
      "command": "understand-quickly-mcp"
    },

    // 3. Via tsx — for hacking on the source in this repo.
    "understand-quickly-dev": {
      "command": "npx",
      "args": ["tsx", "/path/to/understand-quickly/mcp/src/index.ts"]
    }
  }
}
```

Tools: `list_repos`, `get_graph`, `search_concepts`. See [`mcp/README.md`](mcp/README.md).

### I'm a Python developer

```bash
pip install understand-quickly
```

```python
from understand_quickly import Registry
print(Registry().list(status="ok"))
```

See [`python-sdk/README.md`](python-sdk/README.md).

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
| `bundle@1` | repo-context packers ([Repomix](https://github.com/yamadashy/repomix), [gitingest](https://github.com/cyclotruc/gitingest), [codebase-digest](https://github.com/kamilstanuch/codebase-digest), …) | first-class |
| `generic@1` | any `{nodes, edges}` graph | fallback |

Adding a new format: PR `schemas/<name>@<int>.json` + an `ok` and `bad` fixture under `schemas/__fixtures__/<name>/`. Full instructions in [CONTRIBUTING.md](CONTRIBUTING.md).

Upstream tools that produce these formats can integrate via [the integration protocol](docs/integrations/protocol.md). PR templates are in `docs/integrations/`.

### Integrating an upstream tool

Easiest path: drop the [`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action) into your release/build workflow.

```yaml
- uses: looptech-ai/uq-publish-action@v0.1.0
  with:
    graph-path: '.your-tool/graph.json'
    format: 'your-format@1'
    token: ${{ secrets.UNDERSTAND_QUICKLY_TOKEN }}
```

The Action stamps `metadata.{tool, tool_version, generated_at, commit}` into the graph and fires a `repository_dispatch` (`event_type=sync-entry`) at this registry. See [`docs/integrations/protocol.md`](docs/integrations/protocol.md) for the full producer contract.

### Embed an indexed-by badge

Once registered, link a status badge in your repo's README. Lower-case the owner/repo and replace `/` with `--` — for example `looptech-ai/uq-publish-action` becomes `looptech-ai--uq-publish-action`:

```markdown
[![indexed by understand-quickly](https://looptech-ai.github.io/understand-quickly/badges/OWNER--REPO.svg)](https://looptech-ai.github.io/understand-quickly/?entry=OWNER/REPO)
```

The badge auto-updates as your entry's status changes. See [`docs/badge.md`](docs/badge.md) for the full reference.

### Discovery (`.well-known/code-graph`)

Agents can discover this registry's contents without going through `registry.json`:

```bash
curl -fsSL https://looptech-ai.github.io/understand-quickly/.well-known/repos.json
# returns { schema_version, repos: [{id, format, graph_url, last_synced, status, source_sha}] }
```

To make YOUR repo discoverable without registering here, publish a `.well-known/code-graph.json` at the root of your repo. See the [Code-Knowledge-Graph Protocol (CKGP v1) spec](docs/spec/code-graph-protocol.md).

## Distribution

| Channel | Install |
|---|---|
| Pages browser + JSON | <https://looptech-ai.github.io/understand-quickly/> |
| MCP Registry | `io.github.looptech-ai/understand-quickly` (listed in <https://registry.modelcontextprotocol.io>) |
| npm CLI | `npm i -g @looptech-ai/understand-quickly-cli` |
| npm MCP server | `npm i -g @looptech-ai/understand-quickly-mcp` |
| PyPI SDK | `pip install understand-quickly` |
| GitHub Action | `looptech-ai/uq-publish-action@v0.1.0` |

All MIT-or-Apache-2.0 source-licensed. All free to use. The registry data itself is covered by the [Understand-Quickly Data License 1.0](DATA-LICENSE.md).

## Add your repo

The fastest path is the [wizard](https://looptech-ai.github.io/understand-quickly/add.html) or `npx @looptech-ai/understand-quickly-cli add`. The manual flow:

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
| Repo | Format | Description | Status | Last synced |
| --- | --- | --- | :---: | --- |
| [understand-quickly/demo-code-review-graph](https://github.com/understand-quickly/demo-code-review-graph) | `code-review-graph@1` | Demo entry: a sample code-review-graph export covering files, classes, and tests. | ✅ ok | 2026-05-10 |
| [understand-quickly/demo-gitnexus](https://github.com/understand-quickly/demo-gitnexus) | `gitnexus@1` | Demo entry: a sample GitNexus graph modeled on its own codebase. | ✅ ok | 2026-05-10 |
| [understand-quickly/demo-understand-anything](https://github.com/understand-quickly/demo-understand-anything) | `understand-anything@1` | Demo entry: a hand-built sample knowledge graph in the understand-anything@1 shape. | ✅ ok | 2026-05-10 |
<!-- END ENTRIES -->

## Status legend

Each entry's `status` field tells consumers whether the linked graph is currently usable.

| Emoji | Status | Meaning | What to do |
| :---: | --- | --- | --- |
| 🆕 | `pending` | Registered but the registry hasn't synced it yet. | Wait for the next sync (≤24h, or fire `repository_dispatch` for instant). |
| ✅ | `ok` | Fetched, validated, current. | Use it. |
| 🟡 | `missing` | 404 in the last sync. Will keep retrying. | Verify the file exists at the registered URL on the default branch. |
| ⚠️ | `invalid` | Body failed schema validation. | Run `npm run validate` locally; fix the field that fails. |
| 📦 | `oversize` | Graph exceeds 50 MB; not fetched. | Slim the graph or split it. |
| 🔁 | `transient_error` | Network or 5xx; will retry next sync. | Usually nothing — wait one cycle. |
| 💀 | `dead` | 7+ consecutive misses. | Re-publish or open an issue to remove the entry. |
| ↪️ | `renamed` | Superseded by `renamed_to`. | Update tooling to point at the new id. |
| 🚫 | `revoked` | Maintainer-retracted. | Don't consume; contact maintainers if unexpected. |

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

Test suites at HEAD: 132 root + 25 CLI + 27 MCP + 54 Python SDK + 15 Playwright = **253 tests**.

### Releases

Automated via [release-please](https://github.com/googleapis/release-please). Conventional Commits (`feat:` / `fix:`) on `main` → release-please opens a per-component Release PR → merging the PR tags and publishes the affected component (CLI, MCP, Python SDK). See [`docs/ops/release-process.md`](docs/ops/release-process.md) for the full flow, tag prefixes, and rollback recipes.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) walks through every contribution flow. Trusted authors can land registry-only PRs without review — see [`docs/verified-publishers.md`](docs/verified-publishers.md). By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [`SECURITY.md`](SECURITY.md). Security model: see [threat-model](docs/threat-model.md).

For questions, ideas, or showing off your registered graph: [GitHub Discussions](https://github.com/looptech-ai/understand-quickly/discussions).

## Special thanks

To the maintainers who carry this protocol upstream.

### Adopters (merged)

- [`abhigyanpatwari/GitNexus`](https://github.com/abhigyanpatwari/GitNexus) — first project to ship native `gitnexus publish` integration. Thanks to [@magyargergo](https://github.com/magyargergo) for the thorough review and [@abhigyanpatwari](https://github.com/abhigyanpatwari) for the project.

### Integrations in flight

| Project | PR |
|---|---|
| [`tirth8205/code-review-graph`](https://github.com/tirth8205/code-review-graph) | [#449](https://github.com/tirth8205/code-review-graph/pull/449) |
| [`AsyncFuncAI/deepwiki-open`](https://github.com/AsyncFuncAI/deepwiki-open) | [#517](https://github.com/AsyncFuncAI/deepwiki-open/pull/517) |
| [`punkpeye/awesome-mcp-servers`](https://github.com/punkpeye/awesome-mcp-servers) | [#6148](https://github.com/punkpeye/awesome-mcp-servers/pull/6148) |
| [`yamadashy/repomix`](https://github.com/yamadashy/repomix) | [#1563](https://github.com/yamadashy/repomix/pull/1563) |
| [`coderamp-labs/gitingest`](https://github.com/coderamp-labs/gitingest) | [#577](https://github.com/coderamp-labs/gitingest/pull/577) |
| [`kamilstanuch/codebase-digest`](https://github.com/kamilstanuch/codebase-digest) | [#7](https://github.com/kamilstanuch/codebase-digest/pull/7) |
| [`safishamsi/graphify`](https://github.com/safishamsi/graphify) | [#802](https://github.com/safishamsi/graphify/pull/802) |
| [`The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge`](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) | [#185](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge/pull/185) |
| [`DeusData/codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp) | [#332](https://github.com/DeusData/codebase-memory-mcp/pull/332) |
| [`AIDotNet/OpenDeepWiki`](https://github.com/AIDotNet/OpenDeepWiki) | [#361](https://github.com/AIDotNet/OpenDeepWiki/pull/361) |

### Upstream tools we build on

- [Understand-Anything](https://github.com/Lum1104/Understand-Anything) — first-class graph format.
- [GitNexus](https://github.com/abhigyanpatwari/GitNexus) — first-class graph format + first adopter.
- [code-review-graph](https://github.com/tirth8205/code-review-graph) — first-class graph format.
- [vis-network](https://github.com/visjs/vis-network) — graph rendering on the Pages site.
- [Ajv](https://github.com/ajv-validator/ajv) — JSON Schema validation.

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=looptech-ai/understand-quickly&type=Date)](https://www.star-history.com/#looptech-ai/understand-quickly&Date)

## License

- **Code** — [Apache License 2.0](LICENSE) © 2026 Alex Macdonald-Smith and LoopTech.AI. Includes a patent grant and contributor terms.
- **Registry data** — [Understand-Quickly Data License 1.0](DATA-LICENSE.md). Anyone can use the registry, including for AI/ML training; in exchange, contributions and submissions grant Alex Macdonald-Smith and LoopTech.AI a perpetual, sublicensable data-use right that travels with any fork or extension. See [`DATA-LICENSE.md`](DATA-LICENSE.md) for the full terms.
- **NOTICE** file: [`NOTICE`](NOTICE).
