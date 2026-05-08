# Threat Model

`understand-quickly` is a registry of pointers to code-knowledge graphs. The
registry itself is small and auditable, but the graphs it points at are
fetched from third-party origins and consumed by AI agents. That means the
attack surface includes everything between an adversarial publisher and an
agent that trusts the resulting graph.

This document enumerates the concrete threats we've thought about, what we do
about them today, and where the work is going. It is intentionally short:
short enough to keep up to date.

## Trust boundaries

```
publisher repo  ─►  graph_url (raw.githubusercontent / pages / CDN)
                       │
                       ▼
                 sync.mjs (this repo, GitHub Actions)
                       │
                       ▼
                 registry.json (pinned + signed by Git history)
                       │
                       ▼
                 agent / MCP / human reader
```

Three hops, three different trust assumptions:

- **Publisher → graph_url**: we trust the publisher's own repo. If they push
  garbage, the graph is garbage.
- **graph_url → sync.mjs**: we treat anything on the wire as hostile. Schema
  validation, body-size caps, structural caps.
- **sync.mjs → consumer**: we trust the registry-history-of-record. Consumers
  pin by `last_sha` for reproducibility.

## Threats

### 1. Adversarial graph (poisoned labels, schema bomb)

- **Vector**: a publisher (or a compromised publisher) ships a body that's
  syntactically valid JSON but pathologically shaped — a million-element
  `nodes` array, multi-megabyte `label` strings, deeply-nested objects
  designed to OOM or stack-overflow downstream consumers.
- **Impact**: agent processes crash, downstream tools (Ajv, layout engines,
  `vis-network`) time out, prompt injection via crafted labels.
