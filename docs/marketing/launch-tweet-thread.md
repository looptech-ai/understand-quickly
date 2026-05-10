# Launch tweet thread (X / Twitter)

Eight tweets, each ≤280 characters. Numbered `1/8`–`8/8`. Tone: technical,
factual, no hype words ("revolutionary", "game-changing", etc.). Post the
hook (1/8) first, then reply-thread the remaining seven within ~30s of
each other. Twitter's algorithm rewards complete threads posted in one
sitting over staggered ones.

Char counts measured excluding the trailing newline. URLs count as 23
characters per Twitter's t.co wrapper regardless of source length.

---

## 1/8 — Hook

```
AI agents shouldn't re-extract the same code-knowledge graph for the
same public repo on every run. The Awesome-list pattern (git as DB,
PR as curation) works for content too — not just links.

We shipped a registry for it. Thread. 1/8
```

(257 chars)

---

## 2/8 — What shipped

```
What's live today:
- Pages browser + JSON-LD search surface
- 4 first-class formats (Understand-Anything, GitNexus,
  code-review-graph, bundle@1 for Repomix/gitingest)
- npm CLI + npm MCP server + PyPI SDK + GH Action
- Listed on the official MCP Registry
2/8
```

(269 chars)

---

## 3/8 — One curl

```
The whole API is one fetch. No keys, no signup, no SaaS:

curl https://looptech-ai.github.io/understand-quickly/registry.json

Pick entries with status:"ok". Fetch entry.graph_url. Cache by
last_sha. Done. 3/8
```

(217 chars)

---

## 4/8 — Live demo

```
Live demo (Pages browser, drift-tracked entries, per-entry tours):
https://looptech-ai.github.io/understand-quickly/

[clip: 30s screen recording — curl → browse → click entry → graph]
4/8
```

(204 chars; attach the recorded clip from twitter-clip-script.md)

---

## 5/8 — Producer integration

```
Producers integrate with 5 lines of YAML in their own repo (writes
.well-known/code-graph.json). One PR is already merged into
GitNexus; PRs open against Repomix, gitingest, codebase-digest,
Understand-Anything, code-review-graph, deepwiki-open.
5/8
```

(258 chars)

---

## 6/8 — Protocol angle

```
The wire format is a draft spec, CKGP v1 — vendor-neutral,
RFC-8615 .well-known discovery, format pluralism by design. Anyone
can run their own aggregator; we are not the registry, just an
implementation of one.

Spec: https://github.com/looptech-ai/understand-quickly/blob/main/docs/spec/code-graph-protocol.md
6/8
```

(279 chars — tight; verify before posting)

---

## 7/8 — Honest gaps + ask

```
Honest stage: 3 demo entries, no auth-gated repos yet, no signed
provenance, drift detection is HEAD-only.

Want help on: more producers wired up, harder formats (TypeScript
LSIF? tree-sitter dumps?), agent integrations beyond MCP, and a
better answer for private repos.
7/8
```

(265 chars)

---

## 8/8 — Repo + tag

```
Repo (Apache-2.0 code, Data License 1.0 for registry data):
https://github.com/looptech-ai/understand-quickly

If you build agent infra and care about not paying the AST tax on
every run, would love feedback. cc @swyx — fits the "small,
boring, useful infra" beat.
8/8
```

(266 chars)

---

## Ready-to-post checklist

- [ ] Verify each tweet renders ≤280 chars after Twitter's link wrapping
      (t.co = 23 chars). Paste into a draft to confirm.
- [ ] Record the 30-second clip per
      [`twitter-clip-script.md`](./twitter-clip-script.md). Attach to 4/8.
- [ ] Pre-warm DNS / cache so the curl in the clip returns under 1s.
- [ ] Confirm the `@swyx` mention in 8/8 is appropriate the day-of (he
      may be on a launch of his own; if so, drop the cc rather than
      colliding). No other accounts tagged.
- [ ] Post the hook (1/8) at **Tuesday or Wednesday, 09:00 America/
      Los_Angeles**. That window overlaps US-PT morning and EU-CET
      afternoon.
- [ ] Post 2/8 through 8/8 as replies within 5 minutes of the hook.
      Don't stagger over hours; the algorithm penalizes incomplete
      threads.
- [ ] Pin 1/8 to the looptech-ai profile for 48 hours after posting.
- [ ] Cross-post the same arc to Bluesky from
      [`launch-bluesky-thread.md`](./launch-bluesky-thread.md) within
      30 minutes of the X thread going live.
- [ ] Track replies in the first 6 hours; reply within 30 minutes for
      the first burst. After 6 hours, hourly cadence is fine.

## Prerequisites

- Live URL `https://looptech-ai.github.io/understand-quickly/` reachable
  and returning HTTP 200 with the latest `stats.json` timestamp within
  24 hours.
- `registry.json` validates green in CI on the most recent `main`.
- The recorded clip is uploaded as a **draft** on the looptech-ai
  account before the thread is composed; switching media at compose
  time often loses the upload silently.
