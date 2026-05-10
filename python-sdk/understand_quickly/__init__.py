"""understand-quickly Python SDK.

A thin client for the public registry of code-knowledge graphs at
https://looptech-ai.github.io/understand-quickly/.

>>> from understand_quickly import Registry
>>> reg = Registry()
>>> entries = reg.list(status="ok")
"""

from __future__ import annotations

from .aclient import AsyncRegistry
from .client import (
    DEFAULT_REGISTRY_URL,
    ENV_VAR,
    Registry,
    RegistryError,
    RegistryHTTPError,
    RegistryParseError,
)
from .types import (
    Entry,
    EntryStatus,
    Graph,
    SearchHit,
    Stats,
    StatsConcept,
    StatsKind,
    StatsLanguage,
    StatsTotals,
    TopKind,
    WellKnown,
    WellKnownRepo,
)

__version__ = "0.1.0"

__all__ = [
    "__version__",
    # clients
    "Registry",
    "AsyncRegistry",
    # errors
    "RegistryError",
    "RegistryHTTPError",
    "RegistryParseError",
    # constants
    "DEFAULT_REGISTRY_URL",
    "ENV_VAR",
    # types
    "Entry",
    "EntryStatus",
    "Graph",
    "SearchHit",
    "Stats",
    "StatsConcept",
    "StatsKind",
    "StatsLanguage",
    "StatsTotals",
    "TopKind",
    "WellKnown",
    "WellKnownRepo",
]
