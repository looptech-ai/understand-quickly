"""TypedDict shapes returned by the understand-quickly registry.

These mirror ``registry.json``, ``site/.well-known/repos.json`` and
``site/stats.json`` as published by https://looptech-ai.github.io/understand-quickly/.
The shapes are intentionally permissive (``total=False``) — the registry
schema is versioned and may grow new fields; consumers should treat
unknown keys as harmless.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

EntryStatus = Literal[
    "pending",
    "ok",
    "missing",
    "invalid",
    "oversize",
    "transient_error",
    "dead",
    "renamed",
    "revoked",
]


class TopKind(TypedDict, total=False):
    kind: str
    count: int


class Entry(TypedDict, total=False):
    id: str
    owner: str
    repo: str
    default_branch: str
    format: str
    graph_url: str
    description: str
    tags: list[str]
    status: EntryStatus
    miss_count: int
    last_error: str | None
    last_sha: str | None
    size_bytes: int
    last_synced: str
    nodes_count: int
    edges_count: int
    top_kinds: list[TopKind]
    languages: list[str]
    source_sha: str | None
    head_sha: str | None
    commits_behind: int | None
    drift_checked_at: str
    renamed_to: str


class Registry(TypedDict, total=False):
    schema_version: int
    generated_at: str
    entries: list[Entry]
    last_drift_index: int


class StatsTotals(TypedDict, total=False):
    entries: int
    nodes: int
    edges: int


class StatsKind(TypedDict, total=False):
    kind: str
    count: int
    entries: int


class StatsLanguage(TypedDict, total=False):
    language: str
    entries: int


class StatsConcept(TypedDict, total=False):
    term: str
    entries: int
    samples: list[str]


class Stats(TypedDict, total=False):
    schema_version: int
    generated_at: str
    totals: StatsTotals
    kinds: list[StatsKind]
    languages: list[StatsLanguage]
    concepts: list[StatsConcept]


class WellKnownRepo(TypedDict, total=False):
    id: str
    format: str
    graph_url: str
    last_synced: str
    status: EntryStatus
    source_sha: str | None


class WellKnown(TypedDict, total=False):
    schema_version: int
    repos: list[WellKnownRepo]


# A graph body (``understand-anything@1``, ``gitnexus@1``, ``code-review-graph@1``,
# ``bundle@1``, ``generic@1``) — shape depends on the entry's ``format``.
Graph = dict[str, Any]


class SearchHit(TypedDict, total=False):
    """One result from :py:meth:`Registry.search`."""

    term: str
    entry_id: str
    entry: Entry
    # Optional richer fields when scope="all" surfaces concepts directly.
    samples: list[str]
    count: int
