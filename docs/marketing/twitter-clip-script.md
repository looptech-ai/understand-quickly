# Twitter / X clip script

A 30-second screen recording. Mute audio. Captions burned in (Twitter
auto-captions are unreliable; bake them in with ffmpeg or your editor).

Aspect: 16:9, 1920x1080, 30 fps. Twitter re-encodes hard, so deliver
high-bitrate H.264 (~12 Mbps) to survive the squeeze.

## Storyboard

| Time   | Visual                                                         | Caption (burned-in)                                                 |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0–3s   | Black title card, white text, no logo.                         | "AI agents shouldn't re-extract every public repo. Use a registry." |
| 3–10s  | Terminal. Live `curl https://looptech-ai.github.io/understand-quickly/registry.json \| jq` — output scrolls. | "One curl. The whole API."                                          |
| 10–20s | Browser at https://looptech-ai.github.io/understand-quickly/. Click an entry tile. Graph fades in. Hover a node — focus highlight. | "Browse. Click. Read the graph."                                    |
| 20–27s | Tour panel auto-advances through 3 nodes. Pan the graph slightly between each step. | "Guided tours per entry."                                           |
| 27–30s | Final card. Black, white text.                                 | "looptech-ai/understand-quickly · MIT · zero cost"                  |

Production notes:

- Record at native 1920x1080. Down-scaling beats up-scaling.
- Hide the dock, browser bookmarks bar, and any work tabs.
- Use a clean terminal theme (white-on-black or solarized; no
  prompt-bling, no powerline glyphs that won't render in Twitter's
  re-encode).
- For the curl step, pre-warm DNS and cache so output appears within
  ~1s of Enter. Edit out latency.
- Caption font: **Inter Bold** or **SF Pro Display Bold**, 56pt,
  white with 2px black stroke and a 30%-opacity black drop shadow.
  Survives mobile autoplay-without-sound.
- No music. Music gets clipped on autoplay anyway and adds zero.

## Tweet copy (primary)

```
Agent-native registry of code-knowledge graphs. Curl one URL, get
fresh structured maps of public repos. MIT, zero infra, 4 formats
live.

https://looptech-ai.github.io/understand-quickly/
```

(~225 chars, leaves room for a media attachment + the link card.)

## Reply thread (3 tweets, posted 60s apart)

**Reply 1 — why**

```
Why we built it: every agent re-extracts the same graph for the same
public repo on every run. That's slow, wasteful, and inconsistent
across tools. A shared registry fixes the coordination problem.
```

**Reply 2 — how**

```
How it works:
- Public Pages site serves registry.json
- Nightly sync + repository_dispatch for instant refresh
- Drift detection vs HEAD flags stale entries
- 4 formats: Understand-Anything, GitNexus, code-review-graph, bundle@1
```

**Reply 3 — ask**

```
What we need:
- Agent builders: tell us what would make you wire this in
- Format authors: PRs welcome to add a schema
- Everyone else: opinions in Discussions

https://github.com/looptech-ai/understand-quickly/discussions
```

## Tagging strategy

Candidates: `@AnthropicAI` `@swyx` `@karpathy` `@simonw` `@kentcdodds`.

**Rule: tag at most 2 in the primary tweet.** More than that reads as
needy and gets ratio'd. Pick the two whose audiences are most likely
to convert (agent-builders, infra people). For this launch:

- Primary tweet: `@simonw` and `@swyx` (both write actively about
  agent infra and have engaged audiences who will reply, not just
  like).
- Mention `@AnthropicAI` `@karpathy` `@kentcdodds` only if they
  organically engage first — never tag them cold in a launch tweet.

Do not tag from the reply thread. Replies-with-tags read as bait.

## Posting time

Coordinate with the Show HN post (see `show-hn-draft.md`). Best
sequence:

1. **T+0:00** — Submit Show HN.
2. **T+0:15** — Post Twitter clip. Reference the HN thread by URL in
   the third reply ("discussion: news.ycombinator.com/item?id=…").
3. **T+0:30** — Cross-post Twitter clip to LinkedIn (same copy, drop
   the @-tags).

Ordering matters: HN first means early Twitter engagement drives HN
upvotes from people who arrived via Twitter. Reverse order leaks the
launch before HN can pick it up.
