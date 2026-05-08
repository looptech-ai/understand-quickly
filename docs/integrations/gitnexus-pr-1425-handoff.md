# Handoff prompt for a local Claude session — execute GitNexus PR #1425 cleanup

> **Read this file once, then start working. Everything you need is here or
> linked from here. Do not load my prior session's transcript.**
>
> You are taking over a partially-completed code review response from a
> sandboxed Claude session whose GitHub MCP allowlist was scoped to
> `looptech-ai/understand-quickly`. Your job is to land the parts that
> session could not: applying patches to `abhigyanpatwari/GitNexus`,
> posting reply comments on PR #1425, and confirming CI.

---

## Constraints you must honor

1. **`abhigyanpatwari/GitNexus` is licensed PolyForm Noncommercial 1.0.0.**
   Before you push *any* code-bearing commit to that repo, ask the human
   user whether they have signed a CLA (or equivalent) with the upstream
   maintainer. If they haven't, **stop** and surface that to the user — do
   not push. Doc updates and comment posts are fine to proceed with; only
   code patches are gated on the licensing question.
2. **Use the user's authenticated GitHub identity** (`gh` CLI / the MCP
   server you have access to). Do not impersonate, do not use a token from
   a different account.
3. **Confirm before any destructive action**: force-pushing to a branch
   that exists upstream, closing the PR, deleting the branch. Non-
   destructive actions (paste comments, push new commits to the PR head
   branch the user controls) proceed without confirmation.
4. **Sign every commit** with `Signed-off-by: <user>` per DCO.

---

## What's already done (do not repeat)

- Comprehensive review responses + drop-in patches drafted in:
  `looptech-ai/understand-quickly:docs/integrations/gitnexus-pr-1425-responses.md`
  (commit `f09f2b7` on branch `claude/check-session-status-NWWiy`).
- Mobile-friendly playbook at
  `looptech-ai/understand-quickly:docs/integrations/gitnexus-pr-1425-quick-paste.md`
  (commit `3395653`).
- This handoff file is on the same branch.

Do not re-derive the patches. Read those two files; they are the spec.

---

## Inputs

- **PR:** <https://github.com/abhigyanpatwari/GitNexus/pull/1425>
- **PR head SHA at time of review:** `3ea22fd`
- **PR head branch (owned by `looptech-ai` or `amacsmith`):**
  whatever the PR's `head.ref` resolves to — fetch via `gh pr view 1425 --repo abhigyanpatwari/GitNexus --json headRefName`.
- **Full review with verbatim findings:** the senior code review pasted in
  the user's prior message. The summary lives in `gitnexus-pr-1425-responses.md`.
- **Open BLOCKERs (3) + HIGHs (1) + MEDIUMs (2) + LOWs (3)** —
  enumerated below in execution order.

---

## Execution plan — do these in order, stop if any step fails

### Step 0 — Sanity checks

```bash
# Repo + PR exist and are open
gh pr view 1425 --repo abhigyanpatwari/GitNexus --json state,headRefName,headRepository

# CI failures: confirm whether they reproduce on `main`
gh repo clone abhigyanpatwari/GitNexus /tmp/gitnexus
cd /tmp/gitnexus
git checkout main
npm install
npm test --workspace=gitnexus -- test/integration/cli-e2e.test.ts -t '(#324)' || true
```

If the 5 `(#324)` tests fail on `main` too, they're pre-existing — note
this in the CI thread reply (Step 4) and continue. If `main` is green,
bisect into the publish branch first; the patches below should not have
introduced those failures, but verify before pushing.

### Step 1 — Confirm licensing path

Ask the human user:

> "PR #1425 lands code in `abhigyanpatwari/GitNexus`, which is PolyForm
> Noncommercial 1.0.0. Have you signed a CLA or otherwise resolved the
> contributor-licensing question with the upstream maintainer? If not, I
> will pause before pushing code; comment-only replies will still proceed."

If the answer is "no" or "unclear": continue with comment posts (Step 4)
but **skip Steps 2 + 3** (code pushes). Surface the gate clearly when
done.

### Step 2 — Apply patches to a fresh branch off the PR head

```bash
cd /tmp/gitnexus
gh pr checkout 1425
git checkout -b claude/uq-publish-fixes
```

Apply the seven patch sections from `gitnexus-pr-1425-responses.md` in
this exact order. Each section is single-file-scoped and does not
conflict with the others. After each, run the matching local test to
verify.

| # | Patch source in responses doc | Files touched | Verify |
| --- | --- | --- | --- |
| 1 | "BLOCKER 1 — CodeQL ReDoS" → Patch | `gitnexus-shared/src/integrations/understand-quickly.ts`; new `__tests__` file | `npm test --workspace=gitnexus-shared -- understand-quickly` |
| 2 | "BLOCKER 2 — token gate" → Patch | `gitnexus/src/cli/publish.ts` (move token check to step 0) | `npm test --workspace=gitnexus -- test/unit/publish.test.ts` |
| 3 | "BLOCKER 3 — 401 handling" → Patch | `gitnexus/src/cli/publish.ts` (response branches) | same |
| 4 | "HIGH 4 — fetch timeout" → Patch | `gitnexus/src/cli/publish.ts` (AbortSignal + UA) | same |
| 5 | "MEDIUM 5 — test coverage" → 7 new tests | `gitnexus/test/unit/publish.test.ts` | `npm test --workspace=gitnexus` (expect 8197 + 7 = 8204 pass on the publish branch) |
| 6 | "LOW 8 — owner-repo regex" → Patch | `gitnexus-shared/src/integrations/understand-quickly.ts` (`OWNER_REPO_RE`) | `npm test --workspace=gitnexus-shared` |
| 7 | "LOW 9 — non-GitHub host" → Patch | same file (`parseOwnerRepoFromRemote` host guard) | same |

