"""Shared fixtures for the understand-quickly SDK tests."""

from __future__ import annotations

import json
from typing import Any

import pytest


SAMPLE_REGISTRY: dict[str, Any] = {
    "schema_version": 1,
    "generated_at": "2026-05-09T04:09:10.746Z",
    "entries": [
        {
            "id": "looptech-ai/alpha",
            "owner": "looptech-ai",
            "repo": "alpha",
            "default_branch": "main",
            "format": "understand-anything@1",
            "graph_url": "https://example.test/alpha.json",
            "description": "Alpha demo repo about authentication and tokens.",
            "tags": ["demo", "python"],
            "status": "ok",
            "languages": ["python"],
            "last_synced": "2026-05-09T04:09:10.746Z",
        },
        {
            "id": "looptech-ai/beta",
            "owner": "looptech-ai",
            "repo": "beta",
            "default_branch": "main",
            "format": "gitnexus@1",
            "graph_url": "https://example.test/beta.json",
            "description": "Beta TypeScript service.",
            "tags": ["demo", "typescript"],
            "status": "missing",
            "languages": ["typescript"],
            "last_synced": "2026-05-09T04:09:10.629Z",
        },
        {
            "id": "Lum1104/Understand-Anything",
            "owner": "Lum1104",
            "repo": "Understand-Anything",
            "default_branch": "main",
            "format": "understand-anything@1",
            "graph_url": "https://example.test/ua.json",
            "description": "Upstream Understand-Anything project.",
            "tags": [],
            "status": "ok",
            "languages": [],
            "last_synced": "2026-05-09T04:09:10.475Z",
        },
    ],
}


SAMPLE_STATS: dict[str, Any] = {
    "schema_version": 1,
    "generated_at": "2026-05-09T04:09:11.078Z",
    "totals": {"entries": 3, "nodes": 25, "edges": 31},
    "kinds": [{"kind": "function", "count": 7, "entries": 2}],
    "languages": [{"language": "python", "entries": 1}],
    "concepts": [
        {
            "term": "auth",
            "entries": 1,
            "samples": ["looptech-ai/alpha"],
        },
        {
            "term": "graph",
            "entries": 3,
            "samples": [
                "looptech-ai/alpha",
                "looptech-ai/beta",
                "Lum1104/Understand-Anything",
            ],
        },
    ],
}


SAMPLE_GRAPH_ALPHA: dict[str, Any] = {
    "version": "understand-anything@1",
    "nodes": [{"id": "n1", "kind": "file", "name": "auth.py"}],
    "edges": [],
}


@pytest.fixture
def sample_registry() -> dict[str, Any]:
    return json.loads(json.dumps(SAMPLE_REGISTRY))


@pytest.fixture
def sample_stats() -> dict[str, Any]:
    return json.loads(json.dumps(SAMPLE_STATS))


@pytest.fixture
def sample_graph_alpha() -> dict[str, Any]:
    return json.loads(json.dumps(SAMPLE_GRAPH_ALPHA))


def make_responses(
    *,
    registry: dict[str, Any] | None = None,
    stats: dict[str, Any] | None = None,
    graphs: dict[str, dict[str, Any]] | None = None,
) -> dict[str, tuple[int, bytes]]:
    """Build a URL -> (status, body) map for the fake transports."""
    out: dict[str, tuple[int, bytes]] = {}
    if registry is not None:
        out["https://looptech-ai.github.io/understand-quickly/registry.json"] = (
            200,
            json.dumps(registry).encode("utf-8"),
        )
    if stats is not None:
        out["https://looptech-ai.github.io/understand-quickly/stats.json"] = (
            200,
            json.dumps(stats).encode("utf-8"),
        )
    if graphs:
        for url, body in graphs.items():
            out[url] = (200, json.dumps(body).encode("utf-8"))
    return out
