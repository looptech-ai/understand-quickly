# Launch Bluesky thread

Six posts, each ≤300 characters (Bluesky cap). More space than X, slightly
more relaxed tone, but still factual. Numbered `1/6`–`6/6`. Tags placed
once, in the final post — Bluesky search relies on facets, not duplicated
hashtags per post.

Post the chain as a thread (each subsequent post replies to the previous).
No links in 1/6 — Bluesky's algorithm de-ranks first-post-with-link.

---

## 1/6 — Hook

```
AI agents re-extract the same code-knowledge graph for the same
public repo on every run. The AST-tax. Every agent vendor pays it
independently.

Awesome-list pattern (git as DB, PRs as curation) works for
content, not just links. We shipped a registry. 1/6
```

(264 chars)

---

## 2/6 — What's live

```
Live today:
- Pages browser with per-entry guided tours
- 4 schema-validated formats: Understand-Anything, GitNexus,
  code-review-graph, bundle@1 (Repomix / gitingest)
- npm CLI, MCP server on official MCP Registry, PyPI SDK,
  GitHub Action on Marketplace
2/6
```

(269 chars)

---

## 3/6 — One curl, no SaaS

```
The whole consumer API is one HTTPS fetch. No keys, no signup, no
SaaS, MIT/Apache code:

curl https://looptech-ai.github.io/understand-quickly/registry.json

Pick entries with status "ok", fetch graph_url, cache by last_sha.
That is it. Drift detection lives on our side, not yours.
3/6
```

(297 chars)

---

## 4/6 — Producer side + GitNexus merge

```
Producers integrate by adding a 5-line YAML step that writes
.well-known/code-graph.json into their repo. We opened PRs upstream
against Repomix, gitingest, codebase-digest, Understand-Anything,
code-review-graph, deepwiki-open, GitNexus.

GitNexus already merged ours. The pattern works.
4/6
```

(300 chars — tight; double-check)

---

## 5/6 — Protocol, not platform

```
Wire format is a draft spec — CKGP v1. Vendor-neutral. RFC-8615
.well-known discovery. Format pluralism by design — we host
multiple schemas instead of picking one. Anyone can run a parallel
aggregator; the spec is built for that.

Spec: github.com/looptech-ai/understand-quickly (docs/spec/)
5/6
```

(294 chars)

---

## 6/6 — Repo + ask

```
Honest stage: 3 demo entries, no auth-gated repos, no signed
provenance yet. Drift detection is HEAD-only. Looking for help on
more producers, harder formats (LSIF, tree-sitter), and a private-
repo story.

github.com/looptech-ai/understand-quickly

#aiagents #opensource #mcp
6/6
```

(259 chars)

---

## Ready-to-post checklist

- [ ] Confirm each post is ≤300 chars (Bluesky truncates silently if
      over). Paste into a draft client (e.g., Graysky, Bsky web) to
      verify counts after auto-linkification.
- [ ] Verify the GitHub URLs render with embed cards. Bluesky pulls Open
      Graph from the destination; both URLs in this thread already have
      OG tags wired up via `site/index.html` and the GitHub repo.
- [ ] Post 1/6 first, then reply-thread 2/6 through 6/6 within 5 minutes.
- [ ] Time the post to land **30 minutes after** the X thread (cross-
      ecosystem reach without obvious copy-paste signal).
- [ ] Tag once, in 6/6, with `#aiagents #opensource #mcp`. Bluesky's
      hashtag UX prefers fewer, used-once.
- [ ] Pin 1/6 to the looptech-ai Bluesky profile for 48 hours.
- [ ] Reply within 30 minutes for the first 6 hours. Bluesky discussions
      stay live longer than X; the long-tail engagement window is real.
- [ ] If a post in this thread fails (rate-limited, accidental
      truncation), delete the broken one and re-post; Bluesky does not
      penalize edits-via-delete the way X does. Do not edit silently
      since edits break the thread chain.

## Prerequisites

- The looptech-ai handle exists on Bluesky and has at least 50 followers
  before launch, otherwise the thread will be invisible to non-followers
  for the first hour. If under 50, ask team members to follow ahead of
  posting.
- A Bluesky-friendly profile picture and bio link to the registry are
  set on the posting account.
