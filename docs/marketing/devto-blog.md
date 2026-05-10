# Awesome-list 2.0: a public registry of code-knowledge graphs for AI agents

> **Tags:** `#opensource #aiagents #mcp #devtools`
>
> **Canonical URL:** `https://github.com/looptech-ai/understand-quickly`
> (set this in dev.to's "Canonical URL" field so the post doesn't compete
> with the repo for SEO).
>
> **Cover image:** none for the first cut. dev.to renders fine without
> one.

---

## The problem nobody talks about

Every AI coding assistant — Cursor, Claude Code, Codex CLI, Continue,
Cody, the local-LLaMA crowd, the Roo Code / Cline / aider tribes —
re-extracts the same structural information from the same public repos
on every cold start. AST parses, dependency graphs, module summaries,
top-level concept lists. Each assistant does it slightly differently,
each pays the latency tax independently, and none of them share the
output with each other.

That's wasted compute at the eco-system level, and worse, it means a
weekend project that already invested a few minutes building a
careful graph of `kubernetes/kubernetes` has nowhere to publish that
work where another agent can pick it up.

The framing I want to land in this post: **awesome-lists worked because
git was the database and pull requests were the curation step. The
exact same pattern works for content — not just lists of links — and
nobody has shipped it for AI-readable structural data yet.**

We did. It's called `understand-quickly`. This is what we built, why
the awesome-list pattern is the right shape for it, and how you can
either use it (as an agent author) or contribute to it (as a producer
or curator).

## Why awesome-lists worked

Sindre Sorhus's `awesome` repository, and the thousands of `awesome-X`
repositories it spawned, succeeded at something genuinely hard: they
maintained a high-signal index of an entire field, kept it current
across years, and did it with literally zero infrastructure. No
servers. No moderation team paid for. No feature roadmap. No CMS.

The trick is that the substrate — git — was already free and already
solved the hard parts of multi-author collaboration. Pull requests are
the curation step. CI is the spam filter. Forks are the migration
strategy. The only thing the maintainer has to do is review, and even
that is mostly mechanical.

The thing the awesome-list pattern doesn't naturally do, though, is
host **content with shape**. A list of URLs is a list of URLs. If the
substrate of your registry has structure — if every entry is a
schema-bearing JSON document with constraints, and the consumer of
the registry needs to validate that shape — the plain-Markdown list
breaks down. You need:

1. A schema (or several), versioned, published.
2. A validator that rejects bad PRs at CI time.
3. A way to keep entries fresh after they're merged (links rot, but
   *content* rots faster).
4. A status taxonomy so consumers can skip entries that have gone
   stale.

That's the four-piece toolkit the registry adds. Everything else is
still git, PRs, and CI.

## The four building blocks

### 1. Schema validation

Each entry in the registry points at a JSON document conforming to one
of a few first-class formats — `understand-anything@1`, `gitnexus@1`,
`code-review-graph@1`, `bundle@1` (a normalized envelope around the
output of repo-context packers like Repomix, gitingest, codebase-
digest). Each format's JSON Schema lives in the repo. CI rejects PRs
whose entry points at a graph that doesn't validate against the
declared format.

The interesting choice here is **format pluralism**: we host multiple
schemas behind a `format` discriminator instead of picking one and
dictating it. That decision will draw fire from people who think
standards bodies should pick winners. We made it deliberately. Most
producers already have an opinionated output format and aren't going
to switch; meeting them where they are is how you actually get
producer adoption.

### 2. Sync

A nightly GitHub Action recomputes per-entry `status`, `last_sha`,
`size_bytes`, `nodes_count`, `edges_count`, and a `top_kinds`
summary. Producers can also fire a `repository_dispatch` event from
their own CI to refresh their entry instantly after a new graph
publish. The aggregator's only job, at the steady state, is "fetch
the producer's pointer, hash it, update the index." Nothing
exotic.

### 3. Drift detection

Every entry's `last_sha` is checked against the source repository's
HEAD nightly. Entries where the producer's graph is more than N
commits behind get flipped to `stale` in the registry's `status`
field. Consumers can choose to skip stale entries, or fall back to
re-extraction for those specific repos.

This isn't perfect — drift detection is HEAD-only today, not
content-aware — but it's good enough to keep the registry honest
about which entries reflect reality.

### 4. Status taxonomy

Each entry has a `status`: `ok`, `stale`, `unreachable`, `revoked`,
`pending`. Consumers fetch the registry once and filter on status.
That single taxonomy means an agent doesn't have to re-derive
freshness from the wire data; the aggregator has already computed
it.

Together, those four pieces are what an awesome-list looks like when
it grows up to handle schema-bearing content. None of them are novel
in isolation; the contribution is wiring them together with no
infrastructure beyond GitHub Pages and Actions.

## CKGP v1: why a multi-vendor protocol matters

The wire format is published as a draft spec — the **Code-Knowledge-
Graph Protocol (CKGP) v1** — independently of our reference
aggregator. Two layers:

1. **Discovery.** Producers publish a small JSON pointer at
   `.well-known/code-graph.json` in their repo. This builds on RFC
   8615 (Well-Known URIs). Agents can probe a repo for the pointer
   without any registry — even if our aggregator disappears tomorrow,
   the repo is still consumable by any compliant agent.
