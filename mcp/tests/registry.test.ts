import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearCache,
  filterEntries,
  loadRegistry,
} from "../src/registry.ts";
import type { FetchImpl, Registry, RegistryEntry } from "../src/types.ts";

const SOURCE = "https://example.invalid/registry.json";

function makeRegistry(extras: Partial<Registry> = {}): Registry {
  const entries: RegistryEntry[] = [
    {
      id: "alice/python-graph",
      format: "understand-anything@1",
      graph_url: "https://example.invalid/alice.json",
      status: "ok",
      tags: ["python", "agents"],
    },
    {
      id: "bob/ts-graph",
      format: "understand-anything@1",
      graph_url: "https://example.invalid/bob.json",
      status: "error",
      tags: ["typescript"],
    },
    {
      id: "carol/rust-graph",
      format: "gitnexus@1",
      graph_url: "https://example.invalid/carol.json",
      status: "ok",
      tags: ["rust", "agents"],
    },
  ];
  return {
    schema_version: 1,
    generated_at: "2026-05-07T00:00:00Z",
    entries,
    ...extras,
  };
}

function makeFakeFetch(
  registry: Registry,
  counter: { calls: number },
  overrides: Partial<{ ok: boolean; status: number }> = {},
): FetchImpl {
  return async () => {
    counter.calls += 1;
    return {
      ok: overrides.ok ?? true,
      status: overrides.status ?? 200,
      statusText: "OK",
      json: async () => registry,
      text: async () => JSON.stringify(registry),
    };
  };
}

describe("loadRegistry caching", () => {
  beforeEach(() => clearCache());

  it("fetches once and serves a cache hit on the second call", async () => {
    const counter = { calls: 0 };
    const registry = makeRegistry();
    const fetchImpl = makeFakeFetch(registry, counter);
    const now = () => 1_000_000;

    const first = await loadRegistry({
      source: SOURCE,
      fetchImpl,
      ttlMs: 60_000,
      now,
    });
    const second = await loadRegistry({
      source: SOURCE,
      fetchImpl,
      ttlMs: 60_000,
      now,
    });

    assert.equal(counter.calls, 1, "second call should be served from cache");
    assert.equal(first, second, "both loads should return the same object");
  });

  it("refetches after the cache TTL expires", async () => {
    const counter = { calls: 0 };
    const registry = makeRegistry();
    const fetchImpl = makeFakeFetch(registry, counter);

    let nowValue = 1_000_000;
    const now = () => nowValue;

    await loadRegistry({ source: SOURCE, fetchImpl, ttlMs: 60_000, now });
    nowValue = 1_000_000 + 61_000; // > TTL
    await loadRegistry({ source: SOURCE, fetchImpl, ttlMs: 60_000, now });

    assert.equal(counter.calls, 2, "expired cache should trigger a refetch");
  });

  it("throws when the upstream registry returns non-ok", async () => {
    const counter = { calls: 0 };
    const registry = makeRegistry();
    const fetchImpl = makeFakeFetch(registry, counter, {
      ok: false,
      status: 503,
    });

    await assert.rejects(
      () =>
        loadRegistry({
          source: SOURCE,
          fetchImpl,
          ttlMs: 60_000,
          now: () => 1,
        }),
      /Failed to fetch registry/,
    );
  });
});

describe("filterEntries", () => {
  const registry = makeRegistry();

  it("filters by exact format match", () => {
    const out = filterEntries(
      registry.entries,
      (e) => e.format === "understand-anything@1",
    );
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((e) => e.id),
      ["alice/python-graph", "bob/ts-graph"],
    );
  });

  it("filters by status", () => {
    const out = filterEntries(registry.entries, (e) => e.status === "ok");
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((e) => e.id),
      ["alice/python-graph", "carol/rust-graph"],
    );
  });

  it("filters by tag membership", () => {
    const out = filterEntries(registry.entries, (e) =>
      (e.tags ?? []).includes("agents"),
    );
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((e) => e.id),
      ["alice/python-graph", "carol/rust-graph"],
    );
  });

  it("filters by combined predicates (status=ok AND tag=agents)", () => {
    const out = filterEntries(
      registry.entries,
      (e) => e.status === "ok" && (e.tags ?? []).includes("agents"),
    );
    assert.equal(out.length, 2);
  });

  it("returns an empty list when nothing matches", () => {
    const out = filterEntries(registry.entries, (e) => e.format === "nope");
    assert.equal(out.length, 0);
  });
});
