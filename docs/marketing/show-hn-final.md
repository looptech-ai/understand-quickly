# Show HN — final

Refreshed from `docs/marketing/show-hn-draft.md` with the live state as
of the launch window. This is the body to paste into
`news.ycombinator.com/submit`. Submit from a real, aged HN account.
Throwaways get auto-flagged within minutes.

---

## Title

```
Show HN: A registry of code-knowledge graphs for AI agents
```

(57 chars. HN cap is 80. Avoid all-caps, avoid emoji, avoid "I built".)

## URL

```
https://looptech-ai.github.io/understand-quickly/
```

## Body

```
Agents need fresh, structured maps of public repos, but today every
agent re-extracts the same graph for the same repo on every run.
Slow, wasteful, inconsistent across tools.

We built a public, schema-validated index you can pull with one curl:

  curl https://looptech-ai.github.io/understand-quickly/registry.json

That's the whole API. No keys, no signup, no SaaS. Apache-2.0 code,
zero infra (Pages + Actions only).

Stays current via nightly sync, repository_dispatch for instant
refresh, and drift detection vs HEAD.

Shipped: npm CLI, npm MCP server, PyPI SDK, GitHub Action, and a
listing on the official MCP Registry as
io.github.looptech-ai/understand-quickly.

Honest stage: 3 demo entries, 4 first-class formats (Understand-
Anything, GitNexus, code-review-graph, bundle@1 for repo-context
packers like Repomix and gitingest). One PR already merged upstream
into GitNexus; six more open. Awesome-list-2.0 stage. Goal:
ubiquitous coordination infra, not a startup.

Wire format is a draft spec — CKGP v1 — with RFC-8615 .well-known
discovery. Anyone can run their own aggregator.

What we want from HN:
- Brutal feedback on format-pluralism. We host multiple schemas
  behind a `format` discriminator instead of picking a winner.
- If you build agents that read public-repo context, what would
  make you wire this in vs. keep extracting yourself?
- What's missing? Auth-gated repos? Provenance signing? Version
  diffs?

Repo: https://github.com/looptech-ai/understand-quickly
```

(~1,290 chars. HN soft-renders at ~2k; under 1.5k keeps it fully
visible on the front page on most viewports.)

---

## When to post

Best window: **Tuesday or Wednesday, 08:00–10:00 America/Los_Angeles**.

- Tue/Wed have the most active "Show HN" readership; weekends and
  Mondays under-perform.
- 08:00 PT lands as the US west coast is starting and EU is mid-
  afternoon — broad overlap.
- Avoid posting in the same 90-min window as a known launch (OpenAI,
  Anthropic, GitHub, Vercel keynotes). Check
  https://news.ycombinator.com/front before posting; if the front page
  is already saturated with one big launch, wait 24h.
- Avoid US public holidays and the Thanksgiving / Christmas / New Year
  weeks — front page churns slower, but your post also gets less
  oxygen.

Submit, then immediately:

1. Open the post in a tab and pin it.
2. Verify the URL renders (no typos, no trailing slash issues).
3. Add the first comment yourself with the "what we want from HN"
   restated as a question — primes the discussion.

## Comment-stewarding

For the first 6 hours, respond within 30 minutes. After that, hourly
is fine. Stewarding rules:

- **Link source for every concrete claim.** "Nightly sync" → link
  `.github/workflows/sync.yml`. "Apache-2.0 code, Data License for
  data" → link `LICENSE` and `DATA-LICENSE.md`. "Listed on MCP
  Registry" → link the registry URL. Receipts win on HN.
- **Don't fight critics. Agree where they're right.** If someone says
  "your drift detection is naive" and they're right, say so and file
  the issue in front of them. This converts critics to contributors.
- **Don't argue about the name, the logo, or the homepage copy.**
  Those threads are sinkholes. Acknowledge, move on.
- **Never edit the post body to "respond" to criticism.** Reply in
  comments instead. Editing reads as defensive.
- **No flagging, no down-voting critics, no off-site DMs to mods.**
  Let the system work.
- **Track every concrete suggestion.** Open a GitHub issue with a link
  back to the HN comment, reply with the issue link, thank them.
  Visible follow-through is the single biggest reason a Show HN turns
  into a real community.

If the post stalls (< 5 points after 30 min): leave it. Do not delete
and re-submit. HN penalizes resubmits and a stalled Show HN is not a
catastrophe — most posts stall. Try again in 90 days with material
changes.

---

## Ready-to-post checklist

- [ ] Confirm body is ≤1500 chars after paste (HN's textarea will trim
      trailing whitespace; recount after paste).
- [ ] Confirm `npx @looptech-ai/understand-quickly-cli --help` works on
      a clean machine the morning of. A broken install line in a Show HN
      is fatal.
- [ ] Confirm `pip install understand-quickly` works on a clean Python
      3.10+ env. PyPI propagation lag is rarely an issue but worth
      checking.
- [ ] Confirm
      <https://registry.modelcontextprotocol.io/v0/servers?search=io.github.looptech-ai/understand-quickly>
      returns at least one result. If propagation is in progress, drop
      the MCP-Registry line from the body rather than ship a broken
      claim.
- [ ] Confirm `https://looptech-ai.github.io/understand-quickly/` and
      `/registry.json` both return HTTP 200 with content-type
      `text/html` and `application/json` respectively.
- [ ] Confirm the GitNexus merge link is reachable — referenced in the
      "one PR already merged" claim.
- [ ] Have the first follow-up comment drafted offline so it can be
      pasted within 60s of submission.
- [ ] Have all six tier-1 outreach DMs (see
      [`promotion-targets.md`](./promotion-targets.md)) drafted and
      ready to send within 5 minutes of submission.
- [ ] Pick a clean posting time. Default: **the next Tuesday or
      Wednesday at 09:00 America/Los_Angeles**. Adjust if a major
      vendor keynote collides.

## Prerequisites

- A real HN account aged ≥ 30 days with non-zero karma. Post from this
  account, not a clean throwaway — throwaways get auto-flagged.
- The HN account's email matches a public identity (your blog, GitHub,
  or site footer). HN dang-side flags often resolve in your favor when
  the account is identifiable.
- A second HN account (also aged) is **not** used. Sock-puppet upvotes
  trigger auto-flag.
