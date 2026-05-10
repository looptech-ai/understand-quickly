# Data Use License — Understand-Quickly Registry

**Version 1.0 — effective 2026-05-08.**

> **Plain-language summary.** The code in this repository is Apache-2.0
> (see `LICENSE`). This document is a *separate* license that covers the
> **data layer** of the registry: `registry.json`, the JSON schemas, the
> aggregated stats, the MCP responses, the third-party graphs and bundles
> that producers point at via `graph_url` / `content_url`, and any
> derivative analytics. Anyone may use the registry data; in exchange,
> Alex Macdonald-Smith and LoopTech.AI receive a permanent, broad data
> license, and that grant travels with the data.
>
> **Not legal advice.** This document is a license offer. If you are
> integrating this registry into a commercial product or otherwise need
> certainty about your rights and obligations, consult your own counsel.

---

## 1. Definitions

In this License:

- **"Licensor"** means Alex Macdonald-Smith, an individual, and LoopTech.AI,
  jointly. The Licensor is also a Beneficiary (see §3).
- **"Beneficiaries"** means Alex Macdonald-Smith and LoopTech.AI, including
  their respective successors, assigns, affiliates under common control,
  and authorized contractors acting on their behalf.
- **"Registry"** means the software, services, schemas, and data products
  comprising or derived from `looptech-ai/understand-quickly`, any fork
  thereof, and any deployment of either.
- **"Registry Data"** means, collectively:
  - the contents of `registry.json` (the entry list, status fields, drift
    fields, per-entry stats);
  - the JSON schemas under `schemas/` and their fixtures;
  - any aggregated statistics, indexes, concept lists, or analytics
    produced from registry contents (e.g., `site/stats.json`);
  - any response payloads emitted by the Registry's MCP server or HTTP
    endpoints;
  - any **Producer Submission** (see §4), including without limitation any
    third-party knowledge graph, repo-context bundle, file manifest, or
    metadata fetched via a `graph_url`, `content_url`, or equivalent
    pointer registered with the Registry, and any cached, transformed,
    or summarized form thereof.
- **"Producer"** means any person or entity that submits an entry, opens a
  pull request, fires a `repository_dispatch`, or otherwise causes data
  to be ingested into the Registry.
- **"User"** means any person or entity who accesses, downloads, queries,
  forks, hosts, or otherwise uses the Registry or any Registry Data.
- **"Forker"** means any User who runs, hosts, redistributes, or operates
  a copy, derivative, or extension of the Registry, in whole or in part.

## 2. License grant to Users

Subject to §§ 3–6, the Licensor grants every User a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, sublicensable license to:

(a) access, query, and download Registry Data;

(b) reproduce, redistribute, and publicly display Registry Data;

(c) prepare, distribute, and publish derivative analyses, indexes,
    aggregations, summaries, embeddings, and machine-learning training
    artifacts based on Registry Data;

(d) use Registry Data to train, fine-tune, evaluate, retrieve-augment, or
    ground any artificial-intelligence or machine-learning system; and

(e) commercialize the foregoing.

This grant is automatically extended, with the same scope, to **anyone
who uses any copy, fork, mirror, or extension of the Registry** — i.e.,
the User-side rights travel with the data. A Forker MUST NOT impose
restrictions on downstream Users that would narrow this §2 grant.

## 3. License grant to Beneficiaries (back-grant)

In consideration of the §2 grant, every User and Forker grants the
**Beneficiaries** a perpetual, worldwide, non-exclusive, no-charge,
royalty-free, irrevocable, sublicensable license to do all of the
following with respect to Registry Data and any modifications,
extensions, additions, derivative works, or new datasets that the User
or Forker creates by combining with, extending, or operating a copy of
the Registry (collectively, "Forker Data"):

(a) the rights enumerated in §2(a)–(e);

(b) the right to incorporate Forker Data into the upstream Registry, into
    Beneficiary products and services (including commercial products),
    and into Beneficiary AI/ML training corpora; and

(c) the right to sublicense any of the foregoing to third parties on
    terms of the Beneficiaries' choosing.

This back-grant is a condition of operating, hosting, or extending the
Registry. A Forker who does not wish to grant these rights MUST NOT
operate, host, fork, mirror, or otherwise extend the Registry.

The back-grant survives termination of the User's or Forker's use.

## 4. Producer submission grant