- **Today's mitigation**:
  - Hard byte cap: 50 MB, enforced by `Content-Length` HEAD then again on the
    GET response.
  - Structural caps in `validateBodyLimits` (see `scripts/extract.mjs`):
    `nodes_count > 100000` → `oversize`, `edges_count > 500000` → `oversize`,
    any label > 4096 chars → `invalid`, JSON tree depth > 32 → `invalid`
    (caught with an iterative DFS so a schema bomb can't blow our own stack).
  - Schema validation per format. `top_kinds` and `languages` are capped at
    10 entries each in `meta.schema.json`.
- **Future mitigation**:
  - Per-publisher quotas (max bytes/day across all entries owned by an org).
  - Sandboxed graph-rendering on the site (vis-network in a worker, CSP
    locked down).
  - Optional content-scanning step that flags labels containing known
    prompt-injection markers.

### 2. Registry-spam publisher

- **Vector**: someone files dozens of low-quality entries to bury the index,
  inflate stats, or squat well-known repo names.
- **Impact**: signal-to-noise erodes; legitimate repos get harder to find.
- **Today's mitigation**:
  - Every entry is a PR; `validate.mjs` runs on every PR; humans review.
  - `id` is `<owner>/<repo>` which prevents pure name-squatting unless the
    publisher actually owns that repo.
  - `dead` status after 7 consecutive misses surfaces abandoned entries.
- **Future mitigation**:
  - Verified-publisher path: a publisher proves repo ownership (e.g. by
    pushing a sentinel file to a well-known path under `.well-known/`) and
    earns a `verified: true` badge that's visible in the site UI.
  - Rate-limit by org on the `add.html` wizard backend.

### 3. Dead-link in graph

- **Vector**: a graph references a URL or sub-resource that no longer
  resolves (404, DNS gone, the publisher renamed their repo without
  redirecting).
- **Impact**: agents waste time on broken links; the registry looks stale.
- **Today's mitigation**:
  - `miss_count` increments on every 404 sync; entries flip to `missing` and
    eventually `dead` (≥ 7 consecutive misses).
  - GitHub repo renames are surfaced via the `renamed` status (with
    `renamed_to` pointer for the agent to follow).
- **Future mitigation**:
  - Periodic broader link-checking inside graph bodies (today we only check
    `graph_url` itself, not URLs embedded in node properties).

### 4. Source-repo takeover

- **Vector**: an attacker takes over the publisher's GitHub account or a
  repo they own (credentials compromised, employee leaves, repo transferred)
  and starts shipping a malicious graph at the same `graph_url`.
- **Impact**: the cached `last_sha` will diverge — but only after the next
  sync, and consumers who don't pin by sha will pick up the malicious body
  immediately.
- **Today's mitigation**:
  - `last_sha` is sha256 of the response body, recorded in registry-history.
    A consumer that pins to a previously-trusted sha is safe.
  - `source_sha` (producer-supplied, sniffed from graph metadata) +
    `commits_behind` (sync-time, via the unauthenticated GitHub compare API)
    surface "this graph claims to describe commit X, but the repo is N
    commits ahead" — a sudden divergence is visible in the UI.
  - Maintainer-only `revoked` status (see `meta.schema.json#status` enum):
    if a takeover is reported, a maintainer flips the entry to `revoked` and
    the sync skips fetch + leaves the entry frozen until un-revoked.
    Agents MUST NOT consume `revoked` entries.
- **Future mitigation**:
  - Verified-publisher path with rotating signing keys; graphs get a
    detached signature at `<graph_url>.sig` and sync verifies before storing.
  - Webhook from GitHub that auto-revokes any entry on a transferred repo.

### 5. Stale-but-valid graph

- **Vector**: the source repo moves on (months of new commits) but the
  pinned graph is still schema-valid against an old commit. Agents act on
  outdated structure.
- **Impact**: confidently-wrong answers — the worst kind.
- **Today's mitigation**:
  - `commits_behind` and `head_sha` (set by `checkDrift` in `sync.mjs`) tell
    consumers exactly how stale the graph is. `drift_checked_at` distinguishes
    "we tried" from "never tried".
  - Soft per-run budget (`DRIFT_BATCH = 25`) on the unauthenticated GitHub
    REST API (60 req/hr/IP) with rotation via `last_drift_index` so a 1k
    registry still gets full coverage every ~40 runs.
  - Optional `repository_dispatch` instant-refresh path for publishers who
    care about freshness (see `docs/publish-template.yml`).
- **Future mitigation**:
  - UI threshold that flags entries with `commits_behind > N` as stale.
  - Authenticated GitHub calls (using the registry's own `GITHUB_TOKEN`)
    raise the budget from 60/hr to 5000/hr and lift the rotation cap.

### 6. Compromised CDN (vis-network from unpkg)

- **Vector**: the static site loads `vis-network` from a public CDN
  (unpkg / jsdelivr). If the CDN is compromised, an attacker injects JS into
  every site visitor.
- **Impact**: full XSS in the registry site; attacker reads any cookies,
  redirects clicks, exfiltrates clipboard contents on the wizard page.
- **Today's mitigation**:
  - Site is fully static, no auth, no cookies of value. Worst-case is a
    redirect or a fake "submit" button — bad, but bounded.
- **Future mitigation**:
  - Subresource Integrity (SRI) hashes on every external `<script>`.
  - Self-host the visualization library under `site/vendor/`. Removes the
    CDN entirely from the trust path.
  - Strict CSP header on GitHub Pages (or fronted with Cloudflare Workers).

## Cross-cutting controls

- **Body caps**: enforced post-parse in `validateBodyLimits` — a small body
  with a hostile shape still fails closed. See `scripts/extract.mjs`.
- **Revoked status**: maintainer-only retraction. Set the entry's status to
  `revoked` and sync skips the network entirely on every subsequent run; the
  entry is frozen with whatever `last_sha` it had at the time. Agents are
  expected to filter on `status === 'ok'` and the schema explicitly notes
  that `revoked` MUST NOT be consumed.
- **Verified-publisher path**: not yet shipped, but the data model already
  has a place for it (`tags` + a future top-level `verified` field). The
  goal is "minimal: a publisher proves repo ownership once, gets a badge,
  stops needing a maintainer to vouch for them on every PR".

## Reporting

Security issues that aren't safe to discuss in public: see
[`SECURITY.md`](../SECURITY.md). Please don't file them as issues.
