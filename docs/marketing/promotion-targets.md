# Promotion targets — ranked

Ranked by **reach × topical fit × likelihood-of-engagement**. Each entry
includes the channel, why they fit, and a ≤500-char draft DM/email/issue
body. No invented contact info — only handles and emails that are
publicly listed on each person's site, GitHub profile, or podcast page.
Where a private email isn't public, the channel is `Twitter DM`,
`Bluesky DM`, or `GitHub Discussions thread`, never email.

> **Etiquette rule for everyone below:** one shot per channel per launch.
> No follow-up nag if they don't reply within 7 days. A re-engagement is
> fine 2–3 months later when there's a material new thing to share.

---

## Tier 1 — highest expected return

These four are most likely to either amplify or contribute upstream
because the registry sits directly on their content beat. Hit these
first, ideally in the 24h after the Show HN goes up.

### 1. Simon Willison — `@simonw`

- **Channel:** Bluesky DM (`@simonw.net`) or Twitter DM (`@simonw`).
  Email `swillison@gmail.com` is public on his site footer; reserve email
  for a longer follow-up if the DM gets traction.
- **Why he fits:** `llm` and `Datasette` both depend on grounding LLMs in
  structured data. He's written extensively about consuming JSON over
  HTTP for AI tools; the registry is a textbook fit. He covers tools he
  finds useful in his TIL/blog regardless of size — high amplification
  upside.
- **Draft DM:**

  ```
  Hey Simon — built a public registry of code-knowledge graphs for
  AI agents. One curl, schema-validated, drift-tracked. MIT code,
  permissive Data License, zero infra (Pages + Actions only).

  Three demo entries today, four formats first-class (Repomix,
  gitingest, GitNexus, code-review-graph). Open spec at CKGP v1.

  Live: looptech-ai.github.io/understand-quickly
  Repo: github.com/looptech-ai/understand-quickly

  Curious whether this fits your "small useful tool" beat.
  ```

  (487 chars)

### 2. Shawn Wang (swyx) — `@swyx`

- **Channel:** Twitter DM (`@swyx`). His Latent.Space form is also open
  for tip submissions: <https://latent.space/p/contact>. Use the DM
  first, and if it lands, the form for a longer write-up.
- **Why he fits:** Latent.Space is the AI-infra newsletter of record for
  the protocol/standards beat — MCP, agent tooling, registries. The
  registry-as-coordination-infrastructure framing is squarely in his
  editorial voice. He's also already written about MCP adoption.
- **Draft DM:**

  ```
  Hey swyx — shipped a public registry of code-knowledge graphs
  + a draft protocol (CKGP v1, .well-known/code-graph.json) for
  multi-vendor aggregators. Pages-hosted, zero infra.

  Listed on the official MCP Registry. One PR already merged
  upstream into GitNexus; six more open across Repomix /
  gitingest / Understand-Anything / code-review-graph.

  Awesome-list-2.0 framing. Worth a Latent.Space mention?

  github.com/looptech-ai/understand-quickly
  ```

  (494 chars)

### 3. Hamel Husain — `@HamelHusain`

- **Channel:** Twitter DM (`@HamelHusain`). His blog at hamel.dev links
  Calendly for paid consults, not cold pitches.
- **Why he fits:** Practitioner-focused AI eval/infra writer. Heavy on
  "use the right boring tool"; the registry's "git is the database, PR
  is the curation step" pitch reads exactly to his sensibility. Strong
  retweet engagement among ML eng audiences.
- **Draft DM:**

  ```
  Hey Hamel — public registry of code-knowledge graphs for agents,
  schema-validated, drift-tracked, fetched with one curl. Built on
  the awesome-list pattern (git as DB, PR as curation).

  No SaaS, no infra, MIT/Apache. Three demo entries today, four
  formats. CKGP v1 spec is multi-vendor on purpose.

  github.com/looptech-ai/understand-quickly

  Would love your read on whether agents actually need this layer.
  ```

  (470 chars)

### 4. Eugene Yan — `@eugeneyan`

- **Channel:** Twitter DM (`@eugeneyan`). Email is on his blog footer
  (`eugene@eugeneyan.com`); use only after a DM signal.
- **Why he fits:** Writes long-form, careful posts on applied LLMs;
  registry-as-coordination-infra is the kind of "infrastructure
  pattern" piece he's quoted before (MTEB, retrieval indexes). Less
  likely to retweet, more likely to write a referenced post — high
  durable signal.
