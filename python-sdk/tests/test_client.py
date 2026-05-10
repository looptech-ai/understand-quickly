"""Tests for the synchronous :class:`understand_quickly.Registry`."""

from __future__ import annotations

import json
from typing import Any

import pytest

from understand_quickly import Registry, RegistryError, RegistryHTTPError, RegistryParseError

from .conftest import make_responses


class FakeTransport:
    """Records calls and returns canned (status, body) tuples by URL."""

    def __init__(self, responses: dict[str, tuple[int, bytes]]) -> None:
        self.responses = dict(responses)
        self.calls: list[str] = []

    def __call__(self, url: str, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
        self.calls.append(url)
        if url not in self.responses:
            return 404, b'{"error":"not found"}'
        return self.responses[url]


def _make(reg_data: dict[str, Any], **kwargs: Any) -> tuple[Registry, FakeTransport]:
    transport = FakeTransport(make_responses(registry=reg_data, **kwargs))
    return Registry(transport=transport), transport


def test_default_base_url_normalized() -> None:
    reg = Registry()
    assert reg.base_url == "https://looptech-ai.github.io/understand-quickly/"


def test_env_var_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNDERSTAND_QUICKLY_REGISTRY", "https://custom.test/registry")
    reg = Registry()
    assert reg.base_url == "https://custom.test/registry/"


def test_explicit_base_url_beats_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNDERSTAND_QUICKLY_REGISTRY", "https://other.test/")
    reg = Registry("https://explicit.test/")
    assert reg.base_url == "https://explicit.test/"


def test_rejects_non_http_scheme() -> None:
    with pytest.raises(RegistryError):
        Registry("file:///etc/passwd")


def test_list_returns_all_entries(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    entries = reg.list()
    assert [e["id"] for e in entries] == [
        "looptech-ai/alpha",
        "looptech-ai/beta",
        "Lum1104/Understand-Anything",
    ]


def test_list_filter_status(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    ok = reg.list(status="ok")
    assert {e["id"] for e in ok} == {"looptech-ai/alpha", "Lum1104/Understand-Anything"}


def test_list_filter_format_and_owner(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    hits = reg.list(format="gitnexus@1")
    assert len(hits) == 1 and hits[0]["id"] == "looptech-ai/beta"
    owned = reg.list(owner="looptech-ai")
    assert {e["id"] for e in owned} == {"looptech-ai/alpha", "looptech-ai/beta"}


def test_list_filter_tag(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    py = reg.list(tag="python")
    assert [e["id"] for e in py] == ["looptech-ai/alpha"]
    none = reg.list(tag="rust")
    assert none == []


def test_cache_hit_skips_second_fetch(sample_registry: dict[str, Any]) -> None:
    reg, transport = _make(sample_registry)
    reg.list()
    reg.list()
    # only one transport call despite two list() invocations
    assert len(transport.calls) == 1


def test_cache_disabled_refetches(sample_registry: dict[str, Any]) -> None:
    transport = FakeTransport(make_responses(registry=sample_registry))
    reg = Registry(transport=transport, cache_ttl=0)
    reg.list()
    reg.list()
    assert len(transport.calls) == 2


def test_clear_cache_forces_refetch(sample_registry: dict[str, Any]) -> None:
    reg, transport = _make(sample_registry)
    reg.list()
    reg.clear_cache()
    reg.list()
    assert len(transport.calls) == 2


def test_get_graph_resolves_entry(
    sample_registry: dict[str, Any], sample_graph_alpha: dict[str, Any]
) -> None:
    transport = FakeTransport(
        make_responses(
            registry=sample_registry,
            graphs={"https://example.test/alpha.json": sample_graph_alpha},
        )
    )
    reg = Registry(transport=transport)
    graph = reg.get_graph("looptech-ai/alpha")
    assert graph["version"] == "understand-anything@1"
    assert graph["nodes"][0]["name"] == "auth.py"


def test_get_graph_missing_entry_raises(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    with pytest.raises(RegistryError, match="no entry"):
        reg.get_graph("missing/nope")


def test_get_graph_404_raises_http_error(sample_registry: dict[str, Any]) -> None:
    transport = FakeTransport(make_responses(registry=sample_registry))
    reg = Registry(transport=transport)
    with pytest.raises(RegistryHTTPError) as info:
        reg.get_graph("looptech-ai/alpha")
    assert info.value.status == 404


def test_5xx_raises_http_error() -> None:
    transport = FakeTransport(
        {"https://looptech-ai.github.io/understand-quickly/registry.json": (503, b"upstream down")}
    )
    reg = Registry(transport=transport)
    with pytest.raises(RegistryHTTPError) as info:
        reg.list()
    assert info.value.status == 503


def test_malformed_json_raises_parse_error() -> None:
    transport = FakeTransport(
        {"https://looptech-ai.github.io/understand-quickly/registry.json": (200, b"{not json")}
    )
    reg = Registry(transport=transport)
    with pytest.raises(RegistryParseError):
        reg.list()


def test_find_graph_for_repo_url(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    hit = reg.find_graph_for_repo("https://github.com/Lum1104/Understand-Anything")
    assert hit is not None and hit["id"] == "Lum1104/Understand-Anything"


def test_find_graph_for_repo_slug_and_dotgit(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    a = reg.find_graph_for_repo("looptech-ai/alpha")
    assert a is not None and a["id"] == "looptech-ai/alpha"
    b = reg.find_graph_for_repo("https://github.com/looptech-ai/beta.git")
    assert b is not None and b["id"] == "looptech-ai/beta"


def test_find_graph_for_repo_misses(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    assert reg.find_graph_for_repo("ghost/repo") is None
    assert reg.find_graph_for_repo("not-a-repo") is None


def test_search_concepts_returns_samples(
    sample_registry: dict[str, Any], sample_stats: dict[str, Any]
) -> None:
    reg, _ = _make(sample_registry, stats=sample_stats)
    hits = reg.search("auth", scope="concepts")
    assert hits and hits[0]["term"] == "auth"
    assert hits[0]["entry_id"] == "looptech-ai/alpha"


def test_search_entries_matches_description(
    sample_registry: dict[str, Any], sample_stats: dict[str, Any]
) -> None:
    reg, _ = _make(sample_registry, stats=sample_stats)
    hits = reg.search("typescript", scope="entries")
    assert {h["entry_id"] for h in hits} == {"looptech-ai/beta"}


def test_search_all_combines_concepts_and_entries(
    sample_registry: dict[str, Any], sample_stats: dict[str, Any]
) -> None:
    reg, _ = _make(sample_registry, stats=sample_stats)
    hits = reg.search("auth", scope="all")
    # concept hit + entry description hit (alpha description mentions authentication)
    assert any(h.get("samples") for h in hits)
    assert any(h["entry_id"] == "looptech-ai/alpha" and not h.get("samples") for h in hits)


def test_search_empty_query_returns_empty(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    assert reg.search("") == []


def test_get_entry(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make(sample_registry)
    entry = reg.get_entry("looptech-ai/alpha")
    assert entry is not None and entry["format"] == "understand-anything@1"
    assert reg.get_entry("missing/nope") is None


def test_stats_fetches_stats_json(sample_stats: dict[str, Any]) -> None:
    transport = FakeTransport(make_responses(stats=sample_stats))
    reg = Registry(transport=transport)
    out = reg.stats()
    assert out["totals"]["entries"] == 3


def test_well_known_path() -> None:
    payload = {"schema_version": 1, "repos": []}
    transport = FakeTransport(
        {
            "https://looptech-ai.github.io/understand-quickly/.well-known/repos.json": (
                200,
                json.dumps(payload).encode(),
            )
        }
    )
    reg = Registry(transport=transport)
    out = reg.well_known()
    assert out["schema_version"] == 1
