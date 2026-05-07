# Security policy

## Reporting a vulnerability

Email **Alex.Mac@LoopTech.AI** with details. Please **do not** open a public issue.

Include:
- A short description of the issue.
- Steps to reproduce.
- Affected paths or workflows.

You will get an acknowledgement within a week. Confirmed issues are patched on `main`; a `SECURITY` label is applied to the resulting PR.

## Scope

In scope:
- The registry workflows (`.github/workflows/`).
- The validation and sync scripts (`scripts/`).
- The Pages site (`site/`).
- The CLI (`cli/`).
- The MCP server (`mcp/`).

Out of scope:
- Vulnerabilities in third-party tools that produce graphs (report upstream).
- Vulnerabilities in source repos listed in `registry.json` (report to that repo's owner).
- Denial-of-service via legitimate registry use (rate limits live with GitHub).

## Supported versions

Only the latest tagged release on `main` is supported. Older releases do not receive backports.
