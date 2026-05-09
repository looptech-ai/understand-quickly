# Launch checklist

Single source of truth for the day-of plan. Tick boxes in a fork of
this file during execution; commit the executed copy as
`docs/marketing/launches/<YYYY-MM-DD>-checklist.md` after T+1.

## T-3 days — pre-flight

- [ ] Smoke-test all routes locally and on the deployed Pages site
      (root `/`, `/registry.json`, `/stats.json`, an entry detail
      page, MCP server endpoint). See [`tests/`](../../tests/).
- [ ] Confirm CI green on `main`. Workflows:
      [`validate.yml`](../../.github/workflows/validate.yml),
      [`smoke.yml`](../../.github/workflows/smoke.yml),
      [`pages.yml`](../../.github/workflows/pages.yml),
      [`render.yml`](../../.github/workflows/render.yml),
      [`sync.yml`](../../.github/workflows/sync.yml),
      [`codeql.yml`](../../.github/workflows/codeql.yml).
- [ ] [`CHANGELOG.md`](../../CHANGELOG.md) up-to-date with everything
      shipping in the launch.
- [ ] Latest release tagged. `git tag -l | tail -3` matches the version
      referenced in README and CHANGELOG.
- [ ] [`README.md`](../../README.md) hero paragraph and Quick Start
      reviewed by a fresh pair of eyes; no broken anchors.
- [ ] [`SECURITY.md`](../../SECURITY.md) and
      [`CODE_OF_CONDUCT.md`](../../CODE_OF_CONDUCT.md) present and
      linked from README.
- [ ] Twitter/X clip recorded, captioned, and uploaded as a draft to
      the posting account. Script:
      [`twitter-clip-script.md`](./twitter-clip-script.md).

## T-1 day — final dress

- [ ] All 3 demo entries report `status: ok` in
      [`registry.json`](../../registry.json). If any are stale,
      trigger a manual sync run and wait for green.
- [ ] [`stats.json`](../../site/stats.json) refreshed within the last
      24h.
- [ ] CodeQL green for the most recent run on `main`.
      [`codeql.yml`](../../.github/workflows/codeql.yml).
- [ ] Open issues triaged. Close anything trivially closable; pin a
      "good first issue" for new arrivals.
- [ ] Show HN draft re-read aloud.
      [`show-hn-draft.md`](./show-hn-draft.md). Title under 80 chars.
      Body under 1500 chars.
- [ ] HN account verified (logged in, karma > 100, no recent flagged
      submissions).
- [ ] Twitter clip final cut reviewed on a phone — captions readable
      at 4-inch display size.
- [ ] Calendar block 09:00–15:00 PT on launch day. No meetings.

## T-0 — launch morning (08:00 PT target)

- [ ] **08:00 PT** — Submit Show HN with title and body from
      [`show-hn-draft.md`](./show-hn-draft.md).
- [ ] **08:01 PT** — Pin the post URL in a tab. Sanity-check render.
- [ ] **08:05 PT** — Post first comment on the HN thread restating
      "what we want from HN" as a question.
- [ ] **08:15 PT** — Post Twitter/X clip + reply thread per
      [`twitter-clip-script.md`](./twitter-clip-script.md).
- [ ] **08:30 PT** — Cross-post Twitter clip to LinkedIn (drop
      @-tags).
- [ ] **08:45 PT** — Cross-post to Reddit:
      - If Saturday: `/r/LocalLLaMA` Self-Promo Saturday thread.
      - Otherwise: `/r/MachineLearning` with `[P]` flair (self-promo
        is OK there with flair) **or** `/r/programming` with a
        non-promotional framing emphasizing the schema/registry idea.
      - Skip if the day's politics make it noisy.
- [ ] **ProductHunt** — defer. Schedule for a future Tuesday in a
      separate doc. (PH and HN on the same day cannibalize each
      other.)

## T-0 — day-of stewarding

- [ ] **First 6 hours**: respond to every HN, Twitter, Reddit comment
      within 30 minutes. See "Comment-stewarding" rules in
      [`show-hn-draft.md`](./show-hn-draft.md).
- [ ] Open a GitHub issue for every concrete suggestion; link the
      issue back into the comment thread.
- [ ] No edits to the HN body. No deleting tweets. No DMing critics.
- [ ] Lunch break: 12:00–12:30 PT. Step away from the screen. The
      thread will survive.
- [ ] **End of day**: snapshot final HN rank, Twitter impressions,
      Reddit upvotes, GitHub star delta, registry.json fetch count
      (from CDN logs if available).

## T+1 — retro

- [ ] Write retro: `docs/marketing/launches/<YYYY-MM-DD>-retro.md`.
      Cover: numbers (HN peak rank, total comments, GH stars before
      vs. after, Twitter impressions, registry.json hits), what
      worked, what didn't, list of follow-up issues opened during
      launch, list of new contributors who showed up.
- [ ] File any "we should have shipped this before launch" items as
      issues so the next launch doesn't repeat them.
- [ ] Reply once more in the HN thread thanking commenters and
      linking the retro. Closes the loop, looks professional, brings
      a second wave of traffic.

## T+7 — follow-through

- [ ] Ship at least one of the issues filed during launch and link
      back to the originating HN/Twitter comment in the PR
      description. Visible follow-through is the single biggest
      determinant of whether a Show HN converts to a real community.
- [ ] If the launch went well, schedule the ProductHunt drop for a
      Tuesday 4–6 weeks out so the news cycle has fully reset.
