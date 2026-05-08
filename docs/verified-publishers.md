# Verified publishers

The registry ships with an allowlist of trusted publisher ids. Pull requests that **only** add new entries to `registry.json`, where every new entry's `id` is on the allowlist, and where the `validate` workflow check is green, are **auto-approved and auto-merged** by `.github/workflows/auto-merge.yml`.

PRs that touch anything else, edit existing entries, or add an unverified id fall back to the standard human-review path.

## What it means in practice

- If your `id` is on the list, your `add my repo` PR merges as soon as `validate` goes green. No human in the loop.
- If your `id` is **not** on the list, your PR is treated normally — a maintainer reviews and merges.
- The allowlist applies only to **adding** entries. Edits, renames, and deletions always require human review, even from a verified publisher.

## How to apply

Open an issue using the **Verified publisher request** path (label: `verified-publisher-request`). Include:

- Your registry `id` (`owner/repo` shape).
- Why your repo is a stable / trusted source (released tooling, an org you're known under, prior contributions, etc.).
- A link to the graph file you publish.

A maintainer reviews each request manually and adds you to `docs/verified-publishers.json` in a follow-up PR. Future automation may pick this up but for now it is human-driven.

## Source of truth

`docs/verified-publishers.json` is the canonical allowlist. Its shape:

```json
{
  "publishers": [
    {
      "id": "Lum1104/Understand-Anything",
      "added_at": "2026-05-07T00:00:00Z",
      "rationale": "Reference implementation of the understand-anything@1 format."
    }
  ]
}
```

The repo ships with `publishers: []` — every PR is human-reviewed until the first publisher is added.

## Required branch protection (manual setup)

The auto-merge workflow uses `gh pr merge --auto --squash`, which only merges once **all required status checks** pass. The maintainer must enable branch protection on `main` and mark the `validate` check as a required status check. Without that, `--auto` has nothing to wait on and PRs may merge before validation runs. Branch protection lives in repo settings, not in code.
