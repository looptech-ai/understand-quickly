# @looptech-ai/understand-quickly-cli changelog

## [0.1.3](https://github.com/looptech-ai/understand-quickly/compare/cli-v0.1.2...cli-v0.1.3) (2026-05-12)


### Bug Fixes

* **security:** codeql triage — harden test fixtures, validate openUrl input, fix scorecard pins ([25cee13](https://github.com/looptech-ai/understand-quickly/commit/25cee134eb575f74b691641b773ced51f01fad20))

## [0.1.2] — 2026-05-10
- Fix Node 18/20 CI: `tests/*.test.mjs` is now quoted so the glob is
  expanded by the test runner, not the shell — previously, Node 18 and 20
  required `*` to be unquoted and failed `npm test`. Tests pass on the full
  Node 18/20/22 engines band.
- Inherit repo-level publish-time version regression guard
  (`scripts/check-versions.mjs`) so a `cli-vX.Y.Z` tag can never publish a
  package whose `package.json` says a different version.

## [0.1.1] — 2026-05-07
- Renamed to `@looptech-ai/understand-quickly-cli` (scoped under the
  `looptech-ai` npm org) so publishing no longer requires the unscoped name
  to be claimed first.

## [0.1.0] — 2026-05-07
- Initial release. `add` subcommand auto-detects id, format, graph_url, prompts for description, opens GitHub issue or PR.