- **Draft DM:**

  ```
  Hey Eugene — built a public registry of code-knowledge graphs
  for AI agents. CKGP v1 (vendor-neutral .well-known discovery),
  three demo entries, four formats. Pages + Actions, no infra.

  The interesting bit is format pluralism — we host multiple
  schemas behind a discriminator instead of picking one. Curious
  what you think about that vs. converging on one.

  github.com/looptech-ai/understand-quickly
  ```

  (445 chars)

---

## Tier 2 — MCP ecosystem

Hit on the day of the Show HN, since the registry is already listed on
the MCP Registry and that's the easiest concrete proof point.

### 5. Justin Spahr-Summers — `@jspahrsummers`

- **Channel:** Twitter DM. He's an MCP creator at Anthropic and replies
  to substantive technical pings. His GitHub is `jspahrsummers`.
- **Why he fits:** MCP co-creator. The registry has an MCP server (npm)
  and is listed on `registry.modelcontextprotocol.io`. A direct line to
  feedback on whether the MCP shape is right.
- **Draft DM:**

  ```
  Hey Justin — `understand-quickly-mcp` is now on the MCP Registry
  (io.github.looptech-ai/understand-quickly). It exposes a public
  registry of code-knowledge graphs as `list_repos`, `get_graph`,
  `search_concepts`.

  Would value your read on whether the tool surface fits MCP's
  intent or whether we're stretching it.

  registry.modelcontextprotocol.io/v0/servers?search=io.github.looptech-ai/understand-quickly
  ```

  (455 chars)

### 6. David Soria Parra — `@dsp`

- **Channel:** Twitter DM. MCP co-creator, careful technical writer.
- **Why he fits:** Same as #5; if Justin doesn't bite, David might.
  Sending both at once is fine — they collaborate publicly.
- **Draft DM:**

  ```
  Hey David — shipped an MCP server fronting a public registry of
  code-knowledge graphs. Three tools (list, get, search). Listed
  on the official MCP Registry. Open protocol (CKGP v1), zero
  infra.

  Honest stage: 3 demo entries. Looking for harsh review of the
  tool surface before more agents wire in.

  github.com/looptech-ai/understand-quickly
  ```

  (354 chars)

### 7. MCP newsletter — `@mcpfeed` / mcp.so curators

- **Channel:** GitHub Discussions on `modelcontextprotocol/servers`,
  also `mcp.so` has a "Submit your server" form (no DM equivalent).
  Submit via the form, then post a Discussion noting submission.
- **Why they fit:** Cross-aggregator amplification. mcp.so feeds a
  number of MCP-server discovery surfaces.
- **Draft submission:**

  ```
  Submission: io.github.looptech-ai/understand-quickly
  Type: MCP server
  Tools: list_repos, get_graph, search_concepts
  Function: read-only access to a public registry of
            code-knowledge graphs (CKGP v1).
  License: Apache-2.0 (code), Data License 1.0 (data).
  Source: github.com/looptech-ai/understand-quickly
  Live: looptech-ai.github.io/understand-quickly
  ```

  (351 chars)

---

## Tier 3 — Anthropic devrel

Use carefully. Anthropic devrel publicly engages on technical-merit
content, but is not a free amplifier. Send only if there's a real fit
question to ask, not a "please boost".

### 8. Alex Albert — `@alexalbert__`

- **Channel:** Twitter DM. Anthropic developer-relations.
- **Why he fits:** Public point of contact for Anthropic-shaped
  developer launches. The registry-as-MCP-listing angle gives him a
  reasonable hook. He boosts substantive launches.
- **Draft DM:**

  ```
  Hey Alex — quick heads up: shipped a registry of code-knowledge
  graphs for AI agents, with an MCP server now on the official MCP
  Registry. Open protocol (CKGP v1), zero infra, MIT/Apache.

  Not asking for a boost — just flagging a concrete MCP-Registry
  user. Happy to answer any "what's this actually for" questions
  if useful.

  github.com/looptech-ai/understand-quickly
  ```

  (399 chars)

### 9. Erik Schluntz — `@erikschluntz`

- **Channel:** Twitter DM. Anthropic technical staff who has posted
  publicly about agent infra and MCP.
- **Why he fits:** Practical agent-infra perspective from inside an
  agent vendor. Honest feedback on whether the agent side actually
  wants this layer.
- **Draft DM:**

  ```
  Hey Erik — would love your honest read on whether agent vendors
  actually want a public registry of code-knowledge graphs (vs.
  re-extracting per run). We shipped one — CKGP v1, multi-vendor,
  MCP-Registry-listed.

  Specific question: format pluralism (we host four schemas) vs.
  consolidating on one. Which way would you push?

  github.com/looptech-ai/understand-quickly
  ```

  (391 chars)

---

## Tier 4 — adjacent open-source registries

These maintainers care about the awesome-list-2.0 framing and may have
useful war-stories.

