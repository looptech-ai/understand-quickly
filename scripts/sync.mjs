import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateGraph } from './validate.mjs';
import { loadRegistry, shouldShard } from './shard.mjs';
import { extractStats, extractSourceSha, validateBodyLimits } from './extract.mjs';

const MAX_SIZE = 50 * 1024 * 1024;
const DEAD_THRESHOLD = 7;

// Soft per-run cap for drift detection. The unauthenticated GitHub REST API
// allows 60 req/hr/IP and each entry costs up to 2 calls (HEAD + compare), so
// we process at most this many entries per run and rotate via
// `last_drift_index` on the registry. 25 entries = 50 calls at worst, which
// stays under the limit and leaves headroom for retries on transient errors.
const DRIFT_BATCH = 25;

// Stats fields are server-derived: we recompute them on every successful sync
// and drop them on any non-`ok` status. Listing them centrally keeps the
// "clear" path cheap and avoids hard-coding the keys at every error branch.
const STATS_KEYS = ['nodes_count', 'edges_count', 'top_kinds', 'languages'];
const clearStats = (out) => { for (const k of STATS_KEYS) out[k] = undefined; };

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function withRetry(fn, { maxRetries = 2, delayMs = 100 } = {}) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < maxRetries) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export async function syncEntry(entry, opts = {}) {
  const {
    fetchImpl = fetch,
    now = () => new Date(),
    maxRetries = 2,
    useHead = false,
    etagFor = () => null,
    // When provided, called after a successful schema validation to populate
    // head_sha / commits_behind / drift_checked_at on the entry. Failures must
    // not change the entry status; the helper handles that internally.
    driftCheck = null
  } = opts;

  // Maintainer-only retraction: skip the network entirely and pass the entry
  // through untouched. We intentionally don't bump last_synced here either —
  // a revoked entry is frozen until a maintainer explicitly un-revokes it.
  if (entry.status === 'revoked') {
    return { ...entry };
  }

  const out = { ...entry };
  const stamp = () => { out.last_synced = now().toISOString(); };

  try {
    if (useHead) {
      const head = await withRetry(() => fetchImpl(entry.graph_url, { method: 'HEAD' }), { maxRetries });
      if (head.ok) {
        const len = head.headers.get('content-length');
        if (len && Number(len) > MAX_SIZE) {
          out.status = 'oversize';
          out.last_error = `size ${len} > ${MAX_SIZE}`;
          clearStats(out);
          stamp();
          return out;
        }
      }
    }

    const ifNoneMatch = etagFor(entry);
    const reqOpts = ifNoneMatch ? { headers: { 'If-None-Match': ifNoneMatch } } : {};
    const res = await withRetry(() => fetchImpl(entry.graph_url, reqOpts), { maxRetries });

    if (res.status === 304) {
      out.miss_count = 0;
      out.last_error = null;
      stamp();
      return out;
    }

    if (res.status === 404) {
      out.miss_count = (entry.miss_count || 0) + 1;
      out.status = out.miss_count >= DEAD_THRESHOLD ? 'dead' : 'missing';
      out.last_error = '404';
      clearStats(out);
      stamp();
      return out;
    }

    if (res.status >= 500) {
      out.status = 'transient_error';
      out.last_error = `${res.status}`;
      clearStats(out);
      stamp();
      return out;
    }

    if (!res.ok) {
      out.status = 'transient_error';
      out.last_error = `unexpected ${res.status}`;
      clearStats(out);
      stamp();
      return out;
    }

    const text = await res.text();
    if (text.length > MAX_SIZE) {
      out.status = 'oversize';
      out.last_error = `body ${text.length} > ${MAX_SIZE}`;
      clearStats(out);
      stamp();
      return out;
    }
    const sha = sha256(text);

    let body;
    try { body = JSON.parse(text); } catch (e) {
      out.status = 'invalid';
      out.last_error = `JSON parse: ${e.message}`;
      clearStats(out);
      stamp();
      return out;
    }

    // Adversarial-graph defense: structural caps applied post-parse. A body
    // that's small in bytes can still be hostile in shape (schema bomb,
    // poisoned labels), so this runs *before* schema validation — Ajv has its
    // own perf cliffs on million-node bodies and we'd rather fail fast.
    const limits = validateBodyLimits(body, entry.format);
    if (!limits.ok) {
      out.status = limits.status;
      out.last_error = limits.error;
      clearStats(out);
      stamp();
      return out;
    }

    const v = validateGraph(entry.format, body);
    if (!v.ok) {
      out.status = 'invalid';
      out.last_error = v.errors.map(e => e.message).join('; ');
      clearStats(out);
      stamp();
      return out;
    }

    out.status = 'ok';
    out.miss_count = 0;
    out.last_error = null;
    out.last_sha = sha;
    out.size_bytes = text.length;
    // Stats are best-effort: an unknown format just yields {} which leaves
    // any pre-existing stats fields untouched. We explicitly set the four
    // keys for known formats so a previously-stat'd entry whose format we
    // no longer recognise doesn't carry stale numbers forward.
    const stats = extractStats(entry.format, body);
    for (const k of STATS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(stats, k)) out[k] = stats[k];
    }
    // source_sha is producer-supplied — sniff from the validated graph body.
    // Sync NEVER invents one; if the producer didn't write a 40-hex sha, we
    // leave the field as null (or unset) so consumers can't be misled.
    const sniffed = extractSourceSha(entry.format, body);
    if (sniffed) out.source_sha = sniffed;
    else if (!out.source_sha) out.source_sha = null;

    // Drift detection: best-effort. Failures (rate-limit, network, missing
    // source_sha) leave head_sha/commits_behind null but always stamp
    // drift_checked_at so callers can tell "we tried" from "never tried".
    if (driftCheck) {
      try {
        const drift = await driftCheck(out, { fetchImpl, now });
        if (drift) {
          out.head_sha = drift.head_sha ?? null;
          out.commits_behind = drift.commits_behind ?? null;
          out.drift_checked_at = drift.drift_checked_at || now().toISOString();
        }
      } catch (e) {
        // Never fail a sync because of a drift-check exception, but DO log to
        // stderr so a chronic drift-detector outage is observable in CI.
        // last_error is reserved for the body fetch/validate result; surfacing
        // drift errors there would mask invalid/missing statuses.
        console.warn(`[drift] ${entry.id}: ${e?.message || String(e)}`);
        out.head_sha = out.head_sha ?? null;
        out.commits_behind = out.commits_behind ?? null;
        out.drift_checked_at = now().toISOString();
      }
    }

    stamp();
    return out;
  } catch (e) {
    out.status = 'transient_error';
    out.last_error = e.message || String(e);
    clearStats(out);
    stamp();
    return out;
  }
}

