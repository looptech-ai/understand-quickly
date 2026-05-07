# understand-quickly — Registry Design

**Date:** 2026-05-07
**Status:** Approved (brainstorming complete, awaiting implementation plan)
**Owner:** Mac (amacsmith)

## 1. Problem

Tools like `Lum1104/Understand-Anything` produce a per-repo knowledge graph (JSON) by running a multi-agent pipeline locally. Each repo's graph is useful to AI research agents and humans, but today there is no shared, machine-readable index of which repos have a current graph and where to fetch it. DeepWiki solves a similar problem with a hosted server-side pipeline; nothing solves it for the "user runs the tool locally and commits the result" flow.

## 2. Goal

Provide a single, public, machine-readable registry that tells an AI agent (or human) which GitHub repos publish a code-knowledge graph, in what format, and how to fetch the latest version — without running any backend or LLM compute on the registry side.

## 3. Non-Goals

- Hosting the graph JSON ourselves (pointer-only, no mirroring in MVP).
- Running the analysis pipeline on behalf of users.
- Authentication, accounts, billing, rate-limited APIs.
- A rich web UI / embedded graph viewer (post-MVP, separate spec).
- Supporting private repos (MVP is public-only).

## 4. Audience

- **Primary:** AI research agents that want canonical, current, schema-validated pointers to per-repo knowledge graphs.
- **Secondary:** Humans browsing a curated list of repos that have published graphs.
- **Tertiary:** Tooling authors emitting code-knowledge graphs in similar formats (GitNexus, code-review-graph) who want their users discoverable.

## 5. Architecture

Single GitHub repo `understand-quickly/registry`. Git is storage. Actions are the only compute. GitHub raw is the distribution CDN. No server, no DB.

```
understand-quickly/registry/
  registry.json          # canonical index, sorted by id
  schemas/               # one JSON Schema per supported graph format
    understand-anything@1.json
    gitnexus@1.json
    generic@1.json
    __fixtures__/<format>/{ok,bad}.json
  scripts/               # Node, deps: ajv, octokit
    validate.mjs
    sync.mjs
    render-readme.mjs
    __tests__/*.test.mjs
  README.md              # auto-rendered between markers
  .github/workflows/
    validate.yml         # PR check
    sync.yml             # nightly cron + repository_dispatch
    render.yml           # README regen on registry.json change
  docs/
    publish-template.yml # copy-paste for source repos
```

## 6. `registry.json` Schema

```json
{
  "schema_version": 1,
  "generated_at": "ISO-8601 UTC",
  "entries": [
    {
      "id": "owner/repo",
      "owner": "string",
      "repo": "string",
      "default_branch": "string (default 'main')",
      "format": "<name>@<int>",
      "graph_url": "https raw URL",
      "description": "short free-form text (<= 200 chars)",
      "tags": ["string", "..."],
      "added_at": "ISO-8601 UTC",
      "last_synced": "ISO-8601 UTC | null",
      "last_sha": "sha256 hex of fetched body | null",
      "size_bytes": "int | null",
      "status": "ok | missing | invalid | oversize | transient_error | dead | renamed",
      "last_error": "string | null",
      "miss_count": "int (default 0)",
      "renamed_to": "owner/repo | null"
    }
  ]
}
```

Required at PR time: `id`, `owner`, `repo`, `format`, `graph_url`, `description`. Server-derived (PR must omit or use defaults): `added_at`, `last_synced`, `last_sha`, `size_bytes`, `status`, `last_error`, `miss_count`, `renamed_to`.

## 7. Supported Formats (MVP)

- `understand-anything@1` — schema mirrors `Lum1104/Understand-Anything` `knowledge-graph.json`.
- `gitnexus@1` — stub schema; loose validation for parity.
- `generic@1` — minimal `{nodes: [], edges: []}` for unknown emitters.

New formats added by PRing a `schemas/<name>@<int>.json` plus `ok` + `bad` fixture under `schemas/__fixtures__/<name>/`.

## 8. Components

