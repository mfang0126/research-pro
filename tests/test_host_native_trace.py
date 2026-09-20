from __future__ import annotations

import contextlib
import io
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "host_native_trace.py"
fake_hermes_tools = types.ModuleType("hermes_tools")
fake_hermes_tools.web_extract = lambda *args, **kwargs: {}
fake_hermes_tools.web_search = lambda *args, **kwargs: {}
sys.modules.setdefault("hermes_tools", fake_hermes_tools)
SPEC = importlib.util.spec_from_file_location("host_native_trace_test", MODULE_PATH)
assert SPEC and SPEC.loader
host_native_trace = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host_native_trace)


class HostNativeTraceTests(unittest.TestCase):
    def test_help_is_available_without_execute_code_runtime(self) -> None:
        result = subprocess.run(
            [sys.executable, str(MODULE_PATH), "--help"],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("search", result.stdout)
        self.assertIn("extract", result.stdout)

    def test_record_timeout_is_structured_and_non_throwing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"RESEARCH_PRO_HOME": tmp}, clear=False):
                with patch.object(
                    host_native_trace.subprocess,
                    "run",
                    side_effect=subprocess.TimeoutExpired(cmd=["node"], timeout=30),
                ) as run:
                    result = host_native_trace._record(
                        {"query": "fixture", "results": []},
                        query="fixture",
                        hint="quick",
                        actual_tool="web_search",
                        requested_tool="host-native-web-search",
                        sub_q=None,
                        round_number=None,
                    )

        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "trace_record_timeout")
        run.assert_called_once()
        self.assertEqual(run.call_args.kwargs["timeout"], 30)

    def test_record_invalid_json_response_is_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"RESEARCH_PRO_HOME": tmp}, clear=False):
                completed = subprocess.CompletedProcess(
                    args=["node"], returncode=0, stdout="not-json", stderr=""
                )
                with patch.object(host_native_trace.subprocess, "run", return_value=completed):
                    result = host_native_trace._record(
                        {"query": "fixture", "results": []},
                        query="fixture",
                        hint="quick",
                        actual_tool="web_search",
                        requested_tool="host-native-web-search",
                        sub_q=None,
                        round_number=None,
                    )

        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "trace_record_invalid_response")

    def test_main_suppresses_native_success_when_trace_write_fails(self) -> None:
        native = {"success": True, "data": {"web": [{"url": "https://example.test"}]}}
        stdout = io.StringIO()
        stderr = io.StringIO()
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {"RESEARCH_PRO_HOME": tmp}, clear=False):
                with patch.object(
                    host_native_trace,
                    "_require_hermes_tools",
                    return_value=(lambda *args, **kwargs: native, None),
                ):
                    with patch.object(
                        host_native_trace,
                        "_record",
                        return_value={"ok": False, "error": "trace-write-failed"},
                    ):
                        with patch.object(sys, "argv", [str(MODULE_PATH), "search", "--query", "fixture"]):
                            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                                exit_code = host_native_trace.main()

        self.assertNotEqual(exit_code, 0)
        result = json.loads(stdout.getvalue())
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "trace_record_failed")
        self.assertNotIn("https://example.test", stdout.getvalue())
        self.assertIn("trace-write-failed", stdout.getvalue())

    def test_provider_exception_is_redacted_in_structured_output(self) -> None:
        secret = "fixture-secret-value"

        def failing_search(*args, **kwargs):
            raise RuntimeError(f"token={secret}")

        stdout = io.StringIO()
        with patch.object(host_native_trace, "_require_hermes_tools", return_value=(failing_search, None)):
            with patch.object(host_native_trace, "_record", return_value={"ok": True}):
                with patch.object(sys, "argv", [str(MODULE_PATH), "search", "--query", "fixture"]):
                    with contextlib.redirect_stdout(stdout):
                        exit_code = host_native_trace.main()

        self.assertEqual(exit_code, 1)
        self.assertNotIn(secret, stdout.getvalue())
        self.assertIn("token=[REDACTED]", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
