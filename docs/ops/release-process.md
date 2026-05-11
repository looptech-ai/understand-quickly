# Release process

This repo is a monorepo with **three publishable components** plus the
registry data itself:

| Component | Path | Registry | Tag prefix |
|---|---|---|---|
| Root registry | `.` | (none; data lives in `registry.json`) | `v` |
| CLI | `cli/` | npm: [`@looptech-ai/understand-quickly-cli`](https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli) | `cli-v` |
| MCP server | `mcp/` | npm: [`@looptech-ai/understand-quickly-mcp`](https://www.npmjs.com/package/@looptech-ai/understand-quickly-mcp) | `mcp-v` |
| Python SDK | `python-sdk/` | PyPI: [`understand-quickly`](https://pypi.org/project/understand-quickly/) | `pysdk-v` |

Each component is versioned independently. Tags are component-scoped
(`cli-v0.1.2`, `mcp-v0.1.2`, `pysdk-v0.1.1`, plus the root `v0.2.0`).

## Normal flow — automated via `release-please`

`googleapis/release-please-action@v4` watches every push to `main` and
opens (or updates) a **Release PR per component** whose commits touched
that component since the last component tag. Conventional Commit prefixes
drive the bump:

| Commit prefix | Bump |
|---|---|
| `fix:` / `fix(scope):` | patch |
| `feat:` / `feat(scope):` | minor (pre-1.0 stays patch; see config) |
| `feat!:` or `BREAKING CHANGE:` footer | major |
| `chore:`, `docs:`, `ci:`, `refactor:`, `test:`, `style:` | no bump |

### Step-by-step

1. **Land commits on `main`** using Conventional Commits. Examples:
   - `fix(cli): handle empty graph_url in --graph mode`
   - `feat(mcp): add list_concepts MCP tool`
   - `chore(deps): bump httpx in python-sdk`
2. **Release PR appears** at <https://github.com/looptech-ai/understand-quickly/pulls>
   titled `chore(<component>): release <version>`. It contains:
   - The version bump in `package.json` / `pyproject.toml`.
   - A `.release-please-manifest.json` update.
   - A generated `CHANGELOG.md` entry.
3. **Review + merge** the Release PR. release-please will:
   - Create the tag `<component>-v<version>` automatically.
   - For `pysdk`, also create a GitHub Release (required by
     `publish-pysdk.yml` which triggers on `release: published`).
4. **`publish-*.yml` fires** on the new tag/release:
   - `publish-cli.yml` — tag-trigger, runs `npm publish` after
     `scripts/check-versions.mjs --tag` regression guard.
   - `publish-mcp.yml` — tag-trigger, same pattern.
   - `publish-pysdk.yml` — release-trigger, builds wheel+sdist, uploads
     artifacts to the GitHub release, publishes to PyPI via `twine`.
5. **Done.** No manual tagging, no manual `npm publish`, no manual
   `twine upload`.

> [!NOTE]
> Multiple components can release in one merge cycle. If a single commit
> touched `cli/` *and* `mcp/`, release-please opens two separate Release
> PRs — one per component.

### Configuration files

- [`release-please-config.json`](../../release-please-config.json) —
  per-package `release-type`, `package-name`, `component`,
  `tag-separator`. Uses `node-workspace` plugin so internal version refs
  stay in sync.
- [`.release-please-manifest.json`](../../.release-please-manifest.json) —
  source of truth for the current version of each component.
  release-please updates this file as part of each Release PR.
- [`.github/workflows/release-please.yml`](../../.github/workflows/release-please.yml) —
  the workflow that runs the action on every push to `main`.

## Manual override — bypassing release-please

Sometimes you need to ship out-of-band: an urgent hotfix, a coordinated
multi-component bump, or release-please is misconfigured for an edge case.
The publish workflows still respect a manual tag push.

```bash
# 1. Bump versions in the source-of-truth files
$EDITOR cli/package.json                 # cli/package.json -> 0.1.X
$EDITOR mcp/package.json mcp/server.json # mcp/* -> 0.1.X (both!)
$EDITOR python-sdk/pyproject.toml        # pyproject.toml  -> 0.1.X
$EDITOR .release-please-manifest.json    # keep manifest in sync

# 2. Verify no drift
node scripts/check-versions.mjs

# 3. Commit + push
git add cli/package.json mcp/package.json mcp/server.json \
        python-sdk/pyproject.toml .release-please-manifest.json \
        CHANGELOG.md cli/CHANGELOG.md
git commit -m "feat(release): bump cli/mcp/pysdk patch versions"
git push

# 4. Tag and push (publish workflow fires on each tag push for cli + mcp;
#    pysdk needs a GitHub Release, see step 5).
git tag -a cli-v0.1.2 -m "cli v0.1.2 — <reason>"
git tag -a mcp-v0.1.2 -m "mcp v0.1.2 — <reason>"
git push origin cli-v0.1.2 mcp-v0.1.2

# 5. For pysdk, create a GitHub Release (publish-pysdk.yml is triggered
#    by `release: published`, NOT by tag push).
gh release create pysdk-v0.1.1 \
  --repo looptech-ai/understand-quickly \
  --title "pysdk v0.1.1" \
  --notes "Manual release — see CHANGELOG.md"

# 6. Watch the workflows
gh run watch $(gh run list --repo looptech-ai/understand-quickly \
  --workflow=publish-cli.yml --limit 1 --json databaseId --jq '.[0].databaseId') \
  --repo looptech-ai/understand-quickly
```

Keep `.release-please-manifest.json` in sync with the manual bump — if
the manifest says `0.1.1` and `package.json` says `0.1.2`, the next
release-please run will try to re-bump to `0.1.2` and either no-op
(harmless) or open a redundant Release PR.

## The version regression guard

[`scripts/check-versions.mjs`](../../scripts/check-versions.mjs) runs
inside every `publish-*.yml` before `npm publish` / `twine upload`. It:

1. Reads the version from every package file.
2. Asserts each version is well-formed semver.
3. If `GITHUB_REF` is a tag (e.g. `cli-v0.1.2`), asserts the tag's
   version matches the corresponding `package.json` / `pyproject.toml`.

Failure modes it catches:

- Tag pushed without bumping `package.json` (e.g. `cli-v0.1.3` but
  `cli/package.json` still says `0.1.2`) → `npm publish` would have
  republished `0.1.2` under a `0.1.3` tag, then failed at npm with
  `EPUBLISHCONFLICT`. The guard fails earlier and louder.
- `package.json` version edited to a non-semver string (e.g.
  `0.1.2-dev` typo'd as `0.1.2dev`) → caught before pack.
- `mcp/package.json` and `mcp/server.json` versions drifting out of sync
  → currently not caught directly; release-please keeps them aligned
  during the automated flow. For manual bumps, **always update both**.

Tests live at
[`scripts/__tests__/check-versions.test.mjs`](../../scripts/__tests__/check-versions.test.mjs).

## When the workflow doesn't fire

| Symptom | Cause | Fix |
|---|---|---|
| Tag pushed, no `publish-*` run started | Tag prefix doesn't match `cli-v*` / `mcp-v*` / pysdk release | Re-tag with correct prefix; for pysdk, create a Release |
| `publish-*` run says "skipped" | `NPM_TOKEN` or `PYPI_API_TOKEN` secret unset | See [`npm-org-setup.md`](npm-org-setup.md) |
| `check-versions.mjs` fails the run | Tag and `package.json` disagree | Bump `package.json`, force-recreate the tag, push |
| release-please doesn't open a Release PR | No Conventional Commits touched the component since last tag | Land a `fix:` / `feat:` commit; or use manual override |
| release-please opens an empty PR | All commits since last tag were `chore:` / `docs:` | Squash them under a `fix:` if a release is genuinely needed |

## Docs automation

The `docs-on-release` workflow runs on every `release: published` event and on `workflow_dispatch`. It:

1. Reads the latest version of every published package (npm CLI, npm MCP, PyPI, GH Action) from each registry's public API.
2. Regenerates the `<!-- LATEST-START -->` … `<!-- LATEST-END -->` callout in README.md.
3. Re-renders the auto-generated registry table (idempotent via existing `scripts/render-readme.mjs`).
4. Commits + pushes any changes as `github-actions[bot]`.
5. Triggers a Pages redeploy so the live site reflects the change.

The workflow never fails — if any registry is unreachable, it falls back to the previous README content and exits 0. To force a regeneration manually: `gh workflow run docs-on-release.yml --repo looptech-ai/understand-quickly`.

## See also

- [`npm-org-setup.md`](npm-org-setup.md) — one-time npm org + token setup.
- [`../../CHANGELOG.md`](../../CHANGELOG.md) — human-curated changelog (release-please appends).
- [release-please action docs](https://github.com/googleapis/release-please-action).
