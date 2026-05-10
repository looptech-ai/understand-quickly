// Pre-publish version consistency check.
//
// Asserts that every published-or-publishable package in the repo has a
// well-formed semver version, and (when --tag <ref> is passed) that the
// tag's version matches the relevant package.json. Used by publish-cli /
// publish-mcp / publish-pysdk workflows as a regression guard so a tag
// like `cli-v0.2.0` can never publish a package whose `package.json` says
// `0.1.1`.
//
// Exit codes:
//   0 — all checks pass
//   1 — version mismatch or malformed semver

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?(\+[0-9A-Za-z-.]+)?$/;

const PACKAGES = [
  { id: 'root',   path: 'package.json',                 prefix: 'v',       publishable: false },
  { id: 'cli',    path: 'cli/package.json',             prefix: 'cli-v',   publishable: true  },
  { id: 'mcp',    path: 'mcp/package.json',             prefix: 'mcp-v',   publishable: true  },
  { id: 'pysdk',  path: 'python-sdk/pyproject.toml',    prefix: 'pysdk-v', publishable: true, kind: 'pyproject' },
];

export function readVersion({ path, kind }) {
  if (!existsSync(path)) return null;
  const body = readFileSync(path, 'utf8');
  if (kind === 'pyproject') {
    // hatchling/poetry both write `version = "X.Y.Z"` at top level under [project]
    const match = body.match(/^version\s*=\s*"([^"]+)"/m);
    return match ? match[1] : null;
  }
  try {
    return JSON.parse(body).version || null;
  } catch {
    return null;
  }
}

export function tagToVersion(tag, prefix) {
  if (!tag) return null;
  // strip refs/tags/ if passed wholesale
  const t = tag.replace(/^refs\/tags\//, '');
  if (!t.startsWith(prefix)) return null;
  return t.slice(prefix.length);
}

export function check({ tag = null, root = '.' } = {}) {
  const errors = [];
  const ok = [];

  for (const pkg of PACKAGES) {
    const path = resolve(root, pkg.path);
    const version = readVersion({ path, kind: pkg.kind });

    if (version == null) {
      if (pkg.publishable) errors.push(`${pkg.id}: missing version field at ${pkg.path}`);
      continue;
    }
    if (!SEMVER_RE.test(version)) {
      errors.push(`${pkg.id}: malformed semver "${version}" at ${pkg.path}`);
      continue;
    }
    ok.push({ id: pkg.id, version });

    if (tag) {
      const expected = tagToVersion(tag, pkg.prefix);
      if (expected !== null && expected !== version) {
        errors.push(
          `${pkg.id}: tag "${tag}" implies version "${expected}" but ${pkg.path} says "${version}"`
        );
      }
    }
  }

  return { ok, errors };
}

function main() {
  const args = process.argv.slice(2);
  const tagIdx = args.indexOf('--tag');
  const tag = tagIdx >= 0 ? args[tagIdx + 1] : process.env.GITHUB_REF || null;

  const { ok, errors } = check({ tag });

  for (const { id, version } of ok) console.log(`${id}: ${version}`);
  if (errors.length > 0) {
    console.error('\nVERSION CHECK FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\nversion check: OK');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
