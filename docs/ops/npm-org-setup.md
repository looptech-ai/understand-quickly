# npm publish setup — `@looptech-ai` scope

This is the one-time setup required to publish our scoped packages (`@looptech-ai/understand-quickly-cli` and `@looptech-ai/understand-quickly-mcp`) to npm.

> [!TIP]
> Looking for the **day-to-day release flow** (cut a new version, ship to
> npm / PyPI)? See [`release-process.md`](release-process.md). This doc is
> only for the one-time setup of the npm org + tokens.

## Why scoped (`@looptech-ai/...`)

- Locks the namespace to LoopTech AI — nobody else can squat on `@looptech-ai/anything`.
- Mirrors the GitHub org. People remember one brand.
- Keeps room for sibling packages later (`@looptech-ai/uq-publish-action-helpers`, `@looptech-ai/cmux`, etc.).
- Free on npm for public packages.

## Steps (one-time)

### 1. Confirm or create the npm organization

1. Sign in to https://www.npmjs.com (use the same email you use for LoopTech AI elsewhere).
2. Visit https://www.npmjs.com/org/looptech-ai
   - **Page loads with org details** → org exists. Skip to step 2.
   - **404 or "create this org"** → click `Create` (or go to https://www.npmjs.com/org/create) and:
     - Org name: **`looptech-ai`** (must match exactly, lowercase)
     - Plan: **Unlimited Public Packages — Free**
     - Default visibility: **Public**
3. Once the org exists, you are listed as **owner** (the account that created it).

### 2. Confirm your npm user account is in the org

1. Open https://www.npmjs.com/settings/looptech-ai/members
2. Confirm your username is listed with role **Owner** (or **Admin**).
3. If not: ask whoever the owner is to add you, or sign in as the owner account.

### 3. Generate a publish token

1. Open https://www.npmjs.com/settings/<your-username>/tokens (replace `<your-username>` with your actual handle).
2. Click **Generate New Token** → choose **Granular Access Token** (NOT Classic).
3. Fill:
   - **Token name**: `looptech-ai/understand-quickly publish`
   - **Expiration**: `1 year` (npm requires expiry on granular tokens; pick the longest)
   - **Allowed IP ranges**: leave blank
   - **Packages and scopes**:
     - Permission: **Read and write**
     - Select: `@looptech-ai/*` (all packages in the scope)
   - **Organizations**:
     - Permission: **Read** (don't grant write here — the package permission above is enough)
     - Select: `looptech-ai`
4. **Generate Token**. Copy the token (starts with `npm_...`). You can only view it once.

### 4. Store the token as a GitHub secret

**Do NOT paste the token in chat or commit it to git.**

From a terminal where you're authenticated with `gh`:
```bash
gh secret set NPM_TOKEN --repo looptech-ai/understand-quickly
```
You will be prompted for the value. Paste, hit Enter. Token is encrypted at rest in GitHub.

OR via web (mobile-friendly):
1. https://github.com/looptech-ai/understand-quickly/settings/secrets/actions
2. Click **NPM_TOKEN** if it exists → **Update secret**. Otherwise **New repository secret** with name `NPM_TOKEN`.
3. Paste the value. **Add secret** / **Update secret**.

### 5. Trigger first publish

After steps 1–4 are done, push tag `cli-v0.1.1` (the rename to scoped name landed in commit `<TBD>`):
```bash
git tag -a cli-v0.1.1 -m "cli v0.1.1 — scoped under @looptech-ai"
git push origin cli-v0.1.1
```
OR via web:
1. https://github.com/looptech-ai/understand-quickly/releases/new
2. Tag: `cli-v0.1.1`
3. Title: `cli v0.1.1 — scoped under @looptech-ai`
4. Publish release.

The `publish-cli.yml` workflow fires on the release event. Watch it at https://github.com/looptech-ai/understand-quickly/actions/workflows/publish-cli.yml.

### 6. Verify

After the workflow succeeds:
- https://www.npmjs.com/package/@looptech-ai/understand-quickly-cli should resolve.
- `npm view @looptech-ai/understand-quickly-cli version` returns `0.1.1`.
- `npx @looptech-ai/understand-quickly-cli --help` should print the help screen on any machine.

## When something goes wrong

| Failure mode | Cause | Fix |
|---|---|---|
| `npm error 404` on `PUT /@looptech-ai%2f...` | Org `looptech-ai` doesn't exist on npm yet | Step 1 |
| `npm error 403 You do not have permission to publish` | Token doesn't include `@looptech-ai/*` package write | Regenerate token (step 3) with the scope explicitly selected |
| `npm error 402 Payment required` | Trying to publish a private package on a free plan | Confirm `publishConfig.access = "public"` is in `package.json` (it is) |
| `npm error E401 Unable to authenticate` | Token expired or revoked | Regenerate (step 3), update secret (step 4) |
| Workflow says "skipped" | `NPM_TOKEN` secret isn't set | Step 4 |
| Provenance step fails | Workflow run isn't from a tagged release | Push a tag instead of running manually |

## Repeating this for the MCP server

Same drill. The MCP package was renamed to `@looptech-ai/understand-quickly-mcp` in the same commit. Once `NPM_TOKEN` is set (single secret reused), publishing it is just:
1. Create a `publish-mcp.yml` workflow (does not exist yet — open an issue or ping me to add it).
2. Push tag `mcp-v0.1.0`.
3. Releases at https://www.npmjs.com/package/@looptech-ai/understand-quickly-mcp.

## Repeating for PyPI

PyPI has no orgs. Package name `understand-quickly` (unscoped) is already claimed once we publish.

1. https://pypi.org → register (or sign in) → enable 2FA.
2. Account settings → API tokens → **Add API token** → **Entire account** scope.
3. Copy token (starts with `pypi-`).
4. `gh secret set PYPI_API_TOKEN --repo looptech-ai/understand-quickly` (or web).
5. Push tag `pysdk-v0.1.1`.
6. `pip install understand-quickly` works.

## Costs

All free.

| Item | Cost |
|---|---|
| npm public scoped packages | $0 |
| PyPI publishing | $0 |
| GitHub Actions for publish workflows | $0 (free tier) |
| GitHub repo secret storage | $0 |

Annual reminder: rotate tokens every ~12 months when they expire. The workflows skip cleanly if a token is unset, so an expired token causes a failed publish run, not a crash.
