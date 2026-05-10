// Regression tests for the publish-time version-consistency guard.
// Ensures `tag-version match` and `malformed semver` are both caught
// before they reach npm/PyPI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, readVersion, tagToVersion } from '../check-versions.mjs';

function fixtureRoot({ rootVersion = '0.2.0', cliVersion = '0.1.1', mcpVersion = '0.1.1', pysdkVersion = '0.1.0' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'uq-vcheck-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'r', version: rootVersion }));
  mkdirSync(join(root, 'cli'));
  writeFileSync(join(root, 'cli/package.json'), JSON.stringify({ name: 'c', version: cliVersion }));
  mkdirSync(join(root, 'mcp'));
  writeFileSync(join(root, 'mcp/package.json'), JSON.stringify({ name: 'm', version: mcpVersion }));
  mkdirSync(join(root, 'python-sdk'));
  writeFileSync(
    join(root, 'python-sdk/pyproject.toml'),
    `[project]\nname = "understand-quickly"\nversion = "${pysdkVersion}"\n`
  );
  return root;
}

test('check: all packages well-formed → ok', () => {
  const root = fixtureRoot();
  const { ok, errors } = check({ root });
  assert.equal(errors.length, 0);
  assert.equal(ok.length, 4);
});

test('check: malformed semver in cli → fails', () => {
  const root = fixtureRoot({ cliVersion: 'not-a-version' });
  const { errors } = check({ root });
  assert.ok(errors.some(e => /cli.*malformed semver/.test(e)));
});

test('check: tag mismatch on cli → fails', () => {
  const root = fixtureRoot({ cliVersion: '0.1.0' });
  const { errors } = check({ root, tag: 'cli-v0.2.0' });
  assert.ok(errors.some(e => /cli.*tag.*0\.2\.0.*0\.1\.0/.test(e)));
});

test('check: tag matches cli version → ok', () => {
  const root = fixtureRoot({ cliVersion: '0.2.0' });
  const { errors } = check({ root, tag: 'cli-v0.2.0' });
  assert.equal(errors.length, 0);
});

test('check: tag for mcp does not invalidate cli', () => {
  const root = fixtureRoot({ cliVersion: '0.1.1', mcpVersion: '0.1.1' });
  const { errors } = check({ root, tag: 'mcp-v0.1.1' });
  assert.equal(errors.length, 0);
});

test('check: pysdk version read from pyproject.toml', () => {
  const root = fixtureRoot({ pysdkVersion: '0.3.0' });
  const { errors } = check({ root, tag: 'pysdk-v0.3.0' });
  assert.equal(errors.length, 0);
});

test('check: pysdk tag mismatch → fails', () => {
  const root = fixtureRoot({ pysdkVersion: '0.3.0' });
  const { errors } = check({ root, tag: 'pysdk-v0.4.0' });
  assert.ok(errors.some(e => /pysdk.*tag.*0\.4\.0.*0\.3\.0/.test(e)));
});

test('check: refs/tags/ prefix tolerated', () => {
  const root = fixtureRoot({ cliVersion: '0.5.0' });
  const { errors } = check({ root, tag: 'refs/tags/cli-v0.5.0' });
  assert.equal(errors.length, 0);
});

test('check: tag for unknown prefix is ignored', () => {
  const root = fixtureRoot();
  const { errors } = check({ root, tag: 'random-v9.9.9' });
  assert.equal(errors.length, 0);
});

test('readVersion: returns null on missing file', () => {
  assert.equal(readVersion({ path: '/nope/none.json' }), null);
});

test('readVersion: returns null on malformed JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'uq-vcheck-'));
  writeFileSync(join(root, 'p.json'), '{not json');
  assert.equal(readVersion({ path: join(root, 'p.json') }), null);
});

test('tagToVersion: strips refs/tags/ + prefix', () => {
  assert.equal(tagToVersion('refs/tags/cli-v0.1.2', 'cli-v'), '0.1.2');
  assert.equal(tagToVersion('cli-v1.0.0', 'cli-v'), '1.0.0');
  assert.equal(tagToVersion('mcp-v0.5.0', 'cli-v'), null);
});
