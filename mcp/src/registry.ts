import { isIP } from "node:net";
import type {
  FetchImpl,
  Registry,
  RegistryEntry,
  StatsJson,
} from "./types.js";

export const DEFAULT_REGISTRY_URL =
  "https://looptech-ai.github.io/understand-quickly/registry.json";
export const DEFAULT_STATS_URL =
  "https://looptech-ai.github.io/understand-quickly/stats.json";
export const DEFAULT_TTL_MS = 60_000;

interface CacheRecord {
  fetchedAt: number;
  registry: Registry;
}

interface StatsCacheRecord {
  fetchedAt: number;
  stats: StatsJson;
}

// Module-level cache keyed by source URL. Each MCP process gets its own cache;
// that is fine for a stub server because the registry is small.
const cache = new Map<string, CacheRecord>();
const statsCache = new Map<string, StatsCacheRecord>();

export interface LoadRegistryOptions {
  source?: string;
  fetchImpl?: FetchImpl;
  cacheKey?: string;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Load `registry.json` with a small in-memory TTL cache.
 *
 * Pure-ish: all I/O and time goes through injected dependencies, so callers in
 * tests can drive the cache with a fake fetch and clock.
 */
export async function loadRegistry(
  options: LoadRegistryOptions = {},
): Promise<Registry> {
  const source = options.source ?? DEFAULT_REGISTRY_URL;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  const cacheKey = options.cacheKey ?? source;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  if (!fetchImpl) {
    throw new Error(
      "No fetch implementation available. Pass `fetchImpl` or run on Node 20+.",
    );
  }

  const cached = cache.get(cacheKey);
  if (cached && now() - cached.fetchedAt < ttlMs) {
    return cached.registry;
  }

  const response = await fetchImpl(source);
  if (!response.ok) {
    // 5xx is transient; if we have a stale cache entry, prefer it over a hard
    // throw so an upstream Pages outage doesn't take down every MCP client.
    if (response.status >= 500 && cached) return cached.registry;
    throw new Error(
      `Failed to fetch registry from ${source}: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as Registry;
  if (!body || !Array.isArray(body.entries)) {
    throw new Error(
      `Registry at ${source} is malformed: missing \`entries\` array`,
    );
  }
  // Guard against silently consuming a future v2 registry with v1-shaped
  // tools. The registry's meta.schema.json pins schema_version to const 1; an
  // older MCP build hitting a newer registry should fail loudly so users know
  // to upgrade rather than getting half-broken responses.
  const sv = (body as { schema_version?: unknown }).schema_version;
  if (sv !== undefined && sv !== 1) {
    throw new Error(
      `Registry at ${source} reports schema_version=${String(sv)}; this MCP build supports schema_version=1. Upgrade @looptech-ai/understand-quickly-mcp.`,
    );
  }
  cache.set(cacheKey, { fetchedAt: now(), registry: body });
  return body;
}

/** Drop the cached registry for a given key (default: the configured source). */
export function clearCache(cacheKey?: string): void {
  if (cacheKey === undefined) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey);
}

