# Alternatives & related tools

A frank comparison so you can pick the right shape for your problem.
The registry's not always the answer; this page tells you when it is.

## TL;DR

| Use case | Reach for |
| --- | --- |
| "I want my repo to be one fetch away from any AI agent" | **understand-quickly** |
| "I want to read library docs in a single offline app" | [DevDocs](https://devdocs.io/) |
| "I want a generated wiki for my codebase" | [DeepWiki](https://deepwiki.com/), [deepwiki-open](https://github.com/AsyncFuncAI/deepwiki-open), or [OpenDeepWiki](https://github.com/AIDotNet/OpenDeepWiki) |
| "I want to pack a repo into one text file for an LLM prompt" | [Repomix](https://github.com/yamadashy/repomix) or [gitingest](https://github.com/cyclotruc/gitingest) |
| "I want code search across many repos with semantic understanding" | [Sourcegraph](https://sourcegraph.com/), [Cody](https://sourcegraph.com/cody) |
| "I want a curated awesome-list of tools" | A traditional `awesome-*` repo |
| "I want a knowledge graph of my codebase" | [Understand-Anything](https://github.com/Lum1104/Understand-Anything), [GitNexus](https://github.com/abhigyanpatwari/GitNexus), [code-review-graph](https://github.com/tirth8205/code-review-graph), [graphify](https://github.com/safishamsi/graphify) |

## Side-by-side

| | understand-quickly | awesome-lists | DevDocs | DeepWiki | Sourcegraph | Repomix |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Indexed unit** | repo + graph file | repo link | doc set | per-repo wiki | code text | one repo packed |
| **Output for AI agents** | structured JSON via `graph_url` | none | none | rendered HTML | API + embeddings | packed text dump |
| **Schema-validated** | yes (JSON Schema) | no | no | no | no | yes (`bundle@1` if registered) |
| **Drift detection** | yes (`source_sha` vs `head_sha`) | no | manual | no | continuous | no |
| **MCP server** | yes | no | no | no | yes (paid) | no |
| **Hosting cost (yours)** | $0 (graph in your repo) | $0 | $0 | depends | paid | $0 |
| **Hosting cost (registry)** | $0 (Pages + Actions) | $0 | $0 | hosted SaaS | hosted SaaS | $0 |
| **Producer integration** | one `repository_dispatch` flag | manual PR | manual upstream | hosted | indexer | one CLI flag |
| **Coverage today** | 3 demo entries + Wave 1/2 in flight | thousands per topic | hundreds of doc sets | hundreds | millions | N/A (per-repo) |
| **License** | Apache 2.0 + Data License 1.0 | varies (mostly CC0/MIT) | MPL-2.0 | proprietary SaaS | mixed | MIT |

## Why understand-quickly exists alongside these

- **vs. awesome-lists.** Same discoverability shape, but the unit is a
  *machine-readable graph* rather than a human-readable link. An AI agent
  can `fetch(entry.graph_url)` and reason about a project's structure
  without scraping.
- **vs. DevDocs.** DevDocs ships rendered docs; `understand-quickly`
  ships structured pointers. Complementary — an agent might use
  DevDocs for narrative API docs and `understand-quickly` for the
  per-codebase graph.
- **vs. DeepWiki / deepwiki-open / OpenDeepWiki.** Those generate
  *narrative* per-codebase wikis. The registry indexes their *output* so
  an agent can discover that, e.g., "deepwiki has a wiki for repo X."
  We're hoping these tools register through our [integration protocol](./integrations/protocol.md).
- **vs. Sourcegraph / Cody.** Sourcegraph is a paid platform with deep
  semantic search across crawled repos. The registry is the opposite end:
  free, decentralized, and explicit (only what producers register).
- **vs. Repomix / gitingest / codebase-digest.** These are *producers*
  for the registry's `bundle@1` format. They're not alternatives — once
  they ship the [`--publish` flag](./integrations/protocol.md), users
  who run them auto-land in our index.
- **vs. Understand-Anything / GitNexus / code-review-graph.** Same:
  they're first-class producers. Each has a dedicated `*@1` format.

## When NOT to use understand-quickly

- You need a **rendered narrative** (use DeepWiki / OpenDeepWiki).
- You need **semantic search across millions of repos** (use Sourcegraph).
- Your repo is **private** (the registry is public-only by design).
- Your knowledge artifact **is not JSON** (we accept text bundles via
  `bundle@1`, but a pure binary export needs a producer to wrap it).

## Adoption signal so far

The registry is **early** (v0.1.x). Expect rough edges; the trade-off is
you can shape the protocol while it's still small. Producer adoption is
the gating factor — see the [Wave 1 / Wave 2 integration drafts](./integrations/)
and [verified-publishers process](./verified-publishers.md).

---

Anything missing? PR a row to the table or open a discussion.
