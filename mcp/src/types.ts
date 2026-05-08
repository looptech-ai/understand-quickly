// Types for the understand-quickly registry. The live schema is owned by the
// parent project under `schemas/`; we duplicate just the surface this MCP
// server consumes. Anything we do not use is typed as `unknown` so that we
// stay forward-compatible with future schema additions.

export type RegistryEntryStatus = "ok" | "error" | "pending" | string;

export interface RegistryEntry {
  id: string;
  owner?: string;
  repo?: string;
  format: string;
  graph_url: string;
  description?: string;
  status?: RegistryEntryStatus;
  tags?: string[];
  last_sha?: string;
  last_synced?: string;
  source_sha?: string;
  head_sha?: string;
  commits_behind?: number;
  // Forward-compat: any additional fields we have not modelled yet.
  [key: string]: unknown;
}

export interface Registry {
  schema_version: number;
  generated_at: string;
  entries: RegistryEntry[];
  [key: string]: unknown;
}

// Subset of an entry returned by `list_repos`. Mirrors the spec.
export interface RepoSummary {
  id: string;
  format: string;
  description?: string;
  status?: RegistryEntryStatus;
  tags?: string[];
  last_synced?: string;
  graph_url: string;
}

export interface ListReposParams {
  format?: string;
  tag?: string;
  status?: string;
}

export interface GetGraphParams {
  id: string;
}

export interface SearchConceptsParams {
  query: string;
  id?: string;
}

export interface SearchHit {
  node_id?: string;
  label?: string;
  name?: string;
  matched_field: "id" | "label" | "name";
  matched_value: string;
}

export interface FindGraphForRepoParams {
  id?: string;
  github_url?: string;
}

// Shape of `stats.json` produced by scripts/aggregate.mjs. Only the fields the
// MCP server consumes are typed; other fields are kept as `unknown`.
export interface StatsConcept {
  term: string;
  entries: number;
  samples: string[];
}

export interface StatsJson {
  schema_version: number;
  generated_at: string;
  totals?: { entries: number; nodes: number; edges: number };
  kinds?: unknown[];
  languages?: unknown[];
  concepts: StatsConcept[];
  [key: string]: unknown;
}

// `fetch` and `Response` are global in Node 20+, but we keep a narrow alias
// so that callers can inject a fake during tests without pulling in DOM lib.
export type FetchImpl = (
  input: string | URL,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;