2. **Aggregation.** Third-party indexers (we are one; you can be
   another) crawl producers, validate them, publish a unified
   `registry.json`, run drift detection. Aggregators are optional and
   pluralistic.

Why this matters: a registry whose existence is conditional on a
single company staying in business is a single point of failure for
agent infra. A protocol whose surface is just "an HTTP file at a
well-known path" is robust to any one aggregator vanishing.

If we get hit by a bus, somebody else clones the validator and the
sync workflow and runs the registry from another GitHub org. The
producers don't have to change anything on their side. That is the
property worth designing for.

## How to use it (four audience paths)

### As an AI agent author

```bash
curl -fsSL https://looptech-ai.github.io/understand-quickly/registry.json
```

Filter on `status: "ok"`. Fetch `entry.graph_url`. Cache by
`last_sha`. Done. There's also an MCP server on the official MCP
Registry — `io.github.looptech-ai/understand-quickly` — exposing
`list_repos`, `get_graph`, `search_concepts` if your agent prefers
MCP transport over raw HTTP.

### As a repo maintainer who wants to be indexed

Three options, in order of effort:

1. **Wizard:**
   <https://looptech-ai.github.io/understand-quickly/add.html>
   fills the issue for you.
2. **CLI:** `npx @looptech-ai/understand-quickly-cli add` auto-
   detects format, graph URL, default branch, and opens the PR for
   you.
3. **Manual PR:** add a single JSON object to `registry.json` and
   open the PR. CI tells you if you got the schema wrong.

### As a producer who emits a code-knowledge graph

Add a 5-line YAML step to your existing CI to write
`.well-known/code-graph.json` into the gh-pages or Pages output of
your repo. The protocol spec has the exact shape. Once that file is
public, the registry picks you up automatically (or you can open the
PR yourself; either is fine).

We've already opened producer PRs against Repomix, gitingest,
codebase-digest, Understand-Anything, code-review-graph, and
deepwiki-open. One is merged into GitNexus. The pattern works.

### As an agent-tooling vendor (Cursor, Cody, Continue, etc.)

You can either (a) consume the registry as a cache layer in front of
your in-house indexing, or (b) run your own aggregator using the same
schemas. CKGP v1 is permissive about that — there is no central
authority. Multiple aggregators MAY coexist.

## What's next

Honest list of gaps:

- **Auth-gated repos.** Today the registry is public-only. A private-
  repo path needs more thought (likely "the producer hosts the
  pointer behind their own auth; we never see it").
- **Provenance signing.** We hash entries; we don't sign them yet.
  sigstore-style signing is on the roadmap.
- **Content-hash drift.** Drift detection is HEAD-only today. A
  cleverer "is this graph still valid against the producer's current
  state" check is plausible.
- **More producers.** The leverage point. Three demo entries today.
  The graph gets useful at ~50 well-known repos with quality
  graphs.

If any of those fit something you've been wanting to build, the
issues are open and PRs are welcomed.

## Call to action

Repo: <https://github.com/looptech-ai/understand-quickly>
Live: <https://looptech-ai.github.io/understand-quickly/>
Spec: <https://github.com/looptech-ai/understand-quickly/blob/main/docs/spec/code-graph-protocol.md>

If you maintain a repo that emits structural data — a knowledge
graph, a packed bundle, a dependency map, anything that an AI agent
would benefit from reading without re-deriving — send us a PR and
we'll get you indexed. Apache-2.0 code, permissive Data License for
the registry data, MIT-friendly CLI, no SaaS, no infrastructure to
deploy.

If you're an agent author and the format pluralism choice strikes
you as obviously wrong (or obviously right), please tell us why on
the GitHub Discussions thread. The whole point of CKGP v1 being a
draft is to absorb that feedback before lockdown.

---

## Ready-to-post checklist

- [ ] Confirm word count is between 1,150 and 1,250 (target was 1,200;
      dev.to's "estimated read time" is a good signal).
- [ ] Set the dev.to canonical URL to the GitHub repo so the post
      doesn't compete with the repo for SEO.
- [ ] Set tags: `opensource`, `aiagents`, `mcp`, `devtools`.
- [ ] Schedule for **Tuesday or Wednesday at 10:00 America/New_York**
      (dev.to readership skews ET morning).
- [ ] Cross-post the same canonical-set version to Hashnode and
      Medium **only after dev.to indexes** (24h gap). Both honor the
      `rel=canonical` tag, so SEO is preserved.
- [ ] Drop a link in the GitHub Discussions thread once the post is
      live.
- [ ] Reply to comments on the dev.to post within 24 hours for the
      first three days.

## Prerequisites

- Repo `README.md`, `CHANGELOG.md`, and `docs/spec/code-graph-protocol.md`
  must all be live and non-broken — readers will click through.
- All install lines in the post (`curl`, `npx`, `pip`) must succeed on
  a clean machine the morning of publication.
- The dev.to account posting this is the same identity used on the X /
  Bluesky launch threads, for cross-platform attribution.