### 10. `sindresorhus/awesome` — Sindre Sorhus

- **Channel:** GitHub Discussions on `sindresorhus/awesome`. He doesn't
  take cold DMs.
- **Why he fits:** Originator of the awesome-list pattern. The registry
  explicitly cites his work as the inspiration. A polite mention, not a
  request.
- **Draft Discussion post:**

  ```
  Title: We built an "awesome-list 2.0" for code-knowledge graphs —
         credit and a question

  Body: Hi — we shipped a public registry that uses the awesome-list
  pattern (git as DB, PR as curation) to index code-knowledge graphs
  for AI agents instead of just links. Schema-validated, drift-
  tracked, MIT/Apache.

  Question for the community: have you seen the awesome-list pattern
  fail at scale on schema-bearing content (vs. links)?

  Repo: github.com/looptech-ai/understand-quickly
  ```

  (498 chars)

---

## Tier 5 — adjacent-tool authors (already engaged via PRs)

We have open PRs against Repomix, gitingest, codebase-digest,
Understand-Anything, code-review-graph, deepwiki-open, and a merged PR
into GitNexus. A separate thank-you DM is good etiquette and converts
PR-reviewer-momentum into ongoing-collaborator-momentum.

### 11. Yamadashy (Repomix) — `@yamadashy`

- **Channel:** Twitter DM (`@yamadashy_eng` if active, else GitHub via
  PR thread).
- **Draft DM:**

  ```
  Hey — thanks for the engagement on the Repomix PR. The registry
  side just shipped (Pages browser, MCP server on the official
  registry, three demo entries, four formats including bundle@1
  for Repomix output).

  No ask, just a heads up + a thank-you. Happy to update the PR
  with anything that would help it land.

  github.com/looptech-ai/understand-quickly
  ```

  (370 chars)

### 12. cyclotruc (gitingest)

- **Channel:** GitHub PR comment (already open). Post a fresh top-level
  comment on the PR once the registry is live, with a link.
- **Draft comment:**

  ```
  Quick update: the registry side has shipped publicly. Pages
  browser, MCP server on the MCP Registry, three demo entries
  including a gitingest sample as bundle@1.

  Link for context: looptech-ai.github.io/understand-quickly

  No new asks on the PR — happy to rebase or split if it would
  help reviewability.
  ```

  (293 chars)

### 13. abhigyanpatwari (GitNexus) — already merged

- **Channel:** GitHub PR thread. The PR is merged; a closing thank-you
  is good etiquette.
- **Draft comment:**

  ```
  Thanks for the merge — really appreciated the careful review. The
  aggregator side is now public:

  looptech-ai.github.io/understand-quickly

  GitNexus is the first format with a working end-to-end story.
  Will keep the .well-known docs in sync as CKGP v1 stabilizes.
  ```

  (281 chars)

---

## Tier 6 — AI coding tool maintainers (adjacent, not competitive)

Frame carefully. The registry is a layer **below** their product, not a
competitor. Lead with the curiosity question, not a pitch.

### 14. Cursor team — `@cursor_ai`

