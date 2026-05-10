# Reddit posts

One draft per subreddit. Each ≤500 words. Tone and framing differ
because the readerships differ — paste the right one in the right sub.

Reddit etiquette to honor:

- Read each subreddit's pinned rules the morning of the post; rules
  change. The drafts below assume rules as of 2026-04.
- Self-promotion ratio: post in a sub only if you've meaningfully
  participated in the past 30 days, or the post is technical enough to
  stand on its own merit. The drafts below are the latter.
- Do not cross-post the same body to multiple subs the same day. The
  Reddit anti-spam filter shadow-bans on this.
- Reply to comments within an hour for the first six hours.

---

## /r/LocalLLaMA — agent angle

**Title:**

```
Public registry of code-knowledge graphs so agents stop re-extracting
the same repo every run
```

(94 chars. /r/LocalLLaMA flair: `Resources` if available, else no flair.)

**Body:**

```
If you're running local agents that read public repos for context,
you've probably noticed that every framework re-runs its own AST
extraction (or RAG ingest, or repomix-style packing) for the same
repo on every cold start. The work is duplicated across vendors, and
the output is inconsistent across tools, so caching across agents is
hard.

We shipped a public registry that caches the structured part once and
serves it as JSON, so agents can fetch a fresh, schema-validated map
of an indexed repo in a single HTTPS request. No keys, no SaaS, no
infra to deploy:

  curl https://looptech-ai.github.io/understand-quickly/registry.json

Pick entries with `status: "ok"`, fetch `entry.graph_url`, cache by
`last_sha`. That is the entire consumer API.

What the registry actually contains today:

- 4 first-class formats — Understand-Anything, GitNexus, code-review-
  graph, and `bundle@1` for repo-context packers (Repomix, gitingest,
  codebase-digest output is consumable as-is).
- 3 demo entries (we are at the awesome-list-2.0 stage; ramp comes
  from producer adoption and producer PRs are landing — one merged
  upstream into GitNexus already).
- Drift detection: every entry's `last_sha` is checked against the
  source repo's HEAD nightly, so consumers can skip stale entries.
- An MCP server (`@looptech-ai/understand-quickly-mcp`, listed on the
  official MCP Registry) — three tools: `list_repos`, `get_graph`,
  `search_concepts`. Wire it into Claude Desktop, Codex, Cursor, or
  any local agent that speaks MCP.

Why I think this matters for the local-models crowd specifically: a
local 7B–70B agent has even less budget than a frontier one to burn
on repeated AST extraction. Pulling a pre-computed graph for the
common case (public-repo context) means the local model can spend
its tokens on actually reasoning over the structure.

What I want feedback on from this sub:

1. If you run agents locally, what stops you from wiring a public
   registry like this in vs. keep extracting per run?
2. Format pluralism: we host multiple schemas behind a discriminator
   instead of picking one. Right or wrong call?
3. What's missing for your workflow? Private repos? Provenance
   signing? Version diffs?

Code: github.com/looptech-ai/understand-quickly (Apache-2.0 + Data
License 1.0 for the registry data, zero infra — Pages + Actions only)
Spec: docs/spec/code-graph-protocol.md (CKGP v1, multi-vendor)

Happy to answer anything.
```

(~470 words.)

---

## /r/ChatGPTCoding — practical install + use story

**Title:**

```
I'm caching code-knowledge graphs for AI assistants so they stop
re-reading the same repo from scratch — public registry, MCP server
included
```

(140 chars. /r/ChatGPTCoding flair: `Project Showcase` if available.)

**Body:**

```
TL;DR: install one MCP server, point your editor at it, and your AI
assistant gets pre-computed structural maps of indexed public repos
instead of re-reading every file each time.

Install (Claude Desktop / Cursor / Codex — anything with MCP):

    # via npm
    npm install -g @looptech-ai/understand-quickly-mcp

Then in your MCP config:

    {
      "mcpServers": {
        "understand-quickly": { "command": "understand-quickly-mcp" }
      }
    }

It's also on the official MCP Registry as
`io.github.looptech-ai/understand-quickly`, if your client resolves
from there.

Three tools land in your agent:

- `list_repos` — list indexed repos with status and tags
- `get_graph` — pull the graph for a given entry
- `search_concepts` — search across entries by concept name

The registry itself is a flat JSON file. You can also just curl it:

    curl https://looptech-ai.github.io/understand-quickly/registry.json

Each entry has a `status` (ok / stale / unreachable / etc.), a
`last_sha`, drift info vs the source repo's HEAD, plus the `graph_url`
to fetch. Entries are schema-validated in CI, so the shape is stable.

Why bother:

- ChatGPT-style assistants spend a lot of context window on "let me
  read the codebase first." For public repos, the structural part
  doesn't have to be re-derived each time.
- The MCP server is read-only and stateless. Nothing leaves your
  machine except the HTTPS fetch to the registry. No telemetry, no
  account, no signup.
- It's MIT-friendly (Apache-2.0 code, permissive Data License for the
  registry).

Honest stage: 3 demo entries today, 4 formats first-class, awesome-
list-2.0 territory. PRs against six upstream tools are open, one is
already merged into GitNexus. Looking for early adopters who'll feed
back about real workflows.

Repo (with the JSON wizard for adding your own repo):
github.com/looptech-ai/understand-quickly

Tell me if your assistant actually picks the registry data up cleanly
or whether the tool surface needs work.
```