/**
 * Best-effort drift detector backed by the unauthenticated GitHub REST API.
 *
 * Two calls:
 *   1) `GET /repos/{owner}/{repo}/commits/{branch}` -> `head_sha` (.sha).
 *   2) `GET /repos/{owner}/{repo}/compare/{source_sha}...{head_sha}`
 *      -> `commits_behind` (.behind_by; semantics: "how many commits the BASE
 *      is behind the HEAD", which is exactly what we want when BASE is
 *      `source_sha` and HEAD is the branch tip).
 *
 * Failure modes — all return a "drift_checked_at only" payload, never throw:
 *   - missing source_sha   → can't compare; head_sha stays null.
 *   - 403 with rate-limit  → respect the budget; head_sha stays null.
 *   - any non-2xx          → leave fields null.
 *   - fetch / parse errors → caught by syncEntry's outer try.
 *
 * @returns {{ head_sha: string|null, commits_behind: number|null, drift_checked_at: string }}
 */
export async function checkDrift(entry, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();
  const result = { head_sha: null, commits_behind: null, drift_checked_at: stamp() };

  if (!entry || !entry.owner || !entry.repo) return result;
  const branch = entry.default_branch || 'main';
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'understand-quickly-sync'
  };

  // 1) Resolve current HEAD on the default branch.
  let headSha;
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${entry.owner}/${entry.repo}/commits/${branch}`,
      { headers }
    );
    if (!res || !res.ok) return result;
    const json = await res.json();
    if (typeof json?.sha !== 'string') return result;
    headSha = json.sha;
  } catch {
    return result;
  }
  result.head_sha = headSha;

  // 2) If we don't have a producer-supplied source_sha there's nothing to
  //    compare against — set head_sha but leave commits_behind null.
  if (typeof entry.source_sha !== 'string' || entry.source_sha.length !== 40) {
    return result;
  }
  if (entry.source_sha === headSha) {
    result.commits_behind = 0;
    return result;
  }

  // 3) Compare. .behind_by is the count of commits BASE is behind HEAD,
  //    i.e. how stale source_sha is relative to head — exactly the metric we
  //    want. Some compare endpoints invert direction; we trust the documented
  //    contract (BASE...HEAD => behind_by reflects BASE staleness).
  try {
    const cmpRes = await fetchImpl(
      `https://api.github.com/repos/${entry.owner}/${entry.repo}/compare/${entry.source_sha}...${headSha}`,
      { headers }
    );
    if (!cmpRes || !cmpRes.ok) return result;
    const cmp = await cmpRes.json();
    if (typeof cmp?.behind_by === 'number') {
      result.commits_behind = cmp.behind_by;
    } else if (typeof cmp?.ahead_by === 'number') {
      // Defensive fallback — see note above.
      result.commits_behind = cmp.ahead_by;
    }
  } catch {
    // Swallow: we already have head_sha, just leave commits_behind null.
  }
  return result;
}

