#!/usr/bin/env python3
"""Run host-native web tools and persist the complete retrieval evidence.

This module must be executed inside Hermes' ``execute_code`` environment, where
``hermes_tools`` is available. Direct browser/web tool calls cannot be
intercepted by research-pro, so this bridge normalizes their response and calls
trace.mjs before returning the native response on stdout.

Examples (inside execute_code):
    import runpy, sys
    sys.argv = ["host_native_trace.py", "search", "--query", "...", "--hint", "quick"]
    runpy.run_path("/path/to/host_native_trace.py", run_name="__main__")
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    from hermes_tools import web_extract, web_search  # type: ignore[import-not-found]
except ModuleNotFoundError as exc:  # pragma: no cover - runtime guard
    raise RuntimeError(
        "host_native_trace.py must run inside execute_code, where hermes_tools is available"
    ) from exc


SCRIPT_DIR = Path(__file__).resolve().parent
TRACE_JS = SCRIPT_DIR / "trace.mjs"


def _home() -> Path:
    return Path(os.environ.get("RESEARCH_PRO_HOME", Path.home() / ".config" / "research-pro")).expanduser()


def _run_id() -> str | None:
    value = os.environ.get("RESEARCH_PRO_RUN_ID", "").strip()
    if value:
        return value
    pointer = _home() / "current-run.json"
    try:
        return str(json.loads(pointer.read_text(encoding="utf-8")).get("run_id") or "") or None
    except (OSError, ValueError, TypeError):
        return None


def _native_web_items(response: Any) -> list[dict[str, Any]]:
    """Normalize Hermes web_search's {success,data:{web:[...]}} shape."""
    if not isinstance(response, dict):
        return []
    data = response.get("data")
    if isinstance(data, dict) and isinstance(data.get("web"), list):
        return [item for item in data["web"] if isinstance(item, dict)]
    if isinstance(response.get("web"), list):
        return [item for item in response["web"] if isinstance(item, dict)]
    if isinstance(response.get("results"), list):
        return [item for item in response["results"] if isinstance(item, dict)]
    return []


def _normalized_payload(response: Any, *, query: str, tool: str) -> dict[str, Any]:
    """Create the trace/cache shape while retaining the untouched native response."""
    if tool == "web_search":
        items = _native_web_items(response)
        return {
            "query": query,
            "tool": tool,
            "requested_tool": "host-native-web-search",
            "results": items,
            "result_count": len(items),
            "native_response": response,
        }
    if isinstance(response, dict):
        payload = dict(response)
        payload.setdefault("query", query)
        payload.setdefault("tool", tool)
        payload.setdefault("requested_tool", "host-native-web-extract")
        if isinstance(payload.get("results"), list):
            payload.setdefault("result_count", len(payload["results"]))
        return payload
    return {
        "query": query,
        "tool": tool,
        "requested_tool": "host-native-web-extract",
        "results": [],
        "native_response": response,
    }


def _record(
    payload: dict[str, Any],
    *,
    query: str,
    hint: str,
    actual_tool: str,
    requested_tool: str,
    sub_q: str | None,
    round_number: int | None,
) -> dict[str, Any]:
    """Persist normalized payload; raw is forced even when trace mode is light."""
    _home().mkdir(parents=True, exist_ok=True)
    tmp_name: str | None = None
    cmd = [
        "node",
        str(TRACE_JS),
        "record-search",
        "--file",
        "PLACEHOLDER",
        "--query",
        query,
        "--hint",
        hint,
        "--actual-tool",
        actual_tool,
        "--requested-tool",
        requested_tool,
        "--source",
        "host-native-bridge",
        "--force-raw",
    ]
    run_id = _run_id()
    if run_id:
        cmd.extend(["--run-id", run_id])
    if sub_q:
        cmd.extend(["--sub-q", sub_q])
    if round_number is not None:
        cmd.extend(["--round", str(round_number)])

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            prefix="host-native-",
            suffix=".json",
            dir=_home(),
            delete=False,
        ) as handle:
            json.dump(payload, handle, ensure_ascii=False)
            tmp_name = handle.name
        cmd[cmd.index("PLACEHOLDER")] = tmp_name
        completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            return {
                "ok": False,
                "error": "trace_record_failed",
                "detail": completed.stderr[-500:],
            }
        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError:
            return {"ok": True, "trace_stdout": completed.stdout[-500:]}
    finally:
        if tmp_name:
            try:
                Path(tmp_name).unlink()
            except OSError:
                pass


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Trace host-native research-pro retrievals")
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="Call Hermes web_search and record it")
    search.add_argument("--query", required=True)
    search.add_argument("--limit", type=int, default=8)
    search.add_argument("--hint", default="quick")
    search.add_argument("--sub-q", default=None)
    search.add_argument("--round", dest="round_number", type=int, default=None)

    extract = sub.add_parser("extract", help="Call Hermes web_extract and record it")
    extract.add_argument("--urls", nargs="+", required=True)
    extract.add_argument("--char-limit", type=int, default=None)
    extract.add_argument("--hint", default="scrape")
    extract.add_argument("--sub-q", default=None)
    extract.add_argument("--round", dest="round_number", type=int, default=None)
    return parser


def main() -> int:
    args = _parser().parse_args()
    if args.command == "search":
        query = args.query
        try:
            native = web_search(query, limit=args.limit)
            payload = _normalized_payload(native, query=query, tool="web_search")
            trace = _record(
                payload,
                query=query,
                hint=args.hint,
                actual_tool="web_search",
                requested_tool="host-native-web-search",
                sub_q=args.sub_q,
                round_number=args.round_number,
            )
            print(json.dumps(native, ensure_ascii=False))
            if not trace.get("ok", True):
                print(json.dumps({"trace_warning": trace}, ensure_ascii=False), file=sys.stderr)
            return 0
        except Exception as exc:  # record failures without fabricating search results
            payload = {
                "query": query,
                "tool": "web_search",
                "requested_tool": "host-native-web-search",
                "results": [],
                "error": str(exc),
            }
            _record(
                payload,
                query=query,
                hint=args.hint,
                actual_tool="web_search",
                requested_tool="host-native-web-search",
                sub_q=args.sub_q,
                round_number=args.round_number,
            )
            print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
            return 1

    urls = args.urls
    query = ", ".join(urls)
    try:
        native = web_extract(urls, char_limit=args.char_limit)
        payload = _normalized_payload(native, query=query, tool="web_extract")
        trace = _record(
            payload,
            query=query,
            hint=args.hint,
            actual_tool="web_extract",
            requested_tool="host-native-web-extract",
            sub_q=args.sub_q,
            round_number=args.round_number,
        )
        print(json.dumps(native, ensure_ascii=False))
        if not trace.get("ok", True):
            print(json.dumps({"trace_warning": trace}, ensure_ascii=False), file=sys.stderr)
        return 0
    except Exception as exc:
        payload = {
            "query": query,
            "tool": "web_extract",
            "requested_tool": "host-native-web-extract",
            "results": [],
            "error": str(exc),
        }
        _record(
            payload,
            query=query,
            hint=args.hint,
            actual_tool="web_extract",
            requested_tool="host-native-web-extract",
            sub_q=args.sub_q,
            round_number=args.round_number,
        )
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
