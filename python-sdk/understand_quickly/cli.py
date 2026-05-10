"""``python -m understand_quickly`` — JSON-first command-line interface.

Subcommands:
- ``list``         List registry entries (filterable).
- ``get-graph``    Fetch a graph body by entry id.
- ``find``         Resolve a GitHub URL or ``owner/repo`` to its entry.
- ``search``       Cross-graph concept + entry search.
- ``stats``        Aggregate stats across the registry.

JSON output by default; ``--pretty`` adds indented formatting (and table
shaping for ``list``). Exit codes: ``0`` success, ``1`` not-found, ``2``
HTTP/parse error, ``64`` usage error.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Optional, Sequence

from . import __version__
from .client import Registry, RegistryError, RegistryHTTPError


EXIT_OK = 0
EXIT_NOT_FOUND = 1
EXIT_ERROR = 2
EXIT_USAGE = 64


def _emit(data: Any, pretty: bool, *, fp: Any = None) -> None:
    out = fp or sys.stdout
    if pretty and isinstance(data, list) and data and isinstance(data[0], dict):
        # Pretty-print a list of dicts as a compact table for `list`.
        keys = ["id", "format", "status", "last_synced"]
        rows = [[str(item.get(k, "")) for k in keys] for item in data]
        widths = [max(len(k), *(len(r[i]) for r in rows)) for i, k in enumerate(keys)]
        header = "  ".join(k.ljust(widths[i]) for i, k in enumerate(keys))
        sep = "  ".join("-" * w for w in widths)
        print(header, file=out)
        print(sep, file=out)
        for row in rows:
            print("  ".join(row[i].ljust(widths[i]) for i in range(len(keys))), file=out)
        return
    if pretty:
        json.dump(data, out, indent=2, sort_keys=False)
        out.write("\n")
    else:
        json.dump(data, out)
        out.write("\n")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="understand-quickly",
        description="Thin client for the understand-quickly registry of code-knowledge graphs.",
    )
    parser.add_argument("--version", action="version", version=f"understand-quickly {__version__}")
    parser.add_argument(
        "--registry",
        dest="registry_url",
        default=None,
        help="Override the registry base URL (defaults to UNDERSTAND_QUICKLY_REGISTRY env var).",
    )
    parser.add_argument(
        "--pretty", action="store_true", help="Pretty-print human-friendly output."
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds (default: 30).",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable the in-memory TTL cache for this invocation.",
    )

    sub = parser.add_subparsers(dest="cmd", required=True, metavar="<command>")

    p_list = sub.add_parser("list", help="List registry entries.")
    p_list.add_argument("--status", default=None)
    p_list.add_argument("--format", dest="fmt", default=None)
    p_list.add_argument("--owner", default=None)
    p_list.add_argument("--tag", default=None)

    p_get = sub.add_parser("get-graph", help="Fetch the graph body for an entry id.")
    p_get.add_argument("entry_id")

    p_find = sub.add_parser("find", help="Find the entry for a GitHub URL or owner/repo slug.")
    p_find.add_argument("repo")

    p_search = sub.add_parser("search", help="Search entries and concepts.")
    p_search.add_argument("query")
    p_search.add_argument(
        "--scope", choices=("all", "entries", "concepts"), default="all"
    )

    sub.add_parser("stats", help="Print the aggregate stats.json document.")

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        # argparse exits 2 on usage errors; remap to 64 for clarity.
        return EXIT_USAGE if exc.code == 2 else int(exc.code or 0)

    cache_ttl = 0.0 if args.no_cache else 60.0
    try:
        reg = Registry(args.registry_url, cache_ttl=cache_ttl, timeout=args.timeout)
    except RegistryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE

    try:
        if args.cmd == "list":
            data = reg.list(status=args.status, format=args.fmt, owner=args.owner, tag=args.tag)
            _emit(data, args.pretty)
            return EXIT_OK
        if args.cmd == "get-graph":
            data = reg.get_graph(args.entry_id)
            _emit(data, args.pretty)
            return EXIT_OK
        if args.cmd == "find":
            entry = reg.find_graph_for_repo(args.repo)
            if entry is None:
                print(f"no entry matches {args.repo!r}", file=sys.stderr)
                _emit(None, args.pretty)
                return EXIT_NOT_FOUND
            _emit(entry, args.pretty)
            return EXIT_OK
        if args.cmd == "search":
            data = reg.search(args.query, scope=args.scope)
            _emit(data, args.pretty)
            return EXIT_OK
        if args.cmd == "stats":
            _emit(reg.stats(), args.pretty)
            return EXIT_OK
    except RegistryHTTPError as exc:
        print(f"http error: {exc}", file=sys.stderr)
        return EXIT_ERROR
    except RegistryError as exc:
        msg = str(exc)
        print(f"error: {msg}", file=sys.stderr)
        if msg.startswith("no entry"):
            return EXIT_NOT_FOUND
        return EXIT_ERROR

    parser.print_help(sys.stderr)
    return EXIT_USAGE


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess in tests
    raise SystemExit(main())