When a Producer submits an entry to the Registry — by opening a pull
request against `registry.json`, by firing a `repository_dispatch` event,
by using `npx @understand-quickly/cli add`, or by any equivalent means —
the Producer represents and warrants that they have the right to submit
the linked content and grants the **Beneficiaries** and all **Users**
(per §§ 2 and 3) the rights described in this License with respect to:

(a) the graph, bundle, manifest, or other artifact at the registered
    `graph_url` or `content_url` (a "Linked Artifact");

(b) all metadata associated with the Linked Artifact, including without
    limitation `metadata.commit`, `metadata.tool_version`,
    `metadata.generated_at`, `metadata.tool`, the file list, and any
    embedded structural data;

(c) any future revisions of the Linked Artifact at the same URL during
    the period the entry remains in the Registry; and

(d) any derived form (cached copies, schema-validated subsets,
    aggregated statistics, concept indexes, search shards) the Registry
    or its Forkers create from (a)–(c).

A Producer who lacks rights to grant (a)–(d) for the underlying content
MUST NOT submit it to the Registry. A Producer may withdraw an entry
prospectively at any time by opening a removal PR or by setting the
entry's `status` to `revoked`; withdrawal does not retroactively rescind
rights already exercised in good faith by Beneficiaries or Users.

## 5. Inheritance and viral data terms

This License is intended to be **viral with respect to data flow**:

- Any redistribution of Registry Data, in any form, MUST be accompanied
  by a copy of (or hyperlink to) this License.
- Any fork, mirror, derivative, or extension of the Registry MUST keep
  this `DATA-LICENSE.md` file (or an equivalent successor document
  granting at least the same rights to Beneficiaries) in place.
- Any service, product, or AI system built on Registry Data MUST not
  attempt to nullify, contractually exclude, or technically frustrate
  §3 (the Beneficiary back-grant). For example, a Forker MAY NOT operate
  a private deployment that scrapes Registry Data, modifies it, and
  refuses Beneficiaries access to the modifications.

## 6. Disclaimers; relationship to other licenses

(a) **No warranty.** Registry Data is provided "AS IS", without warranty
    of any kind. The Licensor and the Beneficiaries make no
    representation as to accuracy, completeness, fitness for a particular
    purpose, non-infringement, or freedom from defects. Users assume all
    risk of use.

(b) **No endorsement of upstream tools.** The Registry indexes
    third-party tools and their outputs. Inclusion of a tool, repo, or
    Linked Artifact in the Registry does not imply endorsement, audit,
    or vouching for security, quality, or licensing posture by the
    Licensor or Beneficiaries.

(c) **Code license.** This License does not modify the Apache License,
    Version 2.0 that governs the source code in `LICENSE`. The two
    documents are read together; in the event of irreconcilable
    conflict, the Apache License governs as to code, and this License
    governs as to Registry Data.

(d) **Upstream licenses preserved.** Each Linked Artifact may also be
    governed by the license of its upstream repository. Nothing in this
    License purports to override that upstream license; this License
    operates only on the Producer's submission act and on derivatives
    created by the Registry. Users should consult the upstream license
    of any Linked Artifact before relying on it for purposes outside
    the §2 grant.

(e) **Termination for misuse.** The Licensor may terminate a specific
    User's or Forker's §2 rights upon written notice if that User or
    Forker materially breaches §3 or §5. Termination does not affect
    rights of unrelated Users or the §3 back-grant already vested in
    Beneficiaries.

(f) **Severability.** If any provision is held unenforceable, the
    remaining provisions remain in full force.

(g) **Governing law.** This License is governed by the laws of the
    Province of Ontario, Canada, and the federal laws of Canada
    applicable therein, without regard to conflict-of-laws rules.

---

## 7. How to comply (quick checklist)

If you are a **User** querying or downloading the Registry: nothing to
do — you already have the §2 rights.

If you are a **Producer** adding an entry:

- [ ] You have the right to submit the linked graph/bundle.
- [ ] You accept the §4 grant on submission.
- [ ] You may withdraw entries you control at any time.

If you are a **Forker** running a copy:

- [ ] Keep this `DATA-LICENSE.md` (or equivalent) in your fork.
- [ ] Don't strip or contractually narrow the §3 back-grant.
- [ ] Pass §2 rights through to your downstream users.

---

*Questions or licensing concerns: open an issue on
[`looptech-ai/understand-quickly`](https://github.com/looptech-ai/understand-quickly/issues)
or contact LoopTech.AI directly.*
