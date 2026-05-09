# Code-Knowledge-Graph Protocol (CKGP) v1

| | |
| --- | --- |
| Status | Draft |
| Version | 1 (`@1`) |
| Editors | Alex Macdonald-Smith (LoopTech.AI) |
| Source | <https://github.com/looptech-ai/understand-quickly/blob/main/docs/spec/code-graph-protocol.md> |
| Discussion | <https://github.com/looptech-ai/understand-quickly/discussions> |

## Abstract

This document specifies the **Code-Knowledge-Graph Protocol (CKGP)**, a vendor-neutral convention for publishing, discovering, and consuming machine-readable representations of source code repositories ("code-knowledge graphs"). CKGP defines (a) a `.well-known/code-graph.json` discovery file that producers publish at the root of a source repository, (b) the data shape of a producer-side discovery record, (c) the contract that an aggregator (a third-party indexer) MUST satisfy to participate in the protocol, and (d) the consumer-facing surface that AI agents and developer tools rely on. The protocol is implementation-agnostic: it does not mandate any specific graph schema, transport beyond HTTPS, or aggregator vendor.

## Status of this document

This is a draft specification. It is published under the [Apache License 2.0](https://github.com/looptech-ai/understand-quickly/blob/main/LICENSE) and the registry's [Data License 1.0](https://github.com/looptech-ai/understand-quickly/blob/main/DATA-LICENSE.md). Comments are welcomed via GitHub Discussions or pull requests against the repository above. The protocol is versioned at the document level (CKGP v1) and at the wire-format level (`<format>@<int>`). Breaking changes to the wire surface will be published as CKGP v2 with a parallel-publish migration window, never in place.

## 1. Introduction

### 1.1 Motivation

AI agents reading code today face a recurring problem: every codebase is presented as a tree of source files plus a smattering of human-targeted README prose. Useful structural information — call graphs, module dependencies, type relationships, ownership boundaries — is computed redundantly on every interaction, often by tools running in restricted environments without the depth to do it well. A growing class of producers (Understand-Anything, GitNexus, code-review-graph, Repomix, gitingest, codebase-digest, and more) already emit such structural information into JSON files. What is missing is a stable, machine-readable convention for **finding** those files, **identifying** their format, and **trusting** their freshness.

CKGP fills that gap with two layers:

1. A **discovery layer**: producers publish a small JSON pointer at `.well-known/code-graph.json` in their repo. Agents probe this path before doing anything else. No central authority is required for this layer — every repo speaks for itself.
2. An **aggregator layer**: third-party indexers (such as `looptech-ai/understand-quickly`) crawl producers, validate them, and publish a unified, queryable index. Aggregators are optional; multiple aggregators MAY coexist.

The two layers are deliberately separable. A repo with a valid `.well-known/code-graph.json` is consumable without ever appearing in any aggregator's index, and an aggregator is consumable without producers having to know the aggregator exists.

### 1.2 Scope

This document specifies:

- The on-disk layout and JSON shape of the producer-side discovery record.
- The HTTP serving conventions for the discovery record.
- The data contract an aggregator MUST satisfy to interoperate.
- Status taxonomy and drift-detection semantics.
- Versioning and backward-compatibility policy.
- Security considerations applicable to producers, aggregators, and consumers.

This document explicitly does NOT specify:

- The internal schema of any specific graph format. Each format (`understand-anything@1`, `gitnexus@1`, `code-review-graph@1`, `bundle@1`, etc.) is published as its own JSON Schema document under `schemas/<format>.json` in the registry repository, or wherever the format author hosts it.
- A centralized name authority for formats. Format names are first-come-first-served slugs; collision handling is by social convention and PR.
- Any particular consumer UX, API shape beyond the file URLs, or agent prompting strategy.

### 1.3 Relationship to existing standards

CKGP builds on the following IETF standards:

- **[RFC 8615](https://www.rfc-editor.org/rfc/rfc8615) — Well-Known URIs.** The `.well-known/` URI prefix is reserved for site-rooted metadata files. CKGP adopts this convention for the discovery record. Per RFC 8615 §3, a registered URI suffix is OPTIONAL when the URI is for a single-organization use case; CKGP is positioned as a community convention and does not currently request IANA registration. A future revision MAY register `code-graph` as a Well-Known URI suffix if industry adoption justifies it.
- **[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) / [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — Requirement levels.** The terms MUST, SHOULD, MAY, etc. in this document follow these RFCs (see §2.1 below).
- **[RFC 7231](https://www.rfc-editor.org/rfc/rfc7231) — HTTP/1.1 Semantics.** All transport in CKGP is HTTPS. Status codes, content negotiation, and caching directives have their normal HTTP meanings.
- **[RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) — JSON.** All wire bodies in CKGP are JSON. Producers MUST emit JSON that conforms to this RFC (UTF-8 encoded, no BOM RECOMMENDED).
- **[RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) — URI Generic Syntax.** All `_url` fields are absolute URIs with the `https` scheme.
- **[Semantic Versioning 2.0.0](https://semver.org/)** is referenced informatively for the optional `tool_version` field; producers MAY use any version string.

### 1.4 Reference implementation

A reference aggregator implementing this protocol is published at <https://github.com/looptech-ai/understand-quickly>. The implementation is not normative; the spec is. Where the reference and the spec disagree, the spec wins, and a defect MUST be filed against the implementation.

## 2. Conventions and terminology

### 2.1 Requirement levels

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they appear in all capitals as shown here.

### 2.2 Defined terms

- **Source repository** — A version-controlled directory of source code, typically hosted on a git forge such as GitHub, GitLab, Codeberg, or self-hosted Gitea. The unit of interest in CKGP is "the repository at HEAD of its default branch", though producers MAY publish records for tags or release commits.
- **Producer** — A tool that, given a source repository, emits a code-knowledge graph or context bundle. Examples: Understand-Anything, GitNexus, code-review-graph, Repomix, gitingest.
- **Graph** — A JSON document conforming to a registered format, describing some structural aspect of a source repository. The internal shape is not specified by CKGP; only the discovery and metadata surface are.
- **Format** — An identifier of the form `<name>@<int>`, e.g. `understand-anything@1`, `gitnexus@1`, `bundle@1`. The integer is a major version; minor and patch revisions of the same format are encoded as schema relaxations under the same `@<int>`.
- **Discovery record** — The JSON file published at `.well-known/code-graph.json` in a producer-controlled location (typically the repo root).
- **Aggregator** — A third-party service that crawls producers' discovery records, validates them, and exposes a unified index. Aggregators are OPTIONAL participants.
- **Consumer** — Any program (AI agent, IDE plugin, CLI tool, another aggregator) that reads either the producer's discovery record or an aggregator's index.
- **Drift** — The condition where a graph was generated against a commit that is no longer the HEAD of the source repository's default branch. CKGP does not require drift to be zero; it requires it to be detectable.

### 2.3 JSON conventions

- All JSON in CKGP is UTF-8 encoded ([RFC 8259 §8.1](https://www.rfc-editor.org/rfc/rfc8259#section-8.1)). A BOM is permitted but NOT RECOMMENDED.
- Fields documented as required MUST be present. Producers MAY include additional fields not specified here (forward-compatibility); consumers MUST ignore unknown fields rather than failing.
- Timestamps are ISO 8601 strings in UTC with the trailing `Z` (e.g. `2026-05-08T12:00:00Z`). Producers SHOULD truncate to second precision; consumers MUST accept fractional seconds.
- Commit shas are full 40-hex git object ids unless explicitly noted otherwise. Producers MUST NOT abbreviate.

## 3. Producer requirements

A **producer** is any tool that (a) examines a source repository and (b) emits a JSON document describing it.

### 3.1 Graph file location

A producer MUST write its graph output to a stable path in the source repository. The path SHOULD be hidden (`.<tool-slug>/<filename>`) so it does not pollute the user's working tree. Examples:

| Producer | Conventional path |
| --- | --- |
| Understand-Anything | `.understand-anything/knowledge-graph.json` |
| GitNexus | `.gitnexus/graph.json` |
| code-review-graph | `.crg/graph.json` |
| Repomix (bundle) | `.repomix/repomix-output.md` (with a `.repomix/repomix-output.bundle.json` wrapper) |

The path is a producer-side decision; CKGP does not enumerate it. The discovery record at `.well-known/code-graph.json` is what makes the path discoverable.

### 3.2 Graph file format

The graph file MUST be valid JSON ([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)) conforming to a registered format identifier. Producers MAY publish multiple graph files under a single repo, each declaring a different format; the discovery record (§4) describes all of them.

### 3.3 Required graph metadata

A producer MUST include a `metadata` object in the graph body (or, for `bundle@1`, in the JSON pointer's manifest). The `metadata` object SHOULD include:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `tool` | string | SHOULD | Stable slug identifying the producer (`"understand-anything"`, `"gitnexus"`, etc.). |
| `tool_version` | string | SHOULD | Producer version at generation time. SemVer is RECOMMENDED but not required. |
| `generated_at` | string (ISO 8601) | SHOULD | UTC timestamp when the graph was generated. |
| `commit` | string (40-hex) | SHOULD | Full git sha of HEAD when the graph was generated. Without this, drift detection is impossible and aggregators MUST set `commits_behind=null`. |

Producers that omit `metadata.commit` are conformant but degrade the consumer experience. Aggregators MUST NOT reject a graph for missing `metadata.commit`; they MUST accept it and surface drift information as `null`.

### 3.4 Graph size

A graph file MUST be no larger than **50 mebibytes (52,428,800 bytes)**, the conformance ceiling for CKGP v1. Aggregators MUST refuse to fetch larger bodies; they MUST mark such entries as `oversize` (§5.3) without attempting JSON parse. This bound is reviewed in §11 and may be raised in a future revision.

### 3.5 Schema conformance

A producer MUST emit JSON that validates against the schema for its declared format. Format authors MUST publish their schemas as JSON Schema (Draft 2020-12 RECOMMENDED) at a stable URL. Aggregators MUST validate fetched bodies against the format's schema and mark non-conforming bodies as `invalid` (§5.3).

### 3.6 Forward compatibility

Schemas SHOULD allow unknown properties (i.e. omit `additionalProperties: false`) so that producers can extend the wire surface without bumping the major version. Consumers MUST ignore unknown properties.

## 4. `.well-known/code-graph.json` discovery (producer side)

### 4.1 Location

The discovery record MUST be served at `<repo-root>/.well-known/code-graph.json`. For repositories hosted on GitHub, two HTTPS URLs are equivalent:

- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/.well-known/code-graph.json` — raw byte content, suitable for programmatic fetch.
- `https://github.com/<owner>/<repo>/blob/<ref>/.well-known/code-graph.json` — HTML view; SHOULD NOT be used as a fetch URL by consumers.

Where `<ref>` is typically the default branch (`HEAD`, `main`, or `master`), but MAY be a tag or a specific sha. Consumers SHOULD prefer the default branch.

### 4.2 Schema

```jsonc
{
  "schema_version": 1,
  "graphs": [
    {
      "format": "understand-anything@1",
      "graph_url": "https://raw.githubusercontent.com/<owner>/<repo>/main/.understand-anything/knowledge-graph.json",
      "tool_version": "0.7.2",
      "generated_at": "2026-05-08T12:00:00Z",
      "source_sha": "abc1234567890abc1234567890abc1234567890a"
    }
  ]
}
```

#### 4.2.1 Top-level fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schema_version` | integer | MUST | Equals `1` for CKGP v1. |
| `graphs` | array | MUST | Non-empty array of graph descriptors. A producer with zero graphs SHOULD NOT publish a discovery record. |

#### 4.2.2 Graph descriptor fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `format` | string | MUST | Format identifier, e.g. `"understand-anything@1"`. |
| `graph_url` | string (URI) | MUST | Absolute HTTPS URL to the graph body. SHOULD be on `raw.githubusercontent.com` or an equivalent CDN that serves the raw file. |
| `tool_version` | string | SHOULD | Producer version at generation time. |
| `generated_at` | string (ISO 8601) | SHOULD | When the graph was generated. |
| `source_sha` | string (40-hex) | SHOULD | Commit sha of HEAD when the graph was generated. Used for drift detection. |
| `description` | string | MAY | Producer-facing one-liner describing the graph. Capped at 280 characters. |
| `tags` | array of strings | MAY | Free-form tags; alphanumerics, dash, underscore. Capped at 16 tags, 32 chars each. |

#### 4.2.3 Multiple graphs

A repository MAY publish multiple graphs (e.g. an `understand-anything@1` knowledge graph plus a `bundle@1` Repomix dump). Each goes in its own entry under `graphs[]`. Consumers SHOULD pick the format they understand and ignore the rest.

### 4.3 Serving requirements

The discovery record MUST be served:

- Over **HTTPS** (TLS 1.2 or higher RECOMMENDED).
- With `Content-Type: application/json` (RECOMMENDED) or `text/plain` (acceptable; `raw.githubusercontent.com` returns `text/plain`).
- With CORS headers permitting cross-origin GET (`access-control-allow-origin: *` RECOMMENDED). `raw.githubusercontent.com` already satisfies this.

Producers SHOULD set sensible cache directives. `Cache-Control: max-age=300` is REASONABLE; longer values trade freshness for bandwidth.

### 4.4 Probing semantics

Consumers probing a repository SHOULD:

1. Attempt `GET https://raw.githubusercontent.com/<owner>/<repo>/HEAD/.well-known/code-graph.json`.
2. On 404, attempt the explicit default branches `main`, then `master` in order, before giving up.
3. On any non-`2xx` response other than 404, treat the result as transient; retry with backoff.

A 404 MUST be interpreted as "this repository has no CKGP discovery record"; consumers MUST NOT fall back to scraping random paths.

## 5. Registry contract

A **registry** (or "aggregator") is an OPTIONAL service that crawls producer discovery records and publishes a unified index. This section specifies what an aggregator MUST do to interoperate. Aggregators are not authoritative; consumers SHOULD always prefer the producer's own discovery record when available.

### 5.1 `registry.json` shape

An aggregator MUST publish a `registry.json` document at a stable HTTPS URL. The minimum shape is:

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-05-08T12:00:00Z",
  "entries": [
    {
      "id": "<owner>/<repo>",
      "owner": "<owner>",
      "repo": "<repo>",
      "default_branch": "main",
      "format": "understand-anything@1",
      "graph_url": "https://raw.githubusercontent.com/.../knowledge-graph.json",
      "description": "...",
      "tags": ["..."],
      "status": "ok",
      "last_synced": "2026-05-08T12:00:00Z",
      "last_sha": "<sha-256 of last fetched body>",
      "size_bytes": 12345,
      "source_sha": "<git sha embedded by producer>",
      "head_sha": "<git sha of HEAD at last drift check>",
      "commits_behind": 0,
      "drift_checked_at": "2026-05-08T12:00:00Z"
    }
  ]
}
```

The reference shape is documented at <https://github.com/looptech-ai/understand-quickly/blob/main/schemas/meta.schema.json>.

### 5.2 Sync semantics

An aggregator MUST:

- Periodically refetch each entry's `graph_url` (RECOMMENDED: at least daily).
- Validate the body against the format's schema before marking the entry `ok`.
- Update `last_sha` only when the body actually changed (so consumers can cache by `last_sha`).
- Set a per-fetch timeout (RECOMMENDED: 30 seconds) and concurrency cap.
- Refuse bodies whose `Content-Length` exceeds 50 MB (§3.4).
- Surface fetch errors through the `status` and `last_error` fields (§5.3) without throwing.

An aggregator SHOULD:

- Expose a low-latency invalidation channel (GitHub `repository_dispatch`, an HTTP webhook, or equivalent) so producers can trigger an instant resync.
- Emit a smaller agent-facing index (e.g. `.well-known/repos.json`) that excludes operational fields like `miss_count`, `last_error`, `drift_checked_at`.

### 5.3 Status taxonomy

| Status | Meaning |
| --- | --- |
| `pending` | Registered but not yet synced. |
| `ok` | Fetched, parsed, validated, current. |
| `missing` | The last sync received a 404 from `graph_url`. |
| `invalid` | The last fetched body failed schema validation. |
| `oversize` | `graph_url` content-length exceeded the 50 MB cap. |
| `transient_error` | Network or 5xx; the aggregator will retry. |
| `dead` | Seven or more consecutive misses. The aggregator MAY garbage-collect entries in this state. |
| `renamed` | Superseded by a `renamed_to` field pointing at the new id. |
| `revoked` | Maintainer-retracted. Consumers SHOULD NOT use the linked graph. |

Aggregators MAY define additional statuses but MUST NOT redefine the meaning of those above.

### 5.4 Drift detection

When the producer embeds `metadata.commit` (graph body) or `source_sha` (discovery record), the aggregator MUST:

1. Periodically resolve the source repository's default branch HEAD sha via the forge API (`head_sha`).
2. Count commits between `source_sha` and `head_sha`. The reference implementation uses the GitHub `compare` API.
3. Populate `commits_behind` with the integer count, or `null` when either sha is unavailable.
4. Stamp `drift_checked_at`.

Aggregators SHOULD perform drift checks at least once per sync interval. Aggregators MAY rate-limit drift checks (e.g. only re-check when the linked graph itself changed) to conserve forge API quota.

When `metadata.commit` is missing, drift is undetectable; the aggregator MUST set `source_sha`, `head_sha`, and `commits_behind` all to `null`. Consumers MUST NOT interpret missing drift as "current".

## 6. Consumer interface

This section specifies the surface that AI agents and developer tools interact with.

### 6.1 Direct discovery

The simplest consumer flow is producer-direct:

```text
input:  <owner>/<repo>
fetch:  https://raw.githubusercontent.com/<owner>/<repo>/HEAD/.well-known/code-graph.json
parse:  validate against §4.2
choose: pick the graph entry whose `format` you support
fetch:  the chosen entry's `graph_url`
```

This flow requires no aggregator. It works on any repo whose maintainer has published a discovery record. Consumers SHOULD prefer this flow.

### 6.2 Aggregator-mediated discovery

When a discovery record is absent, OR when the consumer wants drift information, OR when the consumer wants to enumerate many repos at once, the consumer MAY query an aggregator:

```text
fetch:  <aggregator>/.well-known/repos.json
filter: where `id == "<owner>/<repo>"` and `status == "ok"`
fetch:  matching entry's `graph_url`
```

Or for enumeration:

```text
fetch:  <aggregator>/registry.json
iterate: entries where `status == "ok"`
```

Consumers MUST treat the aggregator as a hint, not an authority. If the aggregator's `graph_url` differs from the producer's discovery record, the producer is the source of truth.

### 6.3 MCP tooling

The reference aggregator publishes an [MCP](https://modelcontextprotocol.io/) server that exposes three tools:

- `find_graph_for_repo({ owner, repo })` — Returns the matching entry or `null`.
- `list_repos({ format?, limit?, cursor? })` — Paginated enumeration.
- `get_graph({ id })` — Fetches and returns the graph body.

These tool names are RECOMMENDED for cross-aggregator consistency but are not normative — every aggregator is free to expose its own MCP surface.

### 6.4 Caching

Consumers SHOULD cache fetched bodies keyed by `last_sha` (when consuming via an aggregator) or the body's own SHA-256 (when consuming directly). A keyed cache makes it cheap to revisit the same graph repeatedly during a long agent session.

## 7. Security

CKGP places fetched JSON in front of consumers — typically inside an LLM context window or a developer tool. The protocol MUST be robust against adversarial graphs.

### 7.1 Adversarial bodies

Producers are not implicitly trusted. A graph body MAY contain:

- **Poisoned labels.** A node label of `"ignore previous instructions and..."` is just a string; consumers MUST treat all label/name fields as untrusted text and MUST NOT execute them as instructions. LLM-based consumers SHOULD pass graph contents through a system-prompt boundary that explicitly demarcates untrusted input.
- **Schema-bombs.** Deeply nested arrays/objects designed to OOM a parser. Consumers SHOULD use a streaming parser or a body-size cap (the 50 MB ceiling in §3.4 is a sufficient defense for reasonable hardware).
- **Cycle-bombs.** Recursive references via `$ref` are not part of the CKGP wire format; consumers MUST reject any body containing JSON Schema `$ref` keys at the wire layer.
- **Resource-exhausting node counts.** Aggregators SHOULD apply additional caps: 100,000 nodes and 500,000 edges per graph are RECOMMENDED. Bodies exceeding either MAY be marked `invalid` even if schema-valid.

### 7.2 Source-sha verification

Consumers SHOULD verify that `metadata.commit` (or `source_sha`) is present in the source repository's commit history before trusting drift information. A producer can claim any sha; the forge's commit history is the source of truth. The reference aggregator does not currently perform this verification (it is forge-API-quota-prohibitive at scale); a hardened consumer implementation SHOULD.

### 7.3 Revocation

The `revoked` status (§5.3) is the maintainer-retraction channel. Consumers MUST honor `revoked` for any graph fetched via an aggregator. Producers can revoke directly by deleting the discovery record or the graph body itself; consumers MUST treat a 404 as "no longer available" and SHOULD invalidate any cached copy.

### 7.4 Supply-chain considerations

A graph file that points at a `graph_url` outside the producer's own repo (e.g. an attacker-hosted CDN) SHOULD be treated with suspicion. Aggregators SHOULD verify that `graph_url` is under the same forge as the discovery record, OR is under an explicitly allow-listed CDN. The reference aggregator currently allows `raw.githubusercontent.com`, `<owner>.github.io`, and the repo's own `gh-pages` branch.

### 7.5 Privacy

Graph bodies may inadvertently leak commit messages, internal email addresses, or proprietary identifiers. Producers MUST inform their users that publishing a graph is a publication act with the same privacy implications as committing the graph itself. Aggregators MUST honor takedown requests routed through the producer (i.e. when the producer revokes, the aggregator drops).

## 8. Versioning

### 8.1 Document version

This document is **CKGP v1**. A future revision that breaks the producer-side wire format (e.g. renaming `schema_version` to `version`, changing the path from `.well-known/code-graph.json` to `.well-known/code-graph/index.json`) will be published as **CKGP v2** with a parallel-publish window of at least 12 months. Producers MAY publish both v1 and v2 records during the migration window. Consumers MUST prefer the highest version they understand.

### 8.2 Format version

Each format identifier carries an integer major version: `understand-anything@1`, `understand-anything@2`. The semantics:

- **`@<int>` is opaque.** It is not SemVer; `@2` does not have to be backward-compatible with `@1`. Consumers MUST NOT assume two formats with the same name and different integer suffixes share a wire shape.
- **Within a major version, the schema MAY relax constraints** (add optional fields, widen enums) but MUST NOT add required fields or tighten existing ones. Producers MAY add unknown fields (forward-compat); consumers MUST ignore them.
- **Breaking changes ship as a new format.** `understand-anything@1` is frozen the moment a real consumer relies on it. Any change that would invalidate an existing v1 graph requires a `@2`.
- **Producers MAY advertise multiple formats simultaneously.** A tool transitioning from `@1` to `@2` writes both files and lists both in `graphs[]`.

### 8.3 Deprecation policy

A format MAY be marked deprecated by its author. Aggregators SHOULD continue to serve deprecated entries but MAY surface a deprecation notice. A deprecated format MUST NOT be removed from the registry until at least 90 days after the deprecation announcement.

### 8.4 Migration paths

When migrating between major format versions:

1. **Producers** publish both `<format>@<n>` and `<format>@<n+1>` graphs to distinct paths in the same repo. Both appear in `graphs[]` of the discovery record.
2. **Aggregators** index both as separate entries with separate ids (e.g. `owner/repo` for the canonical and `owner/repo#v2` for the new version) — OR a single id with multiple `graphs[]`, depending on the aggregator's data model.
3. **Consumers** prefer the highest version they understand, falling back to lower versions on parse failure.

## 9. Multi-vendor expectation

CKGP is a **protocol, not a service**. Multiple aggregators MAY exist, and the protocol is explicitly designed for that:

- The producer-side discovery record at `.well-known/code-graph.json` is aggregator-independent. A producer publishes once; every aggregator that wants to index the producer can do so without producer-side cooperation.
- Aggregator-side endpoints (`registry.json`, `.well-known/repos.json`, MCP tools) follow conventions but are not centralized. Two aggregators serving the same JSON shape are interoperable from the consumer's perspective.
- No aggregator has authority over format names. A new format is launched by publishing a JSON Schema and one production graph using it; aggregators that find such graphs add the schema to their index.

### 9.1 Cross-aggregator discovery (sketch, non-normative)

A future revision MAY define `.well-known/code-graph-aggregators.json` — a producer-published list of aggregators known to index the producer's repo. The proposed shape (informative):

```jsonc
{
  "schema_version": 1,
  "aggregators": [
    {
      "name": "understand-quickly",
      "url": "https://looptech-ai.github.io/understand-quickly/",
      "registry_url": "https://looptech-ai.github.io/understand-quickly/registry.json"
    }
  ]
}
```

This is sketched here as a placeholder; it is NOT part of CKGP v1. Producers SHOULD NOT publish this file yet.

### 9.2 Anti-monopoly stance

This protocol is deliberately structured to prevent any single aggregator from becoming a chokepoint. The `looptech-ai/understand-quickly` reference implementation is one aggregator; the protocol expects others to exist and to be equally legitimate. Consumers depending on a single aggregator are reminded that the producer's `.well-known/code-graph.json` is always authoritative.

## 10. Acknowledgements

The protocol design draws on:

- **The [.well-known](https://www.rfc-editor.org/rfc/rfc8615) ecosystem.** `security.txt`, `change-password`, `dnt-policy`, and `openid-configuration` all demonstrate that a small JSON file at a stable site-rooted path is a durable convention.
- **The [Open Container Initiative (OCI)](https://github.com/opencontainers) distribution spec.** OCI artifacts validate the pattern of "small pointer, large body" and a multi-vendor registry interface.
- **The [Sigstore](https://www.sigstore.dev/) transparency log.** Sigstore inspires the "anyone can verify, no one is the authority" stance.
- **Producers whose existing emitter conventions guided the §3.1 path table:** Understand-Anything, GitNexus, code-review-graph, Repomix, gitingest, codebase-digest.

The reference implementation is maintained by Alex Macdonald-Smith and LoopTech.AI. The protocol itself is offered to the community without claim of ownership beyond the editor role.

## Appendix A. Worked example (informative)

A producer publishes its graph at `.understand-anything/knowledge-graph.json` and its discovery record at `.well-known/code-graph.json`:

```jsonc
// .well-known/code-graph.json
{
  "schema_version": 1,
  "graphs": [
    {
      "format": "understand-anything@1",
      "graph_url": "https://raw.githubusercontent.com/octocat/hello-world/main/.understand-anything/knowledge-graph.json",
      "tool_version": "0.7.2",
      "generated_at": "2026-05-08T12:00:00Z",
      "source_sha": "abc1234567890abc1234567890abc1234567890a"
    }
  ]
}
```

An AI agent receives the prompt "explain octocat/hello-world":

```text
1. fetch  https://raw.githubusercontent.com/octocat/hello-world/HEAD/.well-known/code-graph.json
2. parse, pick `understand-anything@1` (the agent supports it)
3. fetch  the entry's `graph_url`
4. validate against `understand-anything@1` schema
5. ingest into the agent's working context
6. respond
```

If step 1 returns 404, the agent SHOULD fall back to:

```text
1'. fetch  https://looptech-ai.github.io/understand-quickly/.well-known/repos.json
2'. find  entry where id == "octocat/hello-world"
3'. proceed as 3-6 above using the entry's graph_url
```

If neither path yields a graph, the agent SHOULD inform the user that the repo is not indexed and offer the registry's [add-repo wizard](https://looptech-ai.github.io/understand-quickly/add.html) link.

## Appendix B. JSON Schema for the producer discovery record (informative)

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://looptech-ai.github.io/understand-quickly/schemas/well-known-code-graph@1.json",
  "type": "object",
  "required": ["schema_version", "graphs"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1 },
    "graphs": {
      "type": "array",
      "minItems": 1,
      "maxItems": 32,
      "items": {
        "type": "object",
        "required": ["format", "graph_url"],
        "properties": {
          "format":        { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*@[0-9]+$" },
          "graph_url":     { "type": "string", "format": "uri", "pattern": "^https://" },
          "tool_version":  { "type": "string", "maxLength": 64 },
          "generated_at":  { "type": "string", "format": "date-time" },
          "source_sha":    { "type": "string", "pattern": "^[0-9a-f]{40}$" },
          "description":   { "type": "string", "maxLength": 280 },
          "tags":          {
            "type": "array",
            "maxItems": 16,
            "items": { "type": "string", "pattern": "^[A-Za-z0-9_-]{1,32}$" }
          }
        }
      }
    }
  }
}
```

This schema is informative for CKGP v1; format authors and aggregators SHOULD treat the textual specification in §4.2 as normative when the two disagree.

## Appendix C. Change log

| Version | Date | Notes |
| --- | --- | --- |
| 1 (draft) | 2026-05-09 | Initial publication. |

## Appendix D. References

### Normative

- [RFC 2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997.
- [RFC 7231] Fielding, R., Ed., and J. Reschke, Ed., "Hypertext Transfer Protocol (HTTP/1.1): Semantics and Content", RFC 7231, June 2014.
- [RFC 8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.
- [RFC 8259] Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017.
- [RFC 8615] Nottingham, M., "Well-Known Uniform Resource Identifiers (URIs)", RFC 8615, May 2019.
- [RFC 3986] Berners-Lee, T., Fielding, R., and L. Masinter, "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005.

### Informative

- [SemVer] Preston-Werner, T., "Semantic Versioning 2.0.0", <https://semver.org/>.
- [JSON Schema] "JSON Schema: Draft 2020-12", <https://json-schema.org/draft/2020-12>.
- [OCI Distribution Spec] "Open Container Initiative Distribution Specification", <https://github.com/opencontainers/distribution-spec>.
- [MCP] Model Context Protocol, <https://modelcontextprotocol.io/>.
- [security.txt] "RFC 9116 — A File Format to Aid in Security Vulnerability Disclosure", <https://www.rfc-editor.org/rfc/rfc9116>.
