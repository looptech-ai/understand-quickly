# Producer integration protocol

This document is the canonical contract for tools that emit code-knowledge graphs and want their users' graphs to appear in [`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly) automatically.

It is written for the **maintainers of upstream tools** (Understand-Anything, GitNexus, code-review-graph, and any future producer). End users of those tools follow the [wizard](https://looptech-ai.github.io/understand-quickly/add.html) or `npx @understand-quickly/cli add` — they should never need to read this file.

## 1. What this gives upstream tools

Wiring a `--publish` flag (or equivalent) into your tool gets your users four things for free: **discoverability** in `looptech-ai/understand-quickly`, **zero hosting cost** (the graph stays in the user's own repo and is fetched from `raw.githubusercontent.com`), **drift detection** so agents know when a graph is stale relative to its source commit, and **agent-consumable output** via the registry's MCP server and stable `registry.json` API. None of this requires the upstream tool to operate any infrastructure — the registry only stores pointers.

## 2. Contract surface

A producer is anything that, given a source repo, writes a JSON graph file. To be consumable by `understand-quickly`, a producer **MUST**:

- **Emit a single JSON file at a stable, raw-fetchable path** in the user's repo. By convention, use a hidden directory keyed to the tool name:
  - Understand-Anything: `.understand-anything/knowledge-graph.json`
  - GitNexus: `.gitnexus/graph.json`
  - code-review-graph: `.crg/graph.json`
  - new tools: `.<tool-slug>/graph.json` (or similar)
- **Conform to a registered format schema.** The format is identified by a `<name>@<int>` slug (e.g. `understand-anything@1`) backed by a JSON Schema at `schemas/<name>@<int>.json` in this repo. Adding a new format is a PR — see [§7](#7-format-authoring). Repo-context **packers** (Repomix, gitingest, codebase-digest, and similar tools that emit a packed-text dump rather than a node/edge graph) target the [`bundle@1`](../../schemas/bundle@1.json) format: a small JSON pointer with a `manifest` block plus a `content_url` for the raw markdown/xml/plaintext body.
- **Be ≤ 50 MB.** Larger files are not fetched; the entry will be marked `oversize`.

A producer **SHOULD**:

- **Embed `metadata.commit` (or `source_sha`) at generation time.** This is a 40-hex git sha of `HEAD` when the graph was built. The registry uses it for drift detection — without it, agents can still consume the graph but cannot tell whether it is current.
- **Embed `metadata.tool_version` and `metadata.generated_at`** for audit trails. `generated_at` is ISO-8601; `tool_version` is whatever your release sentinel is (`semver`, git describe, etc.).
- **Embed `metadata.tool`** as a literal string identifying your tool. The first-class schemas already require this (e.g. `metadata.tool == "understand-anything"`).

A minimal compliant graph file:

```json
{
  "nodes": [{ "id": "f1", "kind": "file", "label": "src/main.ts" }],
  "edges": [],
  "metadata": {
    "tool": "understand-anything",
    "tool_version": "0.4.2",
    "generated_at": "2026-05-08T12:00:00Z",
    "commit": "1234567890abcdef1234567890abcdef12345678"
  }
}
```

## 3. One-shot publish (user-facing)

There are three paths your tool's docs can advertise to its users. Pick whichever maps best to your audience — they are equivalent.

1. **CLI (recommended).** `npx @understand-quickly/cli add` — auto-detects the graph file, format, and repo metadata, opens a PR against the registry. Zero config.
2. **Wizard.** `https://looptech-ai.github.io/understand-quickly/add.html` — fills the `add-repo` issue template; the registry bot opens the PR.
3. **Manual PR.** Append an entry to `registry.json`. Steps in the registry [`CONTRIBUTING.md`](../../CONTRIBUTING.md#1-add-your-repo-to-the-registry).

After the entry lands, the registry's nightly sync resolves it. To get instant refresh on every push, the user (or your tool) sets up the auto-publish workflow in §4 / §5.

## 4. Auto-publish (tool-side)

The recommended pattern: when your tool runs with `--publish` (or your equivalent — `--publish-to-uq`, `--register`, etc.), it does two things:

1. **Write the graph file to its conventional path.** Same as a normal run; nothing special.
2. **Optionally fire a `repository_dispatch` event** at the registry to ask for an instant resync. This step is gated on a `UNDERSTAND_QUICKLY_TOKEN` being set in the environment — if it's not present, fall through silently with an informational message and let the nightly sync pick the change up.

The dispatch payload, with `gh`:

```bash
gh api repos/looptech-ai/understand-quickly/dispatches \
  -f event_type=sync-entry \
  -f client_payload[id]="$OWNER/$REPO"
```

Or with raw `curl`:

```bash
curl -fsSL -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $UNDERSTAND_QUICKLY_TOKEN" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/looptech-ai/understand-quickly/dispatches \
  -d "{\"event_type\":\"sync-entry\",\"client_payload\":{\"id\":\"$OWNER/$REPO\"}}"
```

The `id` field MUST match the `id` in `registry.json` (i.e. `owner/repo` shape). If the id is not yet registered, the sync workflow will no-op and log that the entry was unknown — your tool should treat that case as a soft failure and surface a one-line message pointing the user at the wizard or CLI:

```
[understand-quickly] this repo is not yet registered.
[understand-quickly] register it once with: npx @understand-quickly/cli add
[understand-quickly] or use the wizard: https://looptech-ai.github.io/understand-quickly/add.html
```

## 5. CI integration (recommended)

Most users will not run `--publish` locally. The reliable path is a GitHub Action that fires the dispatch on every push that touches the graph file.

The first-class integration is the **[`looptech-ai/uq-publish-action`](https://github.com/looptech-ai/uq-publish-action)** Marketplace Action. It stamps `metadata.{tool, tool_version, generated_at, commit}` into the graph and posts the `sync-entry` dispatch in one step. The full snippet at [`sample-publish-workflow.yml`](./sample-publish-workflow.yml) drops into the user's repo as `.github/workflows/understand-quickly-publish.yml` — the publish step itself is five lines:

```yaml
- uses: looptech-ai/uq-publish-action@v0.1.0
  with:
    graph-path: '.understand-anything/knowledge-graph.json'
    format: 'understand-anything@1'
    token: ${{ secrets.UNDERSTAND_QUICKLY_TOKEN }}
```

### PAT setup

`UNDERSTAND_QUICKLY_TOKEN` is a **fine-grained** GitHub PAT with a single permission:

- **Repository access:** `looptech-ai/understand-quickly` only.
- **Permissions:** `Contents: read`, `Metadata: read`, **`Repository dispatches: write`**. (Nothing else.)

The user adds the PAT as a repo secret in their own repository (`Settings → Secrets and variables → Actions`). The Action consumes it via the `token` input. No write access to the registry is needed; the registry only listens for the `sync-entry` event type.

### Fallback: raw dispatch

For environments that can't use Marketplace Actions (private runners with restricted egress, non-GitHub CI), use the raw dispatch from §4 directly. Either `gh api repos/looptech-ai/understand-quickly/dispatches ...` or a plain `curl -X POST` against the same endpoint works; the Action is a thin wrapper around exactly that call plus metadata stamping.

## 6. Becoming a verified publisher

Verified publishers get auto-merge on registry-only PRs. The process:

1. Open an issue on `looptech-ai/understand-quickly` with the `verified-publisher-request` label. (Use the **Verified publisher request** issue template if present.)
2. Demonstrate adoption: at least **3 unrelated public repos** using the integration end-to-end (graph file committed + entry in `registry.json` + ideally the publish workflow installed).
3. A maintainer reviews and adds your `id` to [`docs/verified-publishers.json`](../verified-publishers.json) in a follow-up PR.

Once on the allowlist, any future PR that **only adds** new entries with allowlisted ids and that passes `validate` is auto-merged. Edits, renames, and deletions still require human review. See [`docs/verified-publishers.md`](../verified-publishers.md) for the full policy.

## 7. Format authoring

If your tool's existing JSON shape doesn't match any first-class format, the protocol is to **PR a new schema**:

1. Add `schemas/<name>@<int>.json`. JSON Schema **draft 2020-12**. Use the existing schemas (`understand-anything@1`, `gitnexus@1`, `code-review-graph@1`) as a template. Names are slug-ish: `my-tool@1`, not `My Tool v1`.
2. Add fixtures under `schemas/__fixtures__/<name>/`:
   - `ok.json` — a minimal example that should validate.
   - `bad.json` — an example that should fail validation.
   - `real-sample.json` (best-effort) — a real graph emitted by your tool, copied verbatim.
3. Add a row to the **Supported formats** table in `README.md` with `Format`, `Source tool`, and `Tier` (`first-class` if there is an upstream tool that emits it; `fallback` otherwise).
4. Run `npm test` locally. The suite compiles each schema with ajv and checks `ok` / `bad` fixtures.

Full instructions in [`CONTRIBUTING.md`](../../CONTRIBUTING.md#2-add-a-new-graph-format).

## 8. Backward-compat policy

- **Schemas use `@<int>` versioning.** `understand-anything@1`, `understand-anything@2`, etc.
- **Breaking changes ship as a new format**, not as a mutation of the existing schema. `@1` is frozen the moment a real consumer relies on it.
- **Producers can advertise multiple formats simultaneously.** A tool that supports both `@1` and `@2` writes both files (e.g. at `.tool/graph-v1.json` and `.tool/graph-v2.json`) and registers two entries, one per format. Agents pick whichever they prefer.
- **Schemas are forward-compatible by default.** Schemas allow unknown properties unless explicitly marked `additionalProperties: false`. Producers can add fields without bumping the version. Consumers MUST NOT reject graphs containing unknown fields.

## 9. Errors and observability

The registry sync workflow tolerates producer-side faults. For each entry, the public `registry.json` exposes a `status` and `last_error` field so producers can debug failures end-to-end:

| Status | Meaning | Producer action |
| --- | --- | --- |
| `ok` | Fetched, validated, current. | None. |
| `pending` | Registered but not yet synced. | Wait for the next sync run (≤ 24h, sooner with dispatch). |
| `missing` | 404 from `graph_url` in the last sync. | Verify the file exists at the URL, on the default branch, and the path matches the entry. |
| `invalid` | Fetched body failed schema validation. | Run the graph through `npm run validate` locally; fix the field that fails. |
| `oversize` | Graph exceeds 50 MB. | Slim the graph or split it; the registry will not fetch oversize bodies. |
| `transient_error` | Network or 5xx; will retry. | None unless persistent. |
| `dead` | 7+ consecutive misses. | Re-publish or open an issue to remove the entry. |
| `renamed` | Superseded by `renamed_to`. | Update tooling to point at the new id. |
| `revoked` | Maintainer-retracted. | Contact maintainers if this was unexpected. |

Drift fields (`source_sha`, `head_sha`, `commits_behind`, `drift_checked_at`) are populated only when the producer embeds a commit sha in graph metadata. If `commits_behind > 0`, the graph is stale relative to the source repo's default branch — agents may want to surface this to the user. If the producer omits the sha entirely, drift values stay `null` and the registry skips the check silently.

To debug a single entry without waiting for the nightly sync, fire the dispatch in §4 with the entry id; the workflow logs the per-entry result publicly under [Actions → sync](https://github.com/looptech-ai/understand-quickly/actions/workflows/sync.yml).

## 10. Embeddable status badge

Every registered entry gets a public SVG badge at:

  https://looptech-ai.github.io/understand-quickly/badges/<owner>--<repo>.svg

It updates on every sync. Status flips colors automatically. Wrap it in a link to the live entry view to give your README readers a one-click jump into the registry browser.

## 11. Discovery via `.well-known`

Producers MAY publish a `.well-known/code-graph.json` at their repo root. Agents will probe this path before falling back to the registry. This makes a producer's graph discoverable even if their repo isn't yet registered with us.

The full protocol spec lives at [`docs/spec/code-graph-protocol.md`](../spec/code-graph-protocol.md).

## 12. Licensing of submitted data

When a Producer ships a `--publish` flag, they are arranging for their users' graphs and bundles to be ingested by the registry. Each ingestion is governed by [`DATA-LICENSE.md`](../../DATA-LICENSE.md) — the **Understand-Quickly Data License 1.0**. In short:

- **What Users get.** Anyone may download, redistribute, and use Registry Data — including for AI/ML training, indexing, and commercial products. Users get this grant directly from the Licensor; the rights travel with any fork or extension of the Registry.
- **What Producers grant on submission (§4).** When a Producer's `--publish` flag fires `repository_dispatch`, the producer warrants that the submitter has the right to publish the linked graph/bundle, and grants the Registry's beneficiaries (Alex Macdonald-Smith and LoopTech.AI) the right to fetch, cache, redistribute, aggregate, and train on the linked artifact and its metadata. The same rights extend to all Users.
- **What Forkers grant (§3).** Anyone hosting a fork or extension of the Registry passes the same back-grant upstream to the beneficiaries.
- **What Producers should communicate to their own users.** A one-paragraph note in the `--publish` documentation pointing at this protocol and `DATA-LICENSE.md` is sufficient. The submission is opt-in (gated on the flag and a token), so users are never surprised. If your users' content is on a license that conflicts with §2 of `DATA-LICENSE.md`, the producer-side docs SHOULD recommend they not enable `--publish` for those repos.

Producers integrating today don't need to do anything extra beyond the §4 dispatch — the grant attaches automatically at the moment of submission. The relevant point for upstream review is that **enabling `--publish` is a deliberate, user-facing act** with documented downstream effects, not an invisible default.
