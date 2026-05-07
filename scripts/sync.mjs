import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { validateGraph } from './validate.mjs';
import { loadRegistry, shouldShard } from './shard.mjs';
import { extractStats } from './extract.mjs';

const MAX_SIZE = 50 * 1024 * 1024;
const DEAD_THRESHOLD = 7;

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
    etagFor = () => null
  } = opts;
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
    registry = JSON.parse(readFileSync(regPath, 'utf8'));
  }
  const targets = onlyId ? registry.entries.filter(e => e.id === onlyId) : registry.entries;

  const updated = [];
  for (const e of targets) {
    const r = await syncEntry(e);
    updated.push(r);
  }

  const next = {
    ...registry,
    generated_at: new Date().toISOString(),
    entries: registry.entries.map(orig => updated.find(u => u.id === orig.id) || orig)
  };

  if (dryRun) {
    console.log(JSON.stringify(next, null, 2));
    return;
  }

  writeFileSync(regPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`synced ${updated.length} entries`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