### 8.1 `scripts/validate.mjs`
- Load `registry.json`, validate against meta-schema (ajv).
- Detect `id` collisions.
- For each entry new or changed in this PR diff: `HEAD graph_url`; require 200; require `Content-Length <= 50 MB`; `GET`; validate body against `schemas/<format>.json`.
- Output PR-comment-friendly summary; exit non-zero on any failure.

### 8.2 `scripts/sync.mjs`
- Iterate every entry (or single `--only <id>`).
- Send `If-None-Match` with the previous response ETag if known (transport-level optimization; ETag is not persisted in `registry.json`).
- 304 Not Modified → update only `last_synced`.
- 200 → GET body; compute sha256(body); compare to `last_sha`. New sha → validate, update `last_sha`, `last_synced`, `size_bytes`, `status=ok`. Same sha → update only `last_synced`.
- 404 → `miss_count++`; if `>= 7` → `status=dead`.
- 5xx / timeout → retry 2× with backoff; persistent → `status=transient_error`, `last_error=<reason>`. Do not increment `miss_count`.
- Schema invalid → `status=invalid`, `last_error=<ajv summary>`. Do not bump `last_sha`.
- Size > 50 MB → `status=oversize`, skip body.
- Total request budget per run: 5000 (well under GitHub raw limits at MVP scale).
- On any change, commit to `main` with message `chore(sync): update <n> entries`.

### 8.3 `scripts/render-readme.mjs`
- Reads `registry.json`.
- Replaces content between `<!-- BEGIN ENTRIES -->` and `<!-- END ENTRIES -->` markers in `README.md` with a sorted markdown table: `id | format | description | status | last_synced`.
- Idempotent: re-run on unchanged input produces zero diff.

### 8.4 Workflows

`validate.yml`
- Trigger: `pull_request` on paths `registry.json`, `schemas/**`, `scripts/**`.
- Runs `scripts/validate.mjs`.
- Required check on `main` branch protection.

`sync.yml`
- Trigger: `schedule: cron '0 3 * * *'` and `repository_dispatch: types: [sync-entry]` and `workflow_dispatch` (with optional `id` input + `revalidate` flag).
- Runs `scripts/sync.mjs` (or `--only` from dispatch payload).
- Commits + pushes to `main` if dirty.
- `concurrency: group: sync-${{ github.event.client_payload.id || 'all' }}, cancel-in-progress: false`.

`render.yml`
- Trigger: `push` to `main` on path `registry.json`.
- Runs `scripts/render-readme.mjs`, commits if README changed.
- Skips if commit author is `github-actions[bot]` and last commit message starts with `docs(readme):` (loop guard).

### 8.5 Source-repo opt-in dispatch helper
Shipped as `docs/publish-template.yml`. User copies into their repo as `.github/workflows/understand-quickly-publish.yml`:

```yaml
name: understand-quickly publish
on:
  push:
    branches: [main]
    paths: ['.understand-anything/**']
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.UNDERSTAND_QUICKLY_TOKEN }}
          repository: understand-quickly/registry
          event-type: sync-entry
          client-payload: '{"id":"${{ github.repository }}"}'
```

`UNDERSTAND_QUICKLY_TOKEN` is a fine-grained PAT scoped only to `repository_dispatch` on the registry repo. Compromise risk = spam, not data corruption.

## 9. Data Flow

### Flow A — Register (PR)
1. Contributor forks registry, appends entry to `registry.json` (server-derived fields omitted).
2. Opens PR; `validate.yml` runs.
3. Maintainer reviews + merges.
4. `render.yml` updates README on `main`.

### Flow B — Nightly resync
1. Cron `0 3 * * *` UTC fires `sync.yml`.
2. `sync.mjs` walks every entry per Section 8.2.
3. Commits diff; `render.yml` regenerates README.

### Flow C — On-demand resync
1. Source-repo push touches `.understand-anything/**`.
2. Source workflow sends `repository_dispatch` event `sync-entry` with `id`.
3. Registry `sync.yml` runs `sync.mjs --only <id>`.
4. Commits if changed.