/**
 * Pick the slice of entries that get a drift check this run, given a soft
 * budget. We rotate through the registry by `last_drift_index` so a
 * 1000-entry registry still gets full coverage every ~40 runs without ever
 * blowing the 60 req/hr unauthenticated GitHub budget.
 *
 * Returns `{ ids: Set<string>, nextIndex: number }`. Callers wire `ids` into
 * the per-entry sync (only entries whose id is in `ids` get `driftCheck`),
 * and persist `nextIndex` back to the registry's `last_drift_index`.
 */
export function selectDriftBatch(entries, lastIndex = 0, batch = DRIFT_BATCH) {
  const ids = new Set();
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ids, nextIndex: 0 };
  }
  const n = entries.length;
  // Eligible = anything that isn't `revoked` (those skip the network entirely).
  const eligible = entries.filter(e => e?.status !== 'revoked');
  if (eligible.length === 0) return { ids, nextIndex: 0 };

  const start = Number.isFinite(lastIndex) && lastIndex >= 0 ? lastIndex % n : 0;
  let idx = start;
  let picked = 0;
  // Walk the registry circularly; bounded by `n` so we can't loop forever
  // even if `eligible` was somehow empty after the early-out above.
  for (let i = 0; i < n && picked < batch; i++) {
    const e = entries[idx];
    if (e && e.status !== 'revoked' && typeof e.id === 'string') {
      ids.add(e.id);
      picked++;
    }
    idx = (idx + 1) % n;
  }
  return { ids, nextIndex: idx };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const onlyId = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  const regIdx = args.indexOf('--registry');
  const regPath = regIdx >= 0 ? args[regIdx + 1] : 'registry.json';

  // Use the sharded read path so any future entries/<a-z0-9>.json shards are
  // transparently merged. Today the write path still targets `regPath` only
  // (the canonical top-level file). When we cross the threshold we just warn.
  //
  // The sharded loader looks for `<root>/registry.json` + `<root>/entries/`,
  // so it only applies when --registry points at a file literally named
  // `registry.json`. For an arbitrary --registry path (e.g. the smoke
  // fixture at tests/registry-smoke.json) we fall back to the legacy direct
  // read so power-user overrides keep working.
  const absReg = resolve(regPath);
  const useShardedLoader = basename(absReg) === 'registry.json';
  let registry;
  if (useShardedLoader) {
    registry = loadRegistry({ root: dirname(absReg) });
    if (shouldShard(registry)) {
      console.warn(
        `[shard] registry has ${registry.entries.length} entries (> 1000); consider sharding into entries/<a-z>.json`
      );
    }
  } else {
    let raw;
    try {
      raw = readFileSync(regPath, 'utf8');
    } catch (e) {
      console.error(`failed to read ${regPath}: ${e?.message || e}`);
      process.exit(1);
    }
    try {
      registry = JSON.parse(raw);
    } catch (e) {
      console.error(`registry at ${regPath} is not valid JSON: ${e?.message || e}`);
      process.exit(1);
    }
  }
  const targets = onlyId ? registry.entries.filter(e => e.id === onlyId) : registry.entries;

  // Pick the drift-check rotation slice up-front so each entry's sync knows
  // whether it's eligible. We rotate via `last_drift_index` on the registry
  // top-level metadata so successive runs cover the whole registry without
  // blowing the 60 req/hr unauthenticated GitHub budget.
  const { ids: driftIds, nextIndex } = selectDriftBatch(
    registry.entries,
    registry.last_drift_index || 0
  );

  const updated = [];
  for (const e of targets) {
    const opts = driftIds.has(e.id) ? { driftCheck: checkDrift } : {};
    const r = await syncEntry(e, opts);
    updated.push(r);
  }

  // Sort entries by id before write so downstream diffs are stable regardless
  // of how `registry.entries.map` happens to interleave originals and updates.
  // The sort is idempotent — registries that are already sorted produce no
  // diff. Pinning the order also makes adversarial reordering attacks visible.
  //
  // O(n) merge via a Map of updated entries by id; the previous version did an
  // updated.find() per original entry, which was O(n²) and got noticeable past
  // a few hundred entries.
  const updatedById = new Map(updated.map(u => [u.id, u]));
  const mergedEntries = registry.entries
    .map(orig => updatedById.get(orig.id) || orig)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const next = {
    ...registry,
    generated_at: new Date().toISOString(),
    last_drift_index: nextIndex,
    entries: mergedEntries
  };

  if (dryRun) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  // Atomic write: drop the new contents into a sibling tmp file, then rename
  // over the canonical path. A crash mid-write leaves the original intact
  // (rename is atomic on POSIX; close-enough on Windows). Without this, an
  // ENOSPC or signal during the JSON.stringify->write window would truncate
  // the registry to zero bytes — a hard outage for every consumer.
  const tmp = `${regPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameSync(tmp, regPath);
  console.log(`synced ${updated.length} entries`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
