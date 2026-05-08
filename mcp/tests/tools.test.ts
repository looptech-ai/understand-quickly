import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  clearCache,
  clearStatsCache,
} from "../src/registry.ts";
import {
  findGraphForRepo,
  parseGithubUrl,
  levenshtein,
} from "../src/tools/find-graph-for-repo.ts";
import { searchConcepts } from "../src/tools/search-concepts.ts";
import type {
  FetchImpl,
  Registry,
  RegistryEntry,
  StatsJson,
} from "../src/types.ts";

const REGISTRY_URL = "https://example.invalid/registry.json";
const STATS_URL = "https://example.invalid/stats.json";

function makeRegistry(extras?: Partial<Registry>): Registry {
  const entries: RegistryEntry[] = [
    {
      id: "alice/python-graph",
      format: "understand-anything@1",
      graph_url: "https://example.invalid/alice.json",
      status: "ok",
      tags: ["python"],
      last_synced: "2026-05-07T00:00:00Z",
      last_sha: "abc123",
      source_sha: "abc123",
      head_sha: "def456",
      commits_behind: 17,
    },
    {
      id: "bob/ts-graph",
      format: "understand-anything@1",
      graph_url: "https://example.invalid/bob.json",
      status: "ok",
      tags: ["typescript"],
    },
    {
      id: "carol/rust-graph",
      format: "gitnexus@1",
      graph_url: "https://example.invalid/carol.json",
      status: "ok",
      tags: ["rust"],
    },
  ];
  return {
    schema_version: 1,
    generated_at: "2026-05-07T00:00:00Z",
    entries,
    ...extras,
  };
}

function makeStats(extras?: Partial<StatsJson>): StatsJson {
  return {
    schema_version: 1,
    generated_at: "2026-05-07T00:00:00Z",
    totals: { entries: 3, nodes: 100, edges: 200 },
    kinds: [],
    languages: [],
    concepts: [
      { term: "parser", entries: 3, samples: ["alice/python-graph", "bob/ts-graph", "carol/rust-graph"] },
      { term: "tokenizer", entries: 2, samples: ["alice/python-graph", "bob/ts-graph"] },
      { term: "embedding", entries: 2, samples: ["alice/python-graph", "carol/rust-graph"] },
    ],
    ...extras,
  };
}

interface FetchSpec {
  body?: unknown;
  ok?: boolean;
  status?: number;
}

function makeFetch(routes: Record<string, FetchSpec | (() => FetchSpec)>): {
  fetch: FetchImpl;
  calls: string[];
} {
  const calls: string[] = [];
  const fetch: FetchImpl = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const route = routes[url];
    const spec = typeof route === "function" ? route() : route;
    if (!spec) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
        text: async () => "",
      };
    }
    return {
      ok: spec.ok ?? true,
      status: spec.status ?? 200,
      statusText: "OK",
      json: async () => spec.body,
      text: async () => JSON.stringify(spec.body ?? null),
    };
  };
  return { fetch, calls };
}

describe("parseGithubUrl", () => {
  it("parses bare https URL", () => {
    assert.equal(
      parseGithubUrl("https://github.com/alice/python-graph"),
      "alice/python-graph",
    );
  });
  it("parses https URL with .git suffix", () => {
    assert.equal(
      parseGithubUrl("https://github.com/alice/python-graph.git"),
      "alice/python-graph",
    );
  });
  it("parses ssh URL", () => {
    assert.equal(
      parseGithubUrl("git@github.com:alice/python-graph.git"),
      "alice/python-graph",
    );
  });
  it("parses https URL with branch path", () => {
    assert.equal(
      parseGithubUrl("https://github.com/alice/python-graph/tree/main/src"),
      "alice/python-graph",
    );
  });
  it("parses https URL with trailing slash", () => {
    assert.equal(
      parseGithubUrl("https://github.com/alice/python-graph/"),
      "alice/python-graph",
    );
  });
  it("returns undefined for non-github URLs", () => {
    assert.equal(parseGithubUrl("https://gitlab.com/foo/bar"), undefined);
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    assert.equal(levenshtein("abc", "abc"), 0);
  });
  it("returns the edit distance", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
  });
  it("short-circuits when distance exceeds max", () => {
    assert.ok(levenshtein("abcdefghij", "zzzzzzzzzz", 2) > 2);
  });
});

