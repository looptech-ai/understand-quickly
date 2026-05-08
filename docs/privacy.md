# Privacy notice — understand-quickly

> Plain-language. The registry is intentionally low-data; this page lists
> what's collected, what isn't, and how long anything sticks around.

## What the registry is

A static GitHub Pages site (`looptech-ai.github.io/understand-quickly`)
plus a JSON file (`registry.json`) of pointers to public knowledge
graphs. It is not an account-based service. There is no login, no user
profile, no per-user state.

## What is collected

| Surface | Data | Retention |
| --- | --- | --- |
| GitHub Pages access logs | IP, User-Agent, requested URL, timestamp | Per [GitHub's privacy policy](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement) — typically 30 days |
| Cloudflare Web Analytics | URL, referrer, anonymized country, device class | 6 months (Cloudflare default); IP is dropped at edge |
| GitHub Issues / Discussions / PRs | Whatever you type into them | Public + indefinite (unless you delete) |
| `registry.json` entries | The fields you submit (`id`, `owner`, `repo`, `format`, `graph_url`, `description`, `tags`) | Public + indefinite (unless you remove your entry) |
| Producer-submitted graph bodies | Cached `last_sha`, `nodes_count`, `edges_count`, `top_kinds`, `languages` (no full body, no source code) | Public + indefinite |

## What is NOT collected

- No cookies (Cloudflare Analytics is cookieless).
- No localStorage / sessionStorage user data — site UI state lives only
  in URL fragments you control.
- No telemetry from the CLI (`npx @understand-quickly/cli add`) or MCP
  server beyond the dispatch you explicitly configure.
- No fingerprinting, no canvas/WebGL probes, no behavioural tracking.

## Third parties

- **GitHub** hosts the repo, the Pages site, and serves graph bodies via
  `raw.githubusercontent.com`. GitHub sees every fetch.
- **Cloudflare Web Analytics** is loaded on the site for traffic counts.
  Their snippet is the only third-party JS the site loads (vendored
  vis-network is served from the same origin). The CSP `<meta>` tag on
  every page restricts external script sources to exactly that endpoint.
- **Google Fonts** serves Inter, DM Serif Display, and JetBrains Mono.
  Browsers fetch the font files directly from `fonts.gstatic.com`.

## Your data, your call

You own what you submit. Specifically:

- **Remove your entry**: open a PR deleting the row from `registry.json`
  or open the [Add my repo](https://github.com/looptech-ai/understand-quickly/issues/new?template=add-repo.yml)
  template and ask. We'll remove it within one nightly sync cycle.
- **Withdraw a producer-side dispatch**: just stop firing
  `repository_dispatch` and revoke the PAT. The registry's nightly sync
  will move the entry to `missing` after the graph URL 404s.
- **GDPR / CCPA** rights: there is no PII in the registry to subject
  request. Logs at GitHub and Cloudflare are governed by their
  respective privacy policies.

## Children

The registry is not intended for use by children under 13. Don't submit
your kid's repo without their meaningful involvement.

## Changes

This notice is versioned in git. Material changes are flagged in
`CHANGELOG.md` and announced in the [Discussions](https://github.com/looptech-ai/understand-quickly/discussions).

Last updated: 2026-05-08.

---

Questions: open an issue or email <Alex.Mac@LoopTech.AI>.
