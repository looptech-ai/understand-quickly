"""Fuzz harness for understand_quickly.client._decode_json.

The function is the choke point for every JSON response the registry
client parses (registry doc, well-known doc, stats, per-format graphs).
A malformed body must produce a typed RegistryError, never an uncaught
exception that escapes the SDK boundary — that would break agent
callers who only catch the documented error class.

The harness feeds atheris random bytes as the response body, calls
_decode_json, and treats *any* exception other than RegistryError as
a finding.
"""
from __future__ import annotations

import sys

import atheris

with atheris.instrument_imports():
    from understand_quickly.client import RegistryError, _decode_json


def TestOneInput(data: bytes) -> None:
    try:
        _decode_json("https://fuzz.invalid/x", data)
    except RegistryError:
        # Expected: malformed bodies surface as RegistryError.
        pass


def main() -> None:
    atheris.Setup(sys.argv, TestOneInput)
    atheris.Fuzz()


if __name__ == "__main__":
    main()