(~390 words.)

---

## /r/MachineLearning — protocol angle, [P] flair

**Title:**

```
[P] CKGP v1: a vendor-neutral protocol for publishing and discovering
code-knowledge graphs
```

(96 chars. /r/MachineLearning requires the `[P]` (Project) tag in the
title for project-class submissions.)

**Body:**

```
We've drafted and shipped the first version of the Code-Knowledge-
Graph Protocol (CKGP v1) along with a reference aggregator
implementation. The motivation, for the ML readership: agents reading
public source code today re-run extraction (AST parses, embedding
indexes, RAG ingest) on every interaction, with each vendor doing it
slightly differently. There is no convention for finding, identifying,
or trusting third-party-produced graph artifacts the way there is for,
say, model weights on Hugging Face.

CKGP v1 specifies, briefly:

1. A discovery layer. Producers publish a small JSON pointer at
   `.well-known/code-graph.json` in the source repo. Agents probe
   this path before doing anything else. No central authority, no
   registration — every repo speaks for itself. Builds on RFC 8615
   (Well-Known URIs) and RFC 8259 (JSON).

2. An aggregator layer. Third-party indexers (the reference
   implementation is `looptech-ai/understand-quickly`) crawl
   producers, validate them against a JSON Schema, publish a unified
   `registry.json`, and run drift detection against producer HEAD.
   Multiple aggregators MAY coexist — the protocol is built for
   format pluralism on purpose.

3. A consumer surface. Agents fetch the aggregator's `registry.json`
   and per-entry `graph_url` over HTTPS. Cache by `last_sha`. No
   client SDK is required.

The reference implementation indexes 4 first-class formats today —
Understand-Anything, GitNexus, code-review-graph, and `bundle@1`
(a normalized envelope around repo-context packer output: Repomix,
gitingest, codebase-digest). Each format's JSON Schema is published
in the repo and validated in CI.

Spec:
github.com/looptech-ai/understand-quickly/blob/main/docs/spec/code-graph-protocol.md

Reference impl + live registry:
github.com/looptech-ai/understand-quickly
looptech-ai.github.io/understand-quickly

What we'd value feedback on, specifically from the ML community:

- Versioning policy. We do `<format>@<int>` per format and CKGP v<n>
  at the protocol level, with a parallel-publish migration policy for
  major bumps. Better idea?
- Drift semantics. Today: aggregator polls source HEAD; entries with
  `commits_behind` > N flip to `stale`. Should there be a
  content-hash-based "graph still valid against this commit" check
  too?
- Registry data licensing. The aggregator's data is under a
  permissive Data License 1.0 (perpetual, sublicensable, includes
  AI/ML training rights, with a Beneficiary back-grant). We modeled
  it on the discussions around dataset licensing post-2024. Does the
  back-grant clause read as reasonable or as a poison pill?

Honest stage: 3 demo entries, 6 producer PRs open upstream, 1 merged
(GitNexus). Awesome-list-2.0 level of maturity; not at scale yet.

Comments and review welcomed.
```

(~485 words.)

---

## Ready-to-post checklist

- [ ] Read each subreddit's current pinned rules. /r/LocalLLaMA and
      /r/MachineLearning rules drift.
- [ ] /r/MachineLearning requires `[P]` flair in the title; verify
      it's there before submitting.
- [ ] /r/LocalLLaMA: post on a weekday morning US-PT. Weekend posts
      under-engage on this sub.
- [ ] /r/ChatGPTCoding: post on a weekday afternoon US-PT (their
      audience reads later in the day on average).
- [ ] /r/MachineLearning: post on a weekday morning US-ET. Stricter
      moderation; submit when mods are likely awake to approve.
- [ ] **Stagger by 24 hours.** Do not post all three the same day. The
      anti-spam filter cross-references identical/near-identical bodies
      (which is why the bodies above are deliberately different).
- [ ] First reply on each post within 60 minutes; subsequent replies
      hourly for the first six hours.
- [ ] Do not cross-post via Reddit's built-in cross-post button — it
      annoys mods. Repost as a fresh submission with the right body.

## Prerequisites

- The submitting Reddit account is at least 30 days old, has at least
  100 comment karma, and has participated in the target sub at least
  once in the last 60 days. New accounts get auto-removed.
- All three install lines (`npm`, `pip`, MCP) work on a clean machine
  before posting. A broken install line in a Reddit thread escalates
  fast.
- The Show HN has either gone up or is scheduled — Redditors will
  cross-link, and a missing HN thread looks like the project lacks
  proof of life.
