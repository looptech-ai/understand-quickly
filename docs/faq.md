# FAQ — understand-quickly in plain English

> If you're new here, start with this page. It answers "what is it?" and "should I bother?" without assuming you've used MCP, JSON Schema, or AI agents before.

## What is understand-quickly?

It's a public **directory of code-knowledge graphs** — small JSON files that describe what's in a codebase (files, functions, modules, how they connect).

Think of it like an awesome-list, but instead of listing repos, it lists *map files of repos* that AI assistants can read in one network request.

## Who is this for?

- **Project maintainers** who want their repo to be easier for AI tools to understand.
- **AI agents and IDE plugins** (Claude, Cursor, Codex, custom MCP servers) that need fresh, structured context about a codebase before they can be helpful.
- **Researchers** comparing tools that emit code graphs (Understand-Anything, GitNexus, Repomix, gitingest, etc.).
- **Anyone** who wants a one-click way to point an AI at a real codebase.

## What's a "code-knowledge graph"?

A JSON file that lists the important pieces of a project (files, classes, functions, concepts) and the relationships between them ("file A imports file B", "function X calls function Y"). It's something a generator tool produces from your source code — you don't write it by hand.

If you've heard of [Repomix](https://github.com/yamadashy/repomix) or [gitingest](https://github.com/cyclotruc/gitingest), those produce a similar idea but as packed text rather than a graph; the registry indexes both kinds.

## Do I need to install anything to use the registry?

No. The registry is a public JSON file. Anyone — agent or human — can read it with one fetch:

```
https://looptech-ai.github.io/understand-quickly/registry.json
```

Or browse it visually at <https://looptech-ai.github.io/understand-quickly/>.

## How do I add my project?

Easiest paths, in order of effort:

1. **Wizard** — fill four fields at <https://looptech-ai.github.io/understand-quickly/add.html>; the bot opens the PR.
2. **CLI** — `npx @understand-quickly/cli add` from inside your repo.
3. **Issue** — open the [Add my repo](https://github.com/looptech-ai/understand-quickly/issues/new?template=add-repo.yml) issue template; a maintainer translates it into a PR.
4. **Direct PR** — fork, append an entry to `registry.json`, open a PR. See [`CONTRIBUTING.md`](../CONTRIBUTING.md).

You need a **knowledge graph file in your repo first**. Run any [supported tool](../README.md#supported-formats) — most have a one-line install.

## How long until my repo is indexed?

- **Verified publishers** (allowlisted maintainers): the PR auto-merges within minutes once CI passes.
- **First-time contributors**: 24–48h is typical.
- After the PR merges, the registry's nightly sync (or your instant-refresh workflow) picks up new commits to your graph file.

## Does it cost anything?

No. The registry is free to use, free to be listed in, and there's no premium tier. The infrastructure is GitHub Pages + GitHub Actions; we deliberately have no servers and no LLM costs.

## What can I actually do with the registry?

A few common patterns:

- **From an AI agent (curl):** fetch `registry.json`, pick an entry, fetch its `graph_url`. Now your agent has structured info about that codebase.
- **From Claude / Cursor / Codex:** install our [MCP server](../mcp/README.md). Tools like `find_graph_for_repo`, `get_graph`, and `search_concepts` become available inside your AI assistant.
- **From your own code:** the registry is a stable JSON API; build whatever you want on top.

## Why would I want to be in the registry?

- **Discoverability.** AI agents looking for context about a class of project — Python ML libraries, TypeScript CLIs, Rust web frameworks, whatever — find yours.
- **Free hosting of the metadata.** The graph file stays in your repo; the registry only stores a pointer.
- **Drift detection.** If your graph file falls behind your default branch, the registry surfaces that publicly so consumers know.
- **Zero lock-in.** It's just a JSON entry pointing at a JSON file in your repo. Remove your entry any time.

## What's the difference between the formats (`understand-anything@1`, `gitnexus@1`, `bundle@1`, …)?

Each format is a different shape of knowledge graph, produced by a different tool:

| Format | What it looks like | Best for |
| --- | --- | --- |
| `understand-anything@1` | Code-elements + concepts graph | General code understanding |
| `gitnexus@1` | Git-aware graph with PR-change tracking | Active development workflows |
| `code-review-graph@1` | Files / classes / tests with review hooks | PR review automation |
| `bundle@1` | Pointer to a packed-text repo dump (Repomix, gitingest, codebase-digest) | Whole-repo context for LLMs |
| `generic@1` | Any `{nodes, edges}` graph | Custom tools / fallback |

If you're not sure which to pick, run any of the linked tools — whichever output format matches their tool's name is the right one.

## Is my data private?

The registry is **public** by design. Don't add a private repo or anything you wouldn't post on GitHub. The graph files you point at must be publicly fetchable too.

By submitting an entry, you grant the rights described in [`DATA-LICENSE.md`](../DATA-LICENSE.md). In short: anyone (including AI training pipelines) can use the registry, and the registry maintainers (Alex Macdonald-Smith / LoopTech.AI) get a perpetual right to use submitted data — that grant travels with any fork. If your linked content is on a license that restricts that, please don't submit it.

## I don't write code — can I still help?

Yes. A few non-code ways to contribute:

- **Submit your project** via the wizard or issue form (no PR skills needed).
- **Translate the docs** — open an issue if you want to take a language.
- **Improve this FAQ** — what was confusing when you arrived?
- **Star and share** — adoption is the only real currency for a registry.

## I'm stuck. Where do I get help?

- 💬 [Discussions](https://github.com/looptech-ai/understand-quickly/discussions) — open-ended questions.
- 🐛 [Issues](https://github.com/looptech-ai/understand-quickly/issues) — bugs and feature requests.
- 🛡️ [Security advisories](https://github.com/looptech-ai/understand-quickly/security/advisories/new) — for security reports.

We answer everything; if you don't hear back in a couple of days, ping the issue and we'll bump it.

## Glossary

- **Registry** — the JSON file (`registry.json`) listing all indexed projects.
- **Entry** — one row in the registry, pointing at one project's graph file.
- **Format** — the shape of the graph file (e.g., `understand-anything@1`). Each format has a JSON Schema in `schemas/`.
- **Producer** — a tool that emits a graph in one of the supported formats.
- **Consumer** — anything that reads the registry: an AI agent, an MCP client, a research script.
- **Drift** — when your graph file is behind your default branch (i.e., out of date).
- **MCP** — [Model Context Protocol](https://modelcontextprotocol.io). The way AI assistants like Claude integrate with external tools/data.
- **Verified publisher** — a maintainer whose registry-only PRs auto-merge after CI passes.