export interface LoadStatsOptions {
  source?: string;
  fetchImpl?: FetchImpl;
  cacheKey?: string;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Load `stats.json` with the same TTL caching pattern as `loadRegistry`.
 *
 * Validates the minimum shape (schema_version + concepts array). Throws on
 * non-OK HTTP, malformed body, or missing concepts; callers that want a
 * fallback path should catch.
 */
export async function loadStats(
  options: LoadStatsOptions = {},
): Promise<StatsJson> {
  const source = options.source ?? DEFAULT_STATS_URL;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  const cacheKey = options.cacheKey ?? source;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  if (!fetchImpl) {
    throw new Error(
      "No fetch implementation available. Pass `fetchImpl` or run on Node 20+.",
    );
  }

  const cached = statsCache.get(cacheKey);
  if (cached && now() - cached.fetchedAt < ttlMs) {
    return cached.stats;
  }

  const response = await fetchImpl(source);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch stats from ${source}: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as StatsJson;
  if (!body || !Array.isArray(body.concepts)) {
    throw new Error(
      `Stats at ${source} is malformed: missing \`concepts\` array`,
    );
  }
  statsCache.set(cacheKey, { fetchedAt: now(), stats: body });
  return body;
}

/** Drop the cached stats payload (default: every key). */
export function clearStatsCache(cacheKey?: string): void {
  if (cacheKey === undefined) {
    statsCache.clear();
    return;
  }
  statsCache.delete(cacheKey);
}

/**
 * Filter entries with a predicate. Trivial wrapper, but exported so the tool
 * layer composes via a single named function rather than ad-hoc `.filter`s.
 */
export function filterEntries(
  entries: RegistryEntry[],
  predicate: (entry: RegistryEntry) => boolean,
): RegistryEntry[] {
  return entries.filter(predicate);
}

/** Resolve the registry URL from env, falling back to the public default. */
export function resolveRegistrySource(): string {
  return process.env.UNDERSTAND_QUICKLY_REGISTRY ?? DEFAULT_REGISTRY_URL;
}

/** Resolve the stats URL from env, falling back to the public default. */
export function resolveStatsSource(): string {
  return process.env.UNDERSTAND_QUICKLY_STATS ?? DEFAULT_STATS_URL;
}

/**
 * Find an entry by id. Exposed for the `get_graph` and `search_concepts` tools.
 */
export function findEntryById(
  registry: Registry,
  id: string,
): RegistryEntry | undefined {
  return registry.entries.find((entry) => entry.id === id);
}

// SSRF guard: reject URLs that resolve to private / link-local / loopback /
// metadata addresses, or that use a non-https scheme. The registry's own
// schemas pin graph_url to https; this is defence-in-depth for the MCP path,
// where a malicious registry mirror or a misconfigured URL could otherwise
// trick this process into fetching cloud-metadata endpoints.
//
// Note: this checks the literal hostname, not a resolved IP. Full DNS-rebind
// protection requires a custom dispatcher; for v0.1 we accept that gap and
// rely on the surrounding HTTPS-only invariant (TLS makes rebinding harder
// since the cert must match the literal hostname).
export function assertSafeFetchUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (u.protocol !== "https:") {
    throw new Error(`Refusing non-https URL: ${rawUrl}`);
  }
  const host = u.hostname.toLowerCase();
  // Block obvious local / metadata targets by literal hostname.
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    throw new Error(`Refusing internal host: ${host}`);
  }
  // Block IPv4 literals in private/link-local/loopback ranges.
  const ipKind = isIP(host);
  if (ipKind === 4) {
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
      const [a, b] = ipv4.slice(1).map(Number);
      if (
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) || // link-local incl. AWS/GCP metadata 169.254.169.254
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a === 0
      ) {
        throw new Error(`Refusing private IPv4 host: ${host}`);
      }
    }
  } else if (ipKind === 6) {
    // URL.hostname strips the brackets from IPv6 literals (e.g. `fc00::1`,
    // not `[fc00::1]`), so a startsWith("[") check would never fire. Match
    // against the normalized address prefix directly.
    // - fc00::/7 (unique-local) → first hex digit 'f' + second 'c' or 'd'
    // - fe80::/10 (link-local) → first hex digit 'f' + second 'e' + third 8|9|a|b
    // - ::1 loopback (caught earlier by literal hostname check)
    // - ::ffff:0:0/96 IPv4-mapped → defer to Node which will resolve via dual-stack
    if (/^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) {
      throw new Error(`Refusing private IPv6 host: ${host}`);
    }
  }
  return u;
}

/** Fetch and parse a single graph URL. Used by `get_graph` and `search_concepts`. */
export async function fetchGraph(
  graphUrl: string,
  fetchImpl: FetchImpl = globalThis.fetch as unknown as FetchImpl,
): Promise<unknown> {
  assertSafeFetchUrl(graphUrl);
  const response = await fetchImpl(graphUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch graph from ${graphUrl}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}
