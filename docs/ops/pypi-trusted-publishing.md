# PyPI Trusted Publishing (OIDC)

`publish-pysdk.yml` is configured to publish via [PyPI Trusted Publishing][tp]
— PyPI exchanges a short-lived GitHub OIDC token for an upload token, so
**no `PYPI_API_TOKEN` secret is needed** once it's set up. The workflow
keeps a token-based fallback so this transition can be done at the
maintainer's convenience.

[tp]: https://docs.pypi.org/trusted-publishers/

## What you need to do once (PyPI side)

1. Sign in to <https://pypi.org/manage/project/understand-quickly/settings/publishing/>.
   - If the project hasn't been published yet, you'll need to register
     it first by either (a) publishing an initial release with a normal
     API token, then adding the trusted publisher; or (b) using the
     "Add a pending publisher" flow at
     <https://pypi.org/manage/account/publishing/> so the first release
     can land via OIDC.
2. **Add a new pending publisher** (or "Add publisher" if the project
   already exists) with these exact values:

   | Field | Value |
   |---|---|
   | PyPI Project Name | `understand-quickly` |
   | Owner | `looptech-ai` |
   | Repository name | `understand-quickly` |
   | Workflow filename | `publish-pysdk.yml` |
   | Environment name | *(leave blank)* |

3. Save. The publisher is active immediately.

## Verifying the wiring

Trigger a dry-run by re-running the most recent `publish-pysdk` run from
the Actions tab (or `gh workflow run publish-pysdk.yml`). The
`Publish to PyPI (Trusted Publishing / OIDC)` step should succeed; the
fallback step should be skipped. If the OIDC step exits with
`Trusted publishing exchange failure`, the publisher binding on PyPI
isn't matching — double-check the four fields above.

## Removing the token fallback

Once you've confirmed a successful OIDC publish on a real release:

1. Delete the `Publish to PyPI (API token fallback)` step from
   `.github/workflows/publish-pysdk.yml`.
2. Remove the `PYPI_API_TOKEN` secret at
   <https://github.com/looptech-ai/understand-quickly/settings/secrets/actions>.
3. Remove `permissions: contents: write` if you also remove the GitHub
   release asset upload (keep it if you want artifacts attached to the
   Release page).

## Why bother?

- **No secrets to rotate.** Token rotation, accidental leak, expiry —
  all gone.
- **Short-lived credentials.** The token PyPI returns lives ~15 minutes.
  A leak in workflow logs is meaningfully less catastrophic than a leak
  of a long-lived `pypi-AgEIcHlwaS5vcm...` token.
- **Bound to a specific workflow file.** Even if someone gets repo
  write access, they can't change the workflow file path and publish
  without also re-registering the publisher on PyPI.

## References

- PyPI Trusted Publishing docs: <https://docs.pypi.org/trusted-publishers/>
- `pypa/gh-action-pypi-publish` action: <https://github.com/pypa/gh-action-pypi-publish>
- GitHub OIDC for Actions:
  <https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect>
