// Walks the registry and writes one SVG per entry (plus an aggregate count
// badge) into `site/badges/`. Idempotent: if a badge file already contains
// the exact bytes we are about to write, we skip the write — that keeps
// `git diff --quiet site/badges/` honest in the sync workflow when nothing
// has actually changed.
//
// Usage:
//   node scripts/render-badges.mjs --registry registry.json --out site/badges
//
// Empty `entries` is a non-error: we still write `all.svg` showing
// `indexed | 0 entries` so the registry's own README badge renders before
// the first publisher lands.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { Buffer } from 'node:buffer';
import { renderEntryBadge, renderCountBadge, entrySlug } from './badge.mjs';
import { loadRegistry } from './shard.mjs';

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    registry: get('--registry', 'registry.json'),
    out: get('--out', 'site/badges')
  };
}

// Compare bytes-for-bytes so we can no-op when the badge content hasn't
// changed. JS string compare is fine here (both sides are utf-8 strings we
// just produced/read), but we pin to Buffer.compare to keep the contract
// "byte-for-byte" explicit.
function isUnchanged(path, nextContent) {
  if (!existsSync(path)) return false;
  try {
    const prev = readFileSync(path);
    const next = Buffer.from(nextContent, 'utf8');
    return Buffer.compare(prev, next) === 0;
  } catch {
    return false;
  }
}

function writeIfChanged(path, content) {
  if (isUnchanged(path, content)) return false;
  writeFileSync(path, content);
  return true;
}

/**
 * Pure renderer — writes badges to `outDir`. Returns counts so callers can
 * log a one-line summary (matches aggregate.mjs's `wrote stats.json (...)`
 * convention).
 */
export function renderBadges({ registry, outDir }) {
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  let skipped = 0;

  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  for (const entry of entries) {
    if (!entry?.owner || !entry?.repo) continue;
    const slug = entrySlug(entry);
    if (!slug || slug === '--') continue;
    const path = join(outDir, `${slug}.svg`);
    const svg = renderEntryBadge(entry);
    if (writeIfChanged(path, svg)) written++;
    else skipped++;
  }

  // Aggregate count badge — always emitted, even on empty registries, so
  // the registry README link never 404s.
  const allPath = join(outDir, 'all.svg');
  const allSvg = renderCountBadge(registry || { entries: [] });
  if (writeIfChanged(allPath, allSvg)) written++;
  else skipped++;

  return { written, skipped, total: entries.length };
}

async function main() {
  const { registry: regPath, out: outArg } = parseArgs(process.argv);

  const absReg = resolve(regPath);
  let registry;
  if (basename(absReg) === 'registry.json') {
    // Load via shard.mjs so sharded registries (when we eventually shard)
    // continue to work without a separate code path.
    registry = loadRegistry({ root: dirname(absReg) });
  } else {
    registry = JSON.parse(readFileSync(regPath, 'utf8'));
  }

  const outDir = resolve(outArg);
  const { written, skipped, total } = renderBadges({ registry, outDir });
  console.log(`badges: ${written} written, ${skipped} unchanged, ${total} entries (out=${outDir})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
