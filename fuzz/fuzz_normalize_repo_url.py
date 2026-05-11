"""Fuzz harness for understand_quickly.client._normalize_repo_url.

The function maps arbitrary user-supplied strings (typed in agents,
copy-pasted from URLs, etc.) to an (owner, repo) tuple or None. It must
never raise — agents call it in tight loops without try/except. The
harness asserts the no-raise invariant and that the return shape is
either None or a 2-tuple of strs.
"""
from __future__ import annotations

import sys

import atheris

with atheris.instrument_imports():
    from understand_quickly.client import _normalize_repo_url


def TestOneInput(data: bytes) -> None:
    fdp = atheris.FuzzedDataProvider(data)
    s = fdp.ConsumeUnicodeNoSurrogates(256)
    result = _normalize_repo_url(s)
    if result is None:
        return
    assert isinstance(result, tuple), f"expected tuple, got {type(result).__name__}"
    assert len(result) == 2, f"expected len-2 tuple, got len={len(result)}"
    owner, repo = result
    assert isinstance(owner, str), f"owner not str: {type(owner).__name__}"
    assert isinstance(repo, str), f"repo not str: {type(repo).__name__}"


def main() -> None:
    atheris.Setup(sys.argv, TestOneInput)
    atheris.Fuzz()


if __name__ == "__main__":
    main()
