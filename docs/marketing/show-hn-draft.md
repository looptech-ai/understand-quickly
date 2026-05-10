# Show HN draft

Ready-to-paste body for `news.ycombinator.com/submit`. Submit from a real,
aged HN account — never a throwaway. Throwaways get auto-flagged within
minutes.

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

That's the whole API. No keys, no signup, no SaaS. MIT, zero infra.

How it stays current:
- Nightly sync recomputes per-entry status and refreshes stats.json.
- Source repos can fire `repository_dispatch` for instant refresh.
- Drift detection vs HEAD flags entries that fall behind.

Honest stage: 3 demo entries, 4 first-class formats (Understand-
Anything, GitNexus, code-review-graph, bundle@1 for repo-context
packers like Repomix and gitingest), an MCP server for agents, a
Pages browser for humans, a CLI for publishers. Awesome-list-2.0
stage. Goal: ubiquitous coordination infra, not a startup.

What we want from HN:
- Brutal feedback on format-pluralism. We host multiple schemas with
  a `format` discriminator instead of picking a winner. Tell us why
  that's wrong.
- If you build agents that read public-repo context, what would make
  you wire this in vs. keep extracting yourself?
- What's missing? Auth-gated repos? Provenance signing? Version
  diffs? Our opinions are cheap.

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
  `.github/workflows/sync.yml`. "MIT, zero infra" → link LICENSE and
  the deploy config. Receipts win on HN.
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