### Flow D — Agent fetch
1. `GET https://raw.githubusercontent.com/understand-quickly/registry/main/registry.json`.
2. Filter entries where `status=ok`.
3. `GET entry.graph_url`.
4. Cache key = `entry.last_sha`.

### Flow E — Future MCP (post-MVP, separate repo)
- `mcp.list_repos({tag?})` reads cached `registry.json`.
- `mcp.get_graph({id})` fetches `entry.graph_url`.
- `mcp.search_concepts({q,id?})` substring search across nodes.

## 10. Error Handling

PR-time failures fail the check with a comment:
- Invalid JSON, meta-schema mismatch, `id` collision, `graph_url` HEAD ≠ 200, body > 50 MB, unknown `format`, body fails declared schema (first 5 ajv errors shown).

Sync-time failures never fail the workflow; they are persisted on the entry:
- 404 → `miss_count++`; ≥7 → `dead` (entry retained).
- 5xx / timeout → `transient_error`.
- Rate-limited → sleep + resume.
- Schema invalid → `invalid`; do not advance `last_sha`.
- Oversize → skip body, mark `oversize`.

Lifecycle:
- Source repo deleted → `dead` after 7 days.
- Source repo renamed → maintainer PRs `id` migration; old `id` retained with `status=renamed`, `renamed_to=<new>`.

Agent contract (documented in README):
- Skip entries where `status != "ok"`.
- If `last_synced` older than 7 days, fetch `graph_url` directly without trusting the index.

Maintainer escape hatches:
- `workflow_dispatch` on `sync.yml` with `id` for one-entry resync.
- `workflow_dispatch` with `revalidate=true` after schema upgrade.

## 11. Testing

Unit tests under `scripts/__tests__/` using `node:test` runner; deps limited to `ajv`. Coverage target ≥ 90% on `scripts/`, enforced via `c8 --check-coverage`.

| Target | Cases |
|---|---|
| `validate.mjs` | valid passes; missing field fails; bad URL fails; duplicate `id` fails; unknown `format` fails; oversize rejected |
| `sync.mjs` | new body-sha updates `last_sha`; same body-sha bumps only `last_synced`; 304 short-circuits to `last_synced`-only; 404 increments `miss_count`; 7th miss → `dead`; schema-fail → `invalid` and leaves `last_sha`; timeout retried then `transient_error` |
| `render-readme.mjs` | full table; honors markers; idempotent |
| schemas | each ships an `ok` + `bad` fixture |

Integration test: local `node:http` server serves fixture graphs (200, 404, 500, malformed); `sync.mjs` runs against fixture `registry.json` pointing at `localhost`; resulting diff snapshotted.

Smoke job: nightly `--dry-run` against `tests/registry-smoke.json` (three known-good public repos); diff posted to job summary, never committed.

PR-required check: `validate.yml`. Branch protection on `main` blocks merges without it.

Out of scope: testing GitHub raw CDN, ajv internals, README rendering beyond marker contiguity.

## 12. Risks & Open Questions

- **`registry.json` size**: at 10k entries (~1 KB each) the file is ~10 MB. Plan: split alphabetically into `entries/<a-z>.json` with a thin top-level `registry.json` index. Defer until > 1k entries.
- **Spam PRs**: relying on maintainer review. Adding `CODEOWNERS` plus a Danger-style PR linter keeps overhead manageable.
- **Schema drift in upstream tools**: each `format` is versioned (`@1`, `@2`); breaking changes require new format entry, not a mutation.
- **Discoverability**: launch needs at least the project's own graph as entry zero, plus 2-3 hand-picked seed repos.
- **MCP wrapper**: explicitly post-MVP. Spec lives in a separate doc when scheduled.

## 13. Out-of-Scope (Post-MVP Backlog)

- Static GitHub Pages dashboard.
- Embedded graph viewer.
- MCP server.
- Per-entry semantic search.
- Mirror-as-fallback storage.
- Private-repo support (likely needs hosted backend; revisit only if demand).
