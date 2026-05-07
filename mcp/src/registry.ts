import type {
  FetchImpl,
  Registry,
  RegistryEntry,
} from "./types.js";

export const DEFAULT_REGISTRY_URL =
  "https://looptech-ai.github.io/understand-quickly/registry.json";
export const DEFAULT_TTL_MS = 60_000;

interface CacheRecord {
  fetchedAt: number;
  registry: Registry;
}

// Module-level cache keyed by source URL. Each MCP process gets its own cache;
// that is fine for a stub server because the registry is small.
const cache = new Map<string, CacheRecord>();

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

/**
 * Find an entry by id. Exposed for the `get_graph` and `search_concepts` tools.
 */
export function findEntryById(
  registry: Registry,
  id: string,
): RegistryEntry | undefined {
  return registry.entries.find((entry) => entry.id === id);
}

/** Fetch and parse a single graph URL. Used by `get_graph` and `search_concepts`. */
export async function fetchGraph(
  graphUrl: string,
  fetchImpl: FetchImpl = globalThis.fetch as unknown as FetchImpl,
): Promise<unknown> {
  const response = await fetchImpl(graphUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch graph from ${graphUrl}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}
