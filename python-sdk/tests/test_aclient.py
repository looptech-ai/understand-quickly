"""Tests for :class:`understand_quickly.AsyncRegistry` using ``httpx.MockTransport``."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from understand_quickly import AsyncRegistry, RegistryHTTPError, RegistryParseError
from understand_quickly.client import RegistryError

from .conftest import make_responses


def _build_handler(responses: dict[str, tuple[int, bytes]], counter: list[int]):
    def handler(request: httpx.Request) -> httpx.Response:
        counter[0] += 1
        url = str(request.url)
        if url not in responses:
            return httpx.Response(404, content=b'{"error":"not found"}')
        status, body = responses[url]
        return httpx.Response(status, content=body)

    return handler


def _make_async(
    responses: dict[str, tuple[int, bytes]], **kwargs: Any
) -> tuple[AsyncRegistry, list[int]]:
    counter = [0]
    transport = httpx.MockTransport(_build_handler(responses, counter))
    reg = AsyncRegistry(transport=transport, **kwargs)
    return reg, counter


@pytest.mark.asyncio
async def test_async_list_returns_entries(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry))
    async with reg:
        entries = await reg.list()
        assert len(entries) == 3


@pytest.mark.asyncio
async def test_async_list_filter_status(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry))
    async with reg:
        ok = await reg.list(status="ok")
        assert {e["id"] for e in ok} == {"looptech-ai/alpha", "Lum1104/Understand-Anything"}


@pytest.mark.asyncio
async def test_async_cache_hits(sample_registry: dict[str, Any]) -> None:
    reg, counter = _make_async(make_responses(registry=sample_registry))
    async with reg:
        await reg.list()
        await reg.list()
        assert counter[0] == 1


@pytest.mark.asyncio
async def test_async_cache_disabled(sample_registry: dict[str, Any]) -> None:
    reg, counter = _make_async(make_responses(registry=sample_registry), cache_ttl=0)
    async with reg:
        await reg.list()
        await reg.list()
        assert counter[0] == 2


@pytest.mark.asyncio
async def test_async_get_graph_resolves(
    sample_registry: dict[str, Any], sample_graph_alpha: dict[str, Any]
) -> None:
    reg, _ = _make_async(
        make_responses(
            registry=sample_registry,
            graphs={"https://example.test/alpha.json": sample_graph_alpha},
        )
    )
    async with reg:
        graph = await reg.get_graph("looptech-ai/alpha")
        assert graph["version"] == "understand-anything@1"


@pytest.mark.asyncio
async def test_async_get_graph_404(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry))
    async with reg:
        with pytest.raises(RegistryHTTPError) as info:
            await reg.get_graph("looptech-ai/alpha")
        assert info.value.status == 404


@pytest.mark.asyncio
async def test_async_get_graph_missing_entry(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry))
    async with reg:
        with pytest.raises(RegistryError, match="no entry"):
            await reg.get_graph("missing/nope")


@pytest.mark.asyncio
async def test_async_5xx() -> None:
    responses = {
        "https://looptech-ai.github.io/understand-quickly/registry.json": (502, b"bad gateway"),
    }
    reg, _ = _make_async(responses)
    async with reg:
        with pytest.raises(RegistryHTTPError) as info:
            await reg.list()
        assert info.value.status == 502


@pytest.mark.asyncio
async def test_async_malformed_json() -> None:
    responses = {
        "https://looptech-ai.github.io/understand-quickly/registry.json": (200, b"{nope"),
    }
    reg, _ = _make_async(responses)
    async with reg:
        with pytest.raises(RegistryParseError):
            await reg.list()


@pytest.mark.asyncio
async def test_async_find_graph_for_repo(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry))
    async with reg:
        hit = await reg.find_graph_for_repo("https://github.com/Lum1104/Understand-Anything")
        assert hit is not None and hit["id"] == "Lum1104/Understand-Anything"


@pytest.mark.asyncio
async def test_async_search_concepts(
    sample_registry: dict[str, Any], sample_stats: dict[str, Any]
) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry, stats=sample_stats))
    async with reg:
        hits = await reg.search("auth", scope="concepts")
        assert hits and hits[0]["entry_id"] == "looptech-ai/alpha"


@pytest.mark.asyncio
async def test_async_search_entries(
    sample_registry: dict[str, Any], sample_stats: dict[str, Any]
) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry, stats=sample_stats))
    async with reg:
        hits = await reg.search("typescript", scope="entries")
        assert {h["entry_id"] for h in hits} == {"looptech-ai/beta"}


@pytest.mark.asyncio
async def test_async_stats(sample_stats: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(stats=sample_stats))
    async with reg:
        out = await reg.stats()
        assert out["totals"]["entries"] == 3


@pytest.mark.asyncio
async def test_async_well_known() -> None:
    payload = {"schema_version": 1, "repos": []}
    responses = {
        "https://looptech-ai.github.io/understand-quickly/.well-known/repos.json": (
            200,
            json.dumps(payload).encode(),
        ),
    }
    reg, _ = _make_async(responses)
    async with reg:
        out = await reg.well_known()
        assert out["schema_version"] == 1


@pytest.mark.asyncio
async def test_async_clear_cache(sample_registry: dict[str, Any]) -> None:
    reg, counter = _make_async(make_responses(registry=sample_registry))
    async with reg:
        await reg.list()
        reg.clear_cache()
        await reg.list()
        assert counter[0] == 2


@pytest.mark.asyncio
async def test_async_context_closes_owned_client(sample_registry: dict[str, Any]) -> None:
    reg, _ = _make_async(make_responses(registry=sample_registry))
    async with reg:
        await reg.list()
    # After exit, the underlying client should be closed.
    assert reg._client.is_closed  # noqa: SLF001
