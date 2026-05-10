"""Asynchronous client for the understand-quickly registry, backed by ``httpx``."""

from __future__ import annotations

import time
from typing import Any, Iterable, Optional

import httpx

from .client import (
    DEFAULT_CACHE_TTL_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    RegistryError,
    RegistryHTTPError,
    RegistryParseError,
    USER_AGENT,
    _decode_json,
    _join,
    _matches,
    _normalize_repo_url,
    _resolve_base_url,
)
from .types import Entry, Graph, Registry as RegistryDoc, SearchHit, Stats, WellKnown


class AsyncRegistry:
    """Async client mirroring :class:`understand_quickly.Registry`.

    Use as an async context manager so the underlying ``httpx.AsyncClient``
    is closed cleanly::

        async with AsyncRegistry() as reg:
            entries = await reg.list(status="ok")
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        *,
        cache_ttl: float = DEFAULT_CACHE_TTL_SECONDS,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        client: Optional[httpx.AsyncClient] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self.base_url = _resolve_base_url(base_url)
        self.cache_ttl = float(cache_ttl)
        self.timeout = float(timeout)
        self._cache: dict[str, tuple[float, Any]] = {}
        self._owns_client = client is None
        if client is not None:
            self._client = client
        else:
            kwargs: dict[str, Any] = {
                "timeout": self.timeout,
                "headers": {"Accept": "application/json", "User-Agent": USER_AGENT},
            }
            if transport is not None:
                kwargs["transport"] = transport
            self._client = httpx.AsyncClient(**kwargs)

    # ---- lifecycle -------------------------------------------------------

    async def __aenter__(self) -> "AsyncRegistry":
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close the underlying ``httpx.AsyncClient`` when we own it."""
        if self._owns_client:
            await self._client.aclose()

    # ---- low-level fetch -------------------------------------------------

    async def _fetch_json(self, url: str) -> Any:
        now = time.monotonic()
        if self.cache_ttl > 0:
            cached = self._cache.get(url)
            if cached is not None and (now - cached[0]) < self.cache_ttl:
                return cached[1]
        try:
            resp = await self._client.get(url)
        except httpx.HTTPError as exc:
            raise RegistryError(f"GET {url} failed: {exc}") from exc
        if resp.status_code < 200 or resp.status_code >= 300:
            raise RegistryHTTPError(url, resp.status_code, resp.content)
        data = _decode_json(url, resp.content)
        if self.cache_ttl > 0:
            self._cache[url] = (now, data)
        return data

    def clear_cache(self) -> None:
        self._cache.clear()

    # ---- documents -------------------------------------------------------

    async def registry(self) -> RegistryDoc:
        return await self._fetch_json(_join(self.base_url, "registry.json"))

    async def well_known(self) -> WellKnown:
        return await self._fetch_json(_join(self.base_url, ".well-known/repos.json"))

    async def stats(self) -> Stats:
        return await self._fetch_json(_join(self.base_url, "stats.json"))

    # ---- high-level helpers ---------------------------------------------

    async def list(
        self,
        *,
        status: Optional[str] = None,
        format: Optional[str] = None,
        owner: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[Entry]:
        doc = await self.registry()
        entries: Iterable[Entry] = doc.get("entries", []) or []
        results: list[Entry] = []
        for entry in entries:
            if not _matches(entry, status=status, format=format, owner=owner):
                continue
            if tag is not None:
                tags = entry.get("tags") or []
                if tag not in tags:
                    continue
            results.append(entry)
        return results

    async def get_entry(self, entry_id: str) -> Optional[Entry]:
        for entry in await self.list():
            if entry.get("id") == entry_id:
                return entry
        return None

    async def get_graph(self, entry_id: str) -> Graph:
        entry = await self.get_entry(entry_id)
        if entry is None:
            raise RegistryError(f"no entry with id={entry_id!r}")
        graph_url = entry.get("graph_url")
        if not graph_url:
            raise RegistryError(f"entry {entry_id!r} has no graph_url")
        return await self._fetch_json(graph_url)

    async def find_graph_for_repo(self, repo: str) -> Optional[Entry]:
        norm = _normalize_repo_url(repo)
        if norm is None:
            return None
        owner, repo_name = norm
        for entry in await self.list():
            e_owner = (entry.get("owner") or "").lower()
            e_repo = (entry.get("repo") or "").lower()
            if e_owner == owner and e_repo == repo_name:
                return entry
        return None

    async def search(self, query: str, *, scope: str = "all") -> list[SearchHit]:
        if not query:
            return []
        q = query.lower()
        hits: list[SearchHit] = []

        if scope in ("all", "concepts"):
            try:
                stats = await self.stats()
            except RegistryError:
                stats = {}
            entry_lookup: dict[str, Entry] = {}
            try:
                entries = await self.list()
                entry_lookup = {e.get("id", ""): e for e in entries if e.get("id")}
            except RegistryError:
                entry_lookup = {}
            for concept in stats.get("concepts", []) or []:
                term = (concept.get("term") or "").lower()
                if q in term:
                    samples = concept.get("samples") or []
                    for sample in samples:
                        hits.append(
                            {
                                "term": concept.get("term", ""),
                                "entry_id": sample,
                                "entry": entry_lookup.get(sample, {}),
                                "samples": list(samples),
                                "count": int(concept.get("entries", 0) or 0),
                            }
                        )

        if scope in ("all", "entries"):
            for entry in await self.list():
                blob_parts: list[str] = []
                for key in ("id", "description", "format"):
                    val = entry.get(key)
                    if isinstance(val, str):
                        blob_parts.append(val)
                for key in ("tags", "languages"):
                    val = entry.get(key)
                    if isinstance(val, list):
                        blob_parts.extend(str(x) for x in val)
                blob = "\n".join(blob_parts).lower()
                if q in blob:
                    hits.append(
                        {
                            "term": query,
                            "entry_id": entry.get("id", ""),
                            "entry": entry,
                        }
                    )
        return hits


__all__ = [
    "AsyncRegistry",
    "RegistryError",
    "RegistryHTTPError",
    "RegistryParseError",
]