The `getCurrentCommit` move (LOW 7) is folded into BLOCKER 3's patch.

After all seven:

```bash
npm run typecheck
npm run lint
npm test
```

Expect the 5 `(#324)` tests to still fail (out of scope) but everything
else green, including 7 new publish.test.ts cases.

### Step 3 — Push the patches

```bash
git add -A
git commit -s -m "fix(uq-publish): address review blockers + high-severity items

Addresses CodeQL polynomial-regex (HIGH), token-gate ordering, distinct
401/403/404/422 response branches, fetch timeout, expanded test coverage,
tightened owner/repo validation, and non-GitHub remote rejection.

See response thread on PR #1425 for the per-finding rationale."
git push origin HEAD:<original-pr-head-branch>
```

Replace `<original-pr-head-branch>` with the value resolved in Step 0.
This pushes onto the PR head, so #1425 picks up the new commits
automatically. Do **not** force-push. If the push is rejected because
the head ref isn't yours to write to, fall back to opening a chained PR
against #1425's head branch and surface that to the user.

### Step 4 — Post the reply comments

Use the verbatim text blocks from
[`gitnexus-pr-1425-quick-paste.md`](./gitnexus-pr-1425-quick-paste.md),
**not** the longer responses doc. The quick-paste blocks are tuned for
direct posting; the responses doc is for engineers reading the rationale.

For each block, replace literal `<sha>` with the commit SHA you just
pushed in Step 3. If you skipped Step 3 (licensing gate), leave `<sha>`
literal and add a note "patches drafted but not pushed pending CLA
resolution".

Posting commands:

```bash
# Top-level summary (§0 of quick-paste doc)
gh pr comment 1425 --repo abhigyanpatwari/GitNexus --body-file /tmp/uq-§0.md

# Inline review reply on the CodeQL alert thread (§1)
# Find the review-thread id:
gh api repos/abhigyanpatwari/GitNexus/pulls/1425/comments --jq '.[] | {id, path, line, user: .user.login}'
# then:
gh api -X POST repos/abhigyanpatwari/GitNexus/pulls/1425/comments/<thread-id>/replies \
  --field body=@/tmp/uq-§1.md

# Repeat for §2, §3, §4, §5a/5b/5c (skip any thread that doesn't exist
# upstream — Copilot may not have left a comment on every file).
```

If `gh api .../replies` is unavailable on the user's `gh` version, fall
back to creating a new review with `inline` comments matched to each
existing thread's `path` and `line`.

### Step 5 — Confirm CodeQL clears

```bash
# Wait for the next CodeQL run (5-10 min after push)
sleep 300
gh pr checks 1425 --repo abhigyanpatwari/GitNexus
```

The previously-flagged alert at
`gitnexus-shared/src/integrations/understand-quickly.ts:89` should clear.
If it doesn't, read the new alert and propose a follow-up patch before
exiting.

### Step 6 — Final report to the user

End your run by posting in the user's chat:

- Whether Step 3 (code push) ran or was gated by licensing.
- The new commit SHA on the PR head, if pushed.
- The list of comment threads where you posted replies (with permalinks).
- Whether CodeQL cleared.
- Whether the 5 `(#324)` failures are pre-existing on `main`.
- Any unresolved questions for the user (CLA path, follow-up bisect, etc.).

Do **not** mark anything "done" until all of the above has been reported
back, even if individual gh commands succeeded.

---

## What you must NOT do

- Do not modify `looptech-ai/understand-quickly` from this session. The
  prior session owns that branch (`claude/check-session-status-NWWiy`).
  If you discover something that needs changing on the registry side
  (e.g., the response doc has a typo), surface it to the user and let
  the next registry-scoped session pick it up.
- Do not merge PR #1425. The decision to merge is the upstream
  maintainer's, after reviewing the responses + the new commits.
- Do not file new issues on `abhigyanpatwari/GitNexus` without user
  approval.
- Do not amend or rebase the existing PR commits. New commits on top
  only.

---

## Glossary

- **Registry:** the `looptech-ai/understand-quickly` repo. A directory of
  code-knowledge graphs and repo-context bundles for AI agents to fetch
  by URL. Apache 2.0 + a viral data-use license.
- **`bundle@1`:** the registry's format for repo-context packers
  (Repomix, gitingest, codebase-digest). Distinct from `gitnexus@1`.
- **GitNexus's `publish` command:** opt-in `gitnexus publish` subcommand
  that fires a `repository_dispatch` event at the registry. Does **not**
  upload graph content; the registry pulls from a `raw.githubusercontent.com`
  URL the user previously registered.
- **`UNDERSTAND_QUICKLY_TOKEN`:** fine-grained PAT with
  `Repository dispatches: write` scope on `looptech-ai/understand-quickly`
  only. Required for the dispatch; absent → publish is a no-op (per the
  contract this PR is fixing).

---

## Stop-conditions

If any of these are true, stop and ask the user:

1. The PR head branch is not in a repo you can push to.
2. CLA / licensing has not been resolved (Step 1).
3. A test other than the 5 known `(#324)` cases fails after Step 2.
4. CodeQL flags a new finding after Step 3.
5. `gh api` fails with 401/403 (token issue).
6. The PR has been closed, merged, or moved to a different branch since
   the head SHA `3ea22fd`.

In any stop case, summarize the state of the world and the proposed next
action, then exit cleanly. Do not improvise.

---

## Why this prompt is written this way

The original session that drafted the responses had no write access to
`abhigyanpatwari/GitNexus`. Rather than load that session's transcript
(which is large and partially out of scope), this prompt is the minimal
self-contained work order. Read it, follow it, ask when blocked, report
back.