- **Channel:** Twitter DM, then their feedback Discord
  (<https://forum.cursor.com>) only if the DM lands.
- **Why they fit:** Their indexing pipeline is internal; they may or may
  not care about a public registry, but they'll have a strong opinion.
- **Draft DM:**

  ```
  Hey Cursor — quick question, not a pitch: shipped a public
  registry of code-knowledge graphs (CKGP v1, MIT/Apache). Three
  demo entries, multi-format.

  Genuine question: would a Cursor-grade agent ever rely on a
  public, third-party graph (cache, fallback, cold-start) or is
  in-house indexing always strictly better?

  github.com/looptech-ai/understand-quickly
  ```

  (390 chars)

### 15. Cody / Sourcegraph — `@sourcegraph`

- **Channel:** Twitter DM, or GitHub Discussions on
  `sourcegraph/sourcegraph`.
- **Why they fit:** They run the closest existing thing (private
  graph-of-code at scale). A polite "you've solved this for paying
  customers; we're carving a no-auth public slice — different layer"
  framing.
- **Draft DM:**

  ```
  Hey Sourcegraph — built a public, no-auth registry of code-
  knowledge graphs for AI agents. Different layer than what you do
  for enterprise (auth-gated, private, real-time) — this is a
  cold-cache slice for public repos.

  Curious whether you'd see value in pointing to it from public-
  repo Cody, or whether the layers don't compose cleanly.

  github.com/looptech-ai/understand-quickly
  ```

  (412 chars)

### 16. Continue.dev — `@continuedev`

- **Channel:** Twitter DM, or their open Discord.
- **Why they fit:** Open-source coding agent. Direct fit for using a
  public registry as a context source.
- **Draft DM:**

  ```
  Hey Continue team — public registry of code-knowledge graphs is
  live (CKGP v1, MCP server, three demo entries, multi-format).
  Read-only fetch, no SaaS.

  Worth wiring as a Continue context provider? Would happily own
  the integration PR if there's appetite.

  github.com/looptech-ai/understand-quickly
  ```

  (320 chars)

---

## Tier 7 — newsletter operators

Lower per-target reach but additive. Submit on the day of the Show HN.

### 17. TLDR AI — submit form

- **Channel:** <https://tldr.tech/ai/submit-tip> (public form).
- **Draft tip:**

  ```
  Public registry of code-knowledge graphs for AI agents. One curl
  fetches a schema-validated index of indexed repos; agents skip
  re-extraction. CKGP v1 spec, multi-vendor, MIT/Apache code, zero
  infra (Pages + Actions). Listed on the official MCP Registry.
  Three demo entries today; awesome-list-2.0 framing.

  github.com/looptech-ai/understand-quickly
  ```

  (367 chars)

### 18. Ben's Bites — submit form

- **Channel:** <https://bensbites.com/submit> (public form).
- **Draft tip:** Same body as #17.

### 19. Practical AI podcast — `@practicalAIfm`

- **Channel:** Twitter DM, or `editors@changelog.com` (public).
- **Why they fit:** Episode beat skews "tooling and infrastructure for
  ML practitioners". Could be a 30-min interview if it lands.
- **Draft email:**

  ```
  Subject: Public registry of code-knowledge graphs for AI agents
           — possible Practical AI episode?

  Body: Shipped looptech-ai/understand-quickly: a public registry
  of code-knowledge graphs for AI agents. CKGP v1 spec, multi-
  vendor, no infra (Pages + Actions), MIT/Apache code.

  Story arc: awesome-lists work because git is the DB and PRs are
  the curation step; we extended that to schema-bearing content.
  One PR already merged upstream into GitNexus.

  Happy to come on for 30 min if it fits.

  github.com/looptech-ai/understand-quickly
  ```

  (497 chars)

### 20. Latent Space podcast — see Tier 1, swyx

The Latent Space tip form is already covered by the Tier 1 swyx outreach;
do not double-submit.

---

## Top 5 (do these first)

| # | Target | Channel | Why this one |
|---|--------|---------|--------------|
| 1 | Simon Willison | Bluesky/Twitter DM | Best fit for "small useful tool" coverage; high amplification; routinely picks up no-auth public APIs |
| 2 | swyx (Latent Space) | Twitter DM + Latent Space tip form | The protocol/registry beat is exactly his editorial voice; covers MCP regularly |
| 3 | Hamel Husain | Twitter DM | Strong retweet network among ML eng practitioners; values "boring useful infra" framing |
| 4 | Justin Spahr-Summers | Twitter DM | MCP creator; gives concrete signal on whether our MCP shape is right |
| 5 | sindresorhus/awesome Discussions | GitHub Discussion | Awesome-list-2.0 framing reads as a credit + open question, not a pitch — most likely to start a real conversation |

---

## Ready-to-post checklist

- [ ] Confirm every handle in Tier 1–3 is still active (last post within
      30 days). Drop any that have gone quiet.
- [ ] Send Tier 1 DMs **the morning of the Show HN, before the post goes
      up**. Each gets a dated message; nobody likes "in case you missed
      it".
- [ ] Send Tier 2 (MCP ecosystem) within 30 minutes after the Show HN
      goes live, so the post is the proof point you can link.
- [ ] Send Tier 5 (adjacent-tool authors) PR-thread comments same day.
      These are highest-conversion because they already know the
      project.
- [ ] Submit Tier 7 newsletter forms once the Show HN has at least 20
      points or 30 minutes after posting (whichever first). Newsletters
      will not pick up a 0-point Show HN.
- [ ] Track responses in a private spreadsheet or `docs/marketing/
      launches/<date>-responses.md`. Capture handle, channel, sent-at,
      replied-at, outcome. This is the input to the post-launch retro.
- [ ] One-week silence = drop. Do not nag.
- [ ] Re-engage anyone who replied positively but didn't act, with new
      news, in 60–90 days. Material new news only.

## Prerequisites

- Show HN post must be live or scheduled before sending Tier 1.
- Twitter/X and Bluesky launch threads must be drafted and ready to fire
  same-day (so DM recipients have a consistent narrative to retweet).
- All `npm`, `PyPI`, MCP-Registry, and Marketplace listings must show
  the latest version. A DM that points at a stale package version
  burns the lead.
