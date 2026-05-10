"""Tests for the ``understand_quickly.cli`` entry point."""

from __future__ import annotations

import json
from typing import Any

import pytest

from understand_quickly import cli as cli_module
from understand_quickly.client import Registry as SyncRegistry

from .conftest import make_responses
from .test_client import FakeTransport


@pytest.fixture(autouse=True)
def _patch_registry(monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> None:
    """Replace ``understand_quickly.cli.Registry`` with a transport-injected variant.

    Each test attaches ``request.node.transport`` to control responses.
    """
    if not hasattr(request.node, "transport"):
        request.node.transport = FakeTransport({})

    def _factory(*args: Any, **kwargs: Any) -> SyncRegistry:
        kwargs.pop("base_url", None)
        kwargs["transport"] = request.node.transport
        # accept positional base_url
        if args:
            kwargs.setdefault("base_url", args[0])
        return SyncRegistry(**kwargs)

    monkeypatch.setattr(cli_module, "Registry", _factory)


def _set_responses(request: pytest.FixtureRequest, responses: dict[str, tuple[int, bytes]]) -> None:
    request.node.transport = FakeTransport(responses)


def test_cli_version(capsys: pytest.CaptureFixture[str]) -> None:
    code = cli_module.main(["--version"])
    out = capsys.readouterr().out
    assert code == 0
    assert out.startswith("understand-quickly ")


def test_cli_list_outputs_json(
    sample_registry: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry))
    code = cli_module.main(["list"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert isinstance(data, list) and len(data) == 3


def test_cli_list_filter_status(
    sample_registry: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry))
    code = cli_module.main(["list", "--status", "ok"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert {e["id"] for e in data} == {"looptech-ai/alpha", "Lum1104/Understand-Anything"}


def test_cli_list_pretty_table(
    sample_registry: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry))
    code = cli_module.main(["--pretty", "list"])
    assert code == 0
    out = capsys.readouterr().out
    assert "id" in out and "looptech-ai/alpha" in out


def test_cli_get_graph(
    sample_registry: dict[str, Any],
    sample_graph_alpha: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(
        request,
        make_responses(
            registry=sample_registry,
            graphs={"https://example.test/alpha.json": sample_graph_alpha},
        ),
    )
    code = cli_module.main(["get-graph", "looptech-ai/alpha"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["version"] == "understand-anything@1"


def test_cli_get_graph_missing_entry(
    sample_registry: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry))
    code = cli_module.main(["get-graph", "missing/nope"])
    assert code == cli_module.EXIT_NOT_FOUND
    assert "no entry" in capsys.readouterr().err


def test_cli_find_url(
    sample_registry: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry))
    code = cli_module.main(["find", "https://github.com/Lum1104/Understand-Anything"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["id"] == "Lum1104/Understand-Anything"


def test_cli_find_misses_returns_1(
    sample_registry: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry))
    code = cli_module.main(["find", "ghost/repo"])
    assert code == cli_module.EXIT_NOT_FOUND
    out = capsys.readouterr()
    assert "no entry matches" in out.err
    assert json.loads(out.out) is None


def test_cli_search(
    sample_registry: dict[str, Any],
    sample_stats: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(registry=sample_registry, stats=sample_stats))
    code = cli_module.main(["search", "auth"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert any(h["entry_id"] == "looptech-ai/alpha" for h in data)


def test_cli_stats(
    sample_stats: dict[str, Any],
    request: pytest.FixtureRequest,
    capsys: pytest.CaptureFixture[str],
) -> None:
    _set_responses(request, make_responses(stats=sample_stats))
    code = cli_module.main(["stats"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["totals"]["entries"] == 3


def test_cli_http_error_exits_2(request: pytest.FixtureRequest) -> None:
    _set_responses(
        request,
        {"https://looptech-ai.github.io/understand-quickly/registry.json": (500, b"boom")},
    )
    code = cli_module.main(["list"])
    assert code == cli_module.EXIT_ERROR


def test_cli_no_command_returns_usage(capsys: pytest.CaptureFixture[str]) -> None:
    code = cli_module.main([])
    assert code == cli_module.EXIT_USAGE