describe("find_graph_for_repo", () => {
  beforeEach(() => clearCache());

  it("finds an entry by id (happy path)", async () => {
    const registry = makeRegistry();
    const { fetch } = makeFetch({ [REGISTRY_URL]: { body: registry } });
    const out = await findGraphForRepo(
      { id: "alice/python-graph" },
      { fetchImpl: fetch, source: REGISTRY_URL },
    );
    assert.equal(out.found, true);
    if (out.found) {
      assert.equal(out.id, "alice/python-graph");
      assert.equal(out.graph_url, "https://example.invalid/alice.json");
      assert.equal(out.commits_behind, 17);
      assert.equal(out.drift_summary, "behind by 17 commits");
      assert.equal(out.head_sha, "def456");
      assert.equal(out.source_sha, "abc123");
    }
  });

  it("finds an entry by github_url (4 forms)", async () => {
    const registry = makeRegistry();
    const urls = [
      "https://github.com/alice/python-graph",
      "https://github.com/alice/python-graph.git",
      "git@github.com:alice/python-graph.git",
      "https://github.com/alice/python-graph/tree/main/src",
    ];
    for (const url of urls) {
      clearCache();
      const { fetch } = makeFetch({ [REGISTRY_URL]: { body: registry } });
      const out = await findGraphForRepo(
        { github_url: url },
        { fetchImpl: fetch, source: REGISTRY_URL },
      );
      assert.equal(out.found, true, `should find for url ${url}`);
      if (out.found) {
        assert.equal(out.id, "alice/python-graph");
      }
    }
  });

  it("returns suggestions when not found (fuzzy match)", async () => {
    const registry = makeRegistry();
    const { fetch } = makeFetch({ [REGISTRY_URL]: { body: registry } });
    // "alice/python-graphs" has Levenshtein 1 from "alice/python-graph"
    const out = await findGraphForRepo(
      { id: "alice/python-graphs" },
      { fetchImpl: fetch, source: REGISTRY_URL },
    );
    assert.equal(out.found, false);
    if (!out.found) {
      assert.ok(
        out.suggestions.includes("alice/python-graph"),
        `expected alice/python-graph in suggestions, got ${out.suggestions.join(",")}`,
      );
      assert.ok(out.suggestions.length <= 5);
    }
  });

  it("rejects invalid id", async () => {
    const registry = makeRegistry();
    const { fetch } = makeFetch({ [REGISTRY_URL]: { body: registry } });
    await assert.rejects(
      () =>
        findGraphForRepo(
          { id: "no-slash-here" },
          { fetchImpl: fetch, source: REGISTRY_URL },
        ),
      /owner\/repo/,
    );
  });

  it("rejects unparseable github_url", async () => {
    const registry = makeRegistry();
    const { fetch } = makeFetch({ [REGISTRY_URL]: { body: registry } });
    await assert.rejects(
      () =>
        findGraphForRepo(
          { github_url: "not a url at all" },
          { fetchImpl: fetch, source: REGISTRY_URL },
        ),
      /Could not extract/,
    );
  });

  it("rejects empty input", async () => {
    await assert.rejects(
      () => findGraphForRepo({}),
      /at least one of/,
    );
  });
});

describe("search_concepts (default: stats.json)", () => {
  beforeEach(() => {
    clearCache();
    clearStatsCache();
  });

  it("returns matching concepts from stats.json (no id)", async () => {
    const stats = makeStats();
    const { fetch, calls } = makeFetch({
      [STATS_URL]: { body: stats },
    });
    const out = await searchConcepts(
      { query: "parse" },
      { fetchImpl: fetch, statsSource: STATS_URL, registrySource: REGISTRY_URL },
    );
    assert.equal(out.source, "stats");
    assert.ok(out.matches);
    assert.equal(out.matches!.length, 1);
    assert.equal(out.matches![0].term, "parser");
    assert.equal(out.matches![0].count, 3);
    assert.deepEqual(out.matches![0].samples, [
      "alice/python-graph",
      "bob/ts-graph",
      "carol/rust-graph",
    ]);
    // Stats hit only — no graph or registry calls.
    assert.equal(calls.length, 1);
  });

  it("falls back to fan-out when stats.json is unavailable", async () => {
    const registry = makeRegistry();
    const aliceGraph = {
      nodes: [
        { id: "n1", label: "Parser" },
        { id: "n2", label: "Lexer" },
      ],
    };
    const bobGraph = { nodes: [{ id: "n1", label: "Tokenizer" }] };
    const carolGraph = { nodes: [{ id: "n1", label: "EmbeddingsParser" }] };
    const { fetch } = makeFetch({
      [STATS_URL]: { ok: false, status: 404 },
      [REGISTRY_URL]: { body: registry },
      "https://example.invalid/alice.json": { body: aliceGraph },
      "https://example.invalid/bob.json": { body: bobGraph },
      "https://example.invalid/carol.json": { body: carolGraph },
    });
    const out = await searchConcepts(
      { query: "parser" },
      { fetchImpl: fetch, statsSource: STATS_URL, registrySource: REGISTRY_URL },
    );
    assert.equal(out.source, "fanout");
    assert.ok(out.results);
    // Two entries should match: alice (Parser) and carol (EmbeddingsParser).
    const matchedIds = out.results!.map((r) => r.id).sort();
    assert.deepEqual(matchedIds, ["alice/python-graph", "carol/rust-graph"]);
  });

  it("uses single-graph fan-out when id is provided", async () => {
    const registry = makeRegistry();
    const aliceGraph = {
      nodes: [
        { id: "n1", label: "Parser" },
        { id: "n2", label: "Lexer" },
      ],
    };
    const { fetch, calls } = makeFetch({
      [REGISTRY_URL]: { body: registry },
      "https://example.invalid/alice.json": { body: aliceGraph },
    });
    const out = await searchConcepts(
      { query: "lexer", id: "alice/python-graph" },
      { fetchImpl: fetch, statsSource: STATS_URL, registrySource: REGISTRY_URL },
    );
    assert.equal(out.source, "graph");
    assert.equal(out.scanned, 1);
    assert.ok(out.results);
    assert.equal(out.results!.length, 1);
    assert.equal(out.results![0].hits.length, 1);
    assert.equal(out.results![0].hits[0].matched_value, "Lexer");
    // Should not have hit stats.json.
    assert.ok(!calls.includes(STATS_URL), "stats.json should not be fetched in id mode");
  });

  it("rejects when id is not in registry", async () => {
    const registry = makeRegistry();
    const { fetch } = makeFetch({ [REGISTRY_URL]: { body: registry } });
    await assert.rejects(
      () =>
        searchConcepts(
          { query: "x", id: "ghost/nope" },
          { fetchImpl: fetch, statsSource: STATS_URL, registrySource: REGISTRY_URL },
        ),
      /No registry entry/,
    );
  });
});
