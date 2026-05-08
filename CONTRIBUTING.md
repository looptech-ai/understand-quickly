# Contributing to understand-quickly

Thanks for helping make the registry more useful. There are three common ways to contribute:

1. **Add your repo to the registry** (the 90% case).
2. **Add a new graph format.**
3. **Local development** — fix bugs, improve tooling, write tests.

If you're not sure how to PR, every flow has a no-PR fallback via the issue templates under `.github/ISSUE_TEMPLATE/`.

---

## 1. Add your repo to the registry

This is the path most contributors want. You're publishing a knowledge graph from your own project and registering its location here.

### Steps

1. **Generate a graph in your repo.** Run [Understand-Anything](https://github.com/Lum1104/Understand-Anything), [GitNexus](https://github.com/abhigyanpatwari/GitNexus), [code-review-graph](https://github.com/tirth8205/code-review-graph), or any tool that emits a [supported format](./README.md#supported-formats). Commit the resulting JSON file to your repo on a stable, raw-fetchable path.
2. **Fork this repo** and create a branch.
3. **Append a new entry to `registry.json`.** Entries are objects in the top-level `entries` array. The diff should look like this — note the trailing comma on the previous entry:

   ```diff
       {
         "id": "someone/existing-entry",
         "format": "understand-anything@1",
         "graph_url": "https://raw.githubusercontent.com/someone/existing-entry/main/.understand-anything/knowledge-graph.json",
         "description": "An existing entry."
   -   }
   +   },
   +   {
   +     "id": "yourname/yourrepo",
   +     "owner": "yourname",
   +     "repo": "yourrepo",
   +     "format": "understand-anything@1",
   +     "graph_url": "https://raw.githubusercontent.com/yourname/yourrepo/main/.understand-anything/knowledge-graph.json",
   +     "description": "One-liner about your project (<= 200 chars).",
   +     "tags": ["python", "agents"]
   +   }
     ]
   }
   ```

4. **Run `npm run validate` locally** (optional but appreciated) — this fetches your `graph_url` and validates it against the schema for your declared `format`.
5. **Open a PR.** CI will run validation. A maintainer reviews and merges. The nightly sync (or your instant-refresh workflow) will then resync the entry on the merged registry.

### `id` rules

- `id` must match `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` — i.e. `owner/repo`-shaped.
- `id` must be unique across the registry.
- `id` does not have to match `owner`/`repo` literally, but for GitHub-hosted projects it should.

### One example per first-class format

**`understand-anything@1`:**

```json
{
  "id": "Lum1104/Understand-Anything",
  "owner": "Lum1104",
  "repo": "Understand-Anything",
  "format": "understand-anything@1",
  "graph_url": "https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/.understand-anything/knowledge-graph.json",
  "description": "Reference implementation of the Understand-Anything graph format.",
  "tags": ["python", "reference"]
}
```

**`gitnexus@1`:**

```json
{
  "id": "abhigyanpatwari/GitNexus",
  "owner": "abhigyanpatwari",
  "repo": "GitNexus",
  "format": "gitnexus@1",
  "graph_url": "https://raw.githubusercontent.com/abhigyanpatwari/GitNexus/main/.gitnexus/graph.json",
  "description": "Repo-to-graph tool with PR-aware change tracking.",
  "tags": ["typescript", "git"]
}
```

**`code-review-graph@1`:**

```json
{
  "id": "tirth8205/code-review-graph",
  "owner": "tirth8205",
  "repo": "code-review-graph",
  "format": "code-review-graph@1",
  "graph_url": "https://raw.githubusercontent.com/tirth8205/code-review-graph/main/.crg/graph.json",
  "description": "Code-review-oriented graph emitter.",
  "tags": ["review", "graph"]
}
```

### Not sure how to PR?

Open an issue using the **Add my repo** template (`.github/ISSUE_TEMPLATE/add-repo.yml`). A maintainer will translate it into a PR. A PR is still faster — the form just collects the same fields we'd otherwise paste in.

### Verified publishers

If your `id` is on the verified-publisher allowlist, registry-only "add my repo" PRs auto-merge once `validate` goes green — no human review needed. See [`docs/verified-publishers.md`](./docs/verified-publishers.md) for what it means and how to apply.

### Integrating an upstream tool

If you maintain a tool that emits one of the supported formats, see [`docs/integrations/protocol.md`](./docs/integrations/protocol.md) — auto-publish via `repository_dispatch` removes manual registration entirely.

---

## 2. Add a new graph format

A "format" is a versioned JSON Schema in `schemas/`. Adding one means downstream agents can validate graphs of that shape against a known contract.

### Checklist

1. **Add `schemas/<name>@<int>.json`.** JSON Schema **draft 2020-12** (`"$schema": "https://json-schema.org/draft/2020-12/schema"`). Use the existing schemas as a template. Names are slug-ish (`my-tool@1`, not `My Tool v1`).
2. **Add fixtures under `schemas/__fixtures__/<name>/`:**
   - `ok.json` — a minimal example that should validate.
   - `bad.json` — an example that should fail validation (e.g. missing required field, wrong type).
3. **Add `real-sample.json` if available.** A real-world graph emitted by the upstream tool, copied verbatim. Skip if there isn't one yet — the fixtures above are required, this one is best-effort.
4. **Update `README.md` "Supported formats" table.** New row with `Format`, `Source tool`, `Tier`.
   - **Tier `first-class`** — there is an upstream tool that emits this format.
   - **Tier `fallback`** — no dedicated tool; a generic shape that adapters can target.
5. **Run `npm test`.** The suite compiles each schema with ajv and checks `ok`/`bad` fixtures.

---

## 3. Local development

```bash
nvm use            # Node 20 (see .nvmrc)
npm install
npm test           # node:test
npm run test:coverage
npm run validate   # validate registry.json + (optionally) all graphs
npm run sync       # resync all entries (writes registry.json)
npm run smoke      # dry-run sync against tests/registry-smoke.json — offline-friendly
npm run render     # regenerate README table
```

- **Node 20** is the supported version. `.nvmrc` pins it; CI uses the same.
- **`npm run smoke`** is the offline-friendly entrypoint — it runs the sync logic against `tests/registry-smoke.json` without hitting the network beyond fixtures, which is the right call when you're on a flaky connection or iterating locally.
- **Coverage gates** are enforced via `c8`:
  - **≥ 90%** lines and functions.
  - **≥ 80%** branches.
  PRs that drop below these thresholds will fail CI.

---

## Licensing of contributions

By submitting a contribution — whether code, docs, schemas, fixtures, or
a registry entry pointing at a third-party graph — you agree to two
things:

1. **Code, docs, and schema contributions** are licensed under the
   [Apache License 2.0](./LICENSE), and you are authorized to grant that
   license. We follow [DCO](https://developercertificate.org/) sign-off
   conventions: include `Signed-off-by: Your Name <you@example.com>` in
   commits to confirm you have the right to submit your work.
2. **Registry-data contributions** (entries that point at a `graph_url`,
   `content_url`, or other Linked Artifact, plus any aggregated outputs
   produced from them) are governed by the
   [`DATA-LICENSE.md`](./DATA-LICENSE.md). In short: you grant Alex
   Macdonald-Smith and LoopTech.AI a perpetual, royalty-free,
   sublicensable right to use the submitted data — including for
   AI/ML training and commercial products — and that grant travels with
   any fork or extension of the registry. Read `DATA-LICENSE.md` before
   submitting if you are doing so on behalf of an employer or you have
   any doubt about your rights to the linked content.

Please also read our [Code of Conduct](./CODE_OF_CONDUCT.md). We expect everyone interacting in issues, PRs, and discussions to follow it.
