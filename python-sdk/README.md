# understand-quickly (Python SDK)

A thin Python client for the [understand-quickly](https://looptech-ai.github.io/understand-quickly/) registry of code-knowledge graphs.

```bash
pip install understand-quickly
```

- **Sync client** (zero runtime deps beyond `httpx`): `Registry`
- **Async client** (using `httpx.AsyncClient`): `AsyncRegistry`
- **CLI**: `python -m understand_quickly` or `understand-quickly`
- 60-second in-memory TTL cache by default.

## Quick examples

```python
from understand_quickly import Registry

reg = Registry()  # default registry: looptech-ai.github.io/understand-quickly

# 1. List all healthy entries.
entries = reg.list(status="ok")

# 2. Filter by format.
ua = reg.list(format="understand-anything@1")

# 3. Resolve an entry id to its graph body.
graph = reg.get_graph("Lum1104/Understand-Anything")

# 4. Map a GitHub URL back to its registry entry.
hit = reg.find_graph_for_repo("https://github.com/owner/repo")

# 5. Cross-graph concept search (uses stats.json + entry metadata).
results = reg.search("auth", scope="all")
```

## Async equivalent

```python
import asyncio
from understand_quickly import AsyncRegistry

async def main() -> None:
    async with AsyncRegistry() as reg:
        entries = await reg.list(status="ok")
        graph = await reg.get_graph(entries[0]["id"])
        print(len(graph.get("nodes", [])))

asyncio.run(main())
```

## CLI

```
understand-quickly list [--status ok] [--format understand-anything@1] [--owner OWNER] [--tag TAG]
understand-quickly get-graph <entry_id>
understand-quickly find <github_url_or_owner/repo>
understand-quickly search <query> [--scope all|entries|concepts]
understand-quickly stats
```

JSON is emitted by default. Add `--pretty` for indented JSON (and a compact table for `list`). Both `python -m understand_quickly ...` and `understand-quickly ...` work after install.

Exit codes: `0` success, `1` not-found (`get-graph`, `find`), `2` HTTP/parse error, `64` usage error.

## Environment variables

| Name | Purpose | Default |
| --- | --- | --- |
| `UNDERSTAND_QUICKLY_REGISTRY` | Override the registry base URL. | `https://looptech-ai.github.io/understand-quickly/` |

The base URL can also be passed explicitly: `Registry("https://my-mirror.example/")`.

## Public types

`understand_quickly.types` exports `TypedDict` shapes for the documents this SDK fetches:

- `Entry` — one registry entry (matches `registry.json`).
- `Stats`, `StatsTotals`, `StatsKind`, `StatsLanguage`, `StatsConcept` — `stats.json` shape.
- `WellKnown`, `WellKnownRepo` — `.well-known/repos.json` shape.
- `SearchHit` — single result from `Registry.search()`.
- `Graph` — opaque dict, shape depends on `entry["format"]`.

Everything is `total=False` so you can rely on `entry.get("status")` returning safely.

## Development

```bash
cd python-sdk
python -m pip install -e ".[dev]"
pytest -q
python -m build .
```

## Release notes

See the project [release notes](https://github.com/looptech-ai/understand-quickly/releases) on GitHub. Python SDK versions are tagged `pysdk-vX.Y.Z`.

## License

[MIT](LICENSE) — Copyright (c) 2026 Alex Macdonald-Smith.
