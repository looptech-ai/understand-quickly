"""Synchronous client for the understand-quickly registry.

Uses :mod:`urllib.request` from the standard library so the sync client
has zero runtime dependencies. The async counterpart in
:mod:`understand_quickly.aclient` uses ``httpx`` for proper async I/O.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Iterable, Optional

from .types import Entry, Graph, Registry as RegistryDoc, SearchHit, Stats, WellKnown

DEFAULT_REGISTRY_URL = "https://looptech-ai.github.io/understand-quickly/"
ENV_VAR = "UNDERSTAND_QUICKLY_REGISTRY"
DEFAULT_CACHE_TTL_SECONDS = 60.0
DEFAULT_TIMEOUT_SECONDS = 30.0
USER_AGENT = "understand-quickly-python/0.1.0 (+https://github.com/looptech-ai/understand-quickly)"


# A sync transport callable: takes (url, headers, timeout) and returns
# (status_code, body_bytes). Tests inject a fake to avoid real HTTP.
SyncTransport = Callable[[str, dict[str, str], float], tuple[int, bytes]]


def _default_transport(url: str, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 — http(s) only, validated below
            return resp.getcode() or 200, resp.read()
    except urllib.error.HTTPError as exc:  # 4xx / 5xx — surface code + body
        return exc.code, exc.read() or b""


class RegistryError(Exception):
    """Base error for the understand-quickly SDK."""


class RegistryHTTPError(RegistryError):
    """Non-2xx response from the registry."""

    def __init__(self, url: str, status: int, body: bytes | str = b"") -> None:
        super().__init__(f"GET {url} -> HTTP {status}")
        self.url = url
        self.status = status
        self.body = body


class RegistryParseError(RegistryError):
    """Response body was not valid JSON."""


def _resolve_base_url(base_url: Optional[str]) -> str:
    raw = base_url or os.environ.get(ENV_VAR) or DEFAULT_REGISTRY_URL
    if not raw.endswith("/"):
        raw = raw + "/"
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise RegistryError(
            f"registry base URL must be http(s); got {raw!r} (scheme={parsed.scheme!r})"
        )
    return raw


def _join(base: str, path: str) -> str:
    return urllib.parse.urljoin(base, path.lstrip("/"))


def _decode_json(url: str, body: bytes) -> Any:
    try:
        return json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise RegistryParseError(f"GET {url} returned malformed JSON: {exc}") from exc


def _matches(entry: Entry, **filters: Any) -> bool:
    for key, expected in filters.items():
        if expected is None:
            continue
        actual = entry.get(key)  # type: ignore[call-overload]
        if isinstance(expected, (list, tuple, set)):
            if actual not in expected:
                return False
        elif actual != expected:
            return False
    return True


def _normalize_repo_url(value: str) -> tuple[str, str] | None:
    """Accept ``owner/repo`` or a GitHub URL; return ``(owner, repo)``."""
    if not value:
        return None
    s = value.strip()
    if s.startswith("http://") or s.startswith("https://"):
        parsed = urllib.parse.urlparse(s)
        parts = [p for p in parsed.path.split("/") if p]
        if len(parts) >= 2:
            owner, repo = parts[0], parts[1]
            if repo.endswith(".git"):
                repo = repo[:-4]
            return owner.lower(), repo.lower()
        return None
    if "/" in s:
        owner, _, repo = s.partition("/")
        if repo.endswith(".git"):
            repo = repo[:-4]
        return owner.lower(), repo.lower()
    return None


class Registry:
    """Synchronous client for the understand-quickly registry.

    Parameters
    ----------
    base_url:
        Override the registry root. Defaults to the
        ``UNDERSTAND_QUICKLY_REGISTRY`` environment variable, falling
        back to ``https://looptech-ai.github.io/understand-quickly/``.
    cache_ttl:
        In-memory TTL cache for fetched documents. ``0`` disables caching.
    timeout:
        Per-request timeout in seconds.
    transport:
        Optional injection point for tests; takes ``(url, headers, timeout)``
        and returns ``(status, body_bytes)``.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        *,
        cache_ttl: float = DEFAULT_CACHE_TTL_SECONDS,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        transport: Optional[SyncTransport] = None,
    ) -> None:
        self.base_url = _resolve_base_url(base_url)
        self.cache_ttl = float(cache_ttl)
        self.timeout = float(timeout)
        self._transport: SyncTransport = transport or _default_transport
        self._cache: dict[str, tuple[float, Any]] = {}

    # ---- low-level fetch -------------------------------------------------

    def _fetch_json(self, url: str) -> Any:
        now = time.monotonic()
        if self.cache_ttl > 0:
            cached = self._cache.get(url)
            if cached is not None and (now - cached[0]) < self.cache_ttl:
                return cached[1]
        headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
        status, body = self._transport(url, headers, self.timeout)
        if status < 200 or status >= 300:
            raise RegistryHTTPError(url, status, body)
        data = _decode_json(url, body)
        if self.cache_ttl > 0:
            self._cache[url] = (now, data)
        return data

    def clear_cache(self) -> None:
        """Drop the in-memory TTL cache."""
        self._cache.clear()

    # ---- documents -------------------------------------------------------

    def registry(self) -> RegistryDoc:
        """Fetch the full ``registry.json`` document."""
        return self._fetch_json(_join(self.base_url, "registry.json"))

    def well_known(self) -> WellKnown:
        """Fetch the discovery document at ``.well-known/repos.json``."""
        return self._fetch_json(_join(self.base_url, ".well-known/repos.json"))

    def stats(self) -> Stats:
        """Fetch the aggregate ``stats.json`` document."""
        return self._fetch_json(_join(self.base_url, "stats.json"))

    # ---- high-level helpers ---------------------------------------------

    def list(
        self,
        *,
        status: Optional[str] = None,
        format: Optional[str] = None,
        owner: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> list[Entry]:
        """List entries, optionally filtered by ``status``/``format``/``owner``/``tag``."""
        doc = self.registry()
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

    def get_entry(self, entry_id: str) -> Optional[Entry]:
        """Look up an entry by its ``owner/repo`` id."""
        for entry in self.list():
            if entry.get("id") == entry_id:
                return entry
        return None

    def get_graph(self, entry_id: str) -> Graph:
        """Resolve an entry id to its graph body, fetched from ``graph_url``."""
        entry = self.get_entry(entry_id)
        if entry is None:
            raise RegistryError(f"no entry with id={entry_id!r}")
        graph_url = entry.get("graph_url")
        if not graph_url:
            raise RegistryError(f"entry {entry_id!r} has no graph_url")
        return self._fetch_json(graph_url)

    def find_graph_for_repo(self, repo: str) -> Optional[Entry]:
        """Find the registry entry for a GitHub URL or ``owner/repo`` slug."""
        norm = _normalize_repo_url(repo)
        if norm is None:
            return None
        owner, repo_name = norm
        for entry in self.list():
            e_owner = (entry.get("owner") or "").lower()
            e_repo = (entry.get("repo") or "").lower()
            if e_owner == owner and e_repo == repo_name:
                return entry
        return None

    def search(self, query: str, *, scope: str = "all") -> list[SearchHit]:
        """Search across registry entries (and stats concepts when ``scope='all'``).

        - ``scope='entries'``: substring match against id/description/tags/format/languages.
        - ``scope='concepts'``: terms from ``stats.json`` only.
        - ``scope='all'`` (default): both, concepts first.
        """
        if not query:
            return []
        q = query.lower()
        hits: list[SearchHit] = []

        if scope in ("all", "concepts"):
            try:
                stats = self.stats()
            except RegistryError:
                stats = {}
            for concept in stats.get("concepts", []) or []:
                term = (concept.get("term") or "").lower()
                if q in term:
                    samples = concept.get("samples") or []
                    for sample in samples:
                        hits.append(
                            {
                                "term": concept.get("term", ""),
                                "entry_id": sample,
                                "entry": self.get_entry(sample) or {},
                                "samples": list(samples),
                                "count": int(concept.get("entries", 0) or 0),
                            }
                        )

        if scope in ("all", "entries"):
            for entry in self.list():
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
    "Registry",
    "RegistryError",
    "RegistryHTTPError",
    "RegistryParseError",
    "DEFAULT_REGISTRY_URL",
    "ENV_VAR",
]
