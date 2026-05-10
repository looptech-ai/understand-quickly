# understand-quickly-cli

[![npm version](https://img.shields.io/npm/v/understand-quickly-cli)](https://www.npmjs.com/package/understand-quickly-cli)
[![node engines](https://img.shields.io/node/v/understand-quickly-cli)](https://nodejs.org)

Add your repo to the [understand-quickly registry](https://looptech-ai.github.io/understand-quickly/) without touching JSON.

## Install

```bash
npm install -g understand-quickly-cli
# or, no install:
npx understand-quickly-cli add
```

## What it does

1. Reads your `git remote` to figure out `owner/repo`.
2. Looks for an existing knowledge-graph file in your repo. Sniffs the format.
3. Computes a raw GitHub URL.
4. Prints the registry entry; offers to either:
   - Open a prefilled "Add my repo" issue (the registry bot then opens the PR for you), or
   - Open a PR directly via `gh` (you'll need [`gh`](https://cli.github.com) installed).

## Flags

- `--id owner/repo` — override the auto-detected id.
- `--format <name>@<int>` — override the sniffed format.
- `--graph-url <url>` — override the computed URL.
- `--description "<text>"` — set inline.
- `--tags a,b,c` — set inline.
- `--print-entry` — print the entry JSON to stdout and exit (default in non-TTY).
- `--open-issue` — open the prefilled issue URL.
- `--open-pr` — open a PR via `gh` (forks the registry repo).
- `--registry <owner/repo>` — override the registry repo (default: `looptech-ai/understand-quickly`).

## No graph yet?

Pick a tool from the registry's [Supported formats](https://github.com/looptech-ai/understand-quickly#supported-formats), run it locally, commit the output, then come back here.

## Releasing

Tags `cli-v<semver>` trigger the publish workflow. Maintainer must add `NPM_TOKEN` to repo secrets (Automation token). Provenance is enabled.
