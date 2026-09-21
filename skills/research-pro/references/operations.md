# Research Pro operations reference

> **Language:** English (default) · [中文](operations.zh-CN.md)

Status: active for `3.21.0-mf`. This file documents the existing scripts; it does not add a research state machine or change script behavior. Read it when a task needs external retrieval, credentials, trace, or output handling.

## Locate the skill

Use the installed skill directory as `BASE`. For an isolated checkout, it is the repository's `skills/research-pro` directory; for a direct checkout, it may be the repository root.

```bash
BASE="/path/to/research-pro"
```

Do not substitute a credential directory for `BASE`, and do not put keys in the skill directory.

## Readiness without exposing credentials

The script-backed minimum is one of `TAVILY_API_KEY`, `XAI_API_KEY`, or `OPENROUTER_API_KEY`. A host-native `web_search` or equivalent can be available independently. The doctor reports presence and capabilities, never key values.

```bash
node "$BASE/scripts/doctor.mjs" --require-ready --json
```

Exit `0` with `ready: true` means script-backed retrieval is runnable. Exit `1` means the script side is unavailable; if the host has a usable native search tool, use the host bridge below and record that the script side is degraded. If neither side is available, report the setup card and stop external retrieval. Never replace missing evidence with an invented result.

For a machine-readable snapshot saved outside the skill directory:

```bash
DOCTOR_JSON="$(mktemp "${TMPDIR:-/tmp}/research-pro-doctor.XXXXXX")"
node "$BASE/scripts/doctor.mjs" --json > "$DOCTOR_JSON"
python3 - "$DOCTOR_JSON" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print({"ready": data.get("ready"), "tier": data.get("tier"), "capabilities": data.get("capabilities", {})})
PY
```

The JSON contains paths and capability flags, not secret values. Keep the file private if it is retained.

## Start a trace safely

`trace.mjs init` writes one JSON object to stdout and diagnostic lines to stderr. Capture stdout in a temporary file and parse that file. Do not pipe the output into `node -e` and assume stdin is readable as a string.

```bash
set -euo pipefail
QUESTION="the short research question"
TRACE_INIT_JSON="$(mktemp "${TMPDIR:-/tmp}/research-pro-init.XXXXXX")"
node "$BASE/scripts/trace.mjs" init \
  --question "$QUESTION" \
  --depth standard \
  --sub-q "Q1,Q2" > "$TRACE_INIT_JSON"  # Replace with the subquestions actually known; omit when none.

export RESEARCH_PRO_RUN_ID="$(python3 - "$TRACE_INIT_JSON" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
print(data.get("run_id") or "")
PY
)"

if [ "${RESEARCH_PRO_TRACE:-light}" = "off" ]; then
  unset RESEARCH_PRO_RUN_ID
elif [ -z "$RESEARCH_PRO_RUN_ID" ]; then
  echo "trace init did not return run_id; inspect $TRACE_INIT_JSON" >&2
  exit 1
fi
```

The temporary JSON is deliberately left private for inspection. When it is no longer needed, move it to the user's trash with `trash "$TRACE_INIT_JSON"`; do not print its contents into a shared transcript.

When `RESEARCH_PRO_TRACE=off`, init returns `skipped: true` and no run id. Do not manufacture one. Honor this configuration: use the actual tool response as evidence, skip `record-search` and `finalize`, and disclose that persistent trace coverage is unavailable. Do not re-enable trace solely to satisfy a report field. The default trace mode is `light`; use `full` or `--force-raw` only when raw evidence is necessary and the storage boundary is appropriate.

Useful trace environment variables:

| Variable | Existing behavior |
|---|---|
| `RESEARCH_PRO_HOME` | Trace/cache root; default `~/.config/research-pro` |
| `RESEARCH_PRO_TRACE` | `off`, `light`, or `full`; default `light` |
| `RESEARCH_PRO_RUN_ID` | Active run id |
| `RESEARCH_PRO_TRACE_TOP_N` | URL count retained in light entries; default `10` |
| `RESEARCH_PRO_TRACE_MAX_RAW_BYTES` | Raw evidence bound; default `200000` |

## Search with trace

For smart-search, let the wrapper preserve the search stdout/exit behavior while the smart-search layer records the side channel:

```bash
bash "$BASE/scripts/search_with_trace.sh" \
  --query "the query" \
  --hint quick \
  --sub-q Q1 \
  --round 1 > result.json
```

Use the hint that matches the current retrieval need. The hint is not an evidence grade. Preserve `degraded` and error fields from the returned JSON.

For a result already saved to a file, record it explicitly:

```bash
node "$BASE/scripts/trace.mjs" record-search \
  --run-id "$RESEARCH_PRO_RUN_ID" \
  --file /path/to/result.json \
  --hint official \
  --actual-tool the-tool-name \
  --requested-tool the-requested-tool \
  --source saved-result \
  --force-raw
```

Use `record-search` only after the complete result is in the file. Recording a sentence such as "searched" without URLs, result items, or an error object is metadata-only and cannot support a claim.

## Host-native web tools

When tracing is enabled, direct host-native calls bypass the script's trace/cache boundary. In a Hermes `execute_code` environment, run the bridge instead. When tracing is explicitly off, use the native response without requiring this recording bridge and disclose the missing persistent trace:

```python
import os
import runpy
import sys
from pathlib import Path

BASE = Path(os.environ.get(
    "RESEARCH_PRO_SKILL_DIR",
    "~/.hermes/external-skills/research-pro",
)).expanduser()
bridge = BASE / "scripts" / "host_native_trace.py"
sys.argv = [str(bridge), "search", "--query", "QUERY", "--hint", "quick"]
runpy.run_path(str(bridge), run_name="__main__")
```

For a known URL or URLs:

```python
sys.argv = [
    str(bridge), "extract",
    "--urls", "https://example.com/page",
    "--hint", "scrape",
]
runpy.run_path(str(bridge), run_name="__main__")
```

The bridge normalizes `data.web`/extract results, writes a raw record before returning the native response, redacts errors, and returns a structured failure if recording fails. It must run where `hermes_tools` is available. If a host-native `x_search` result is obtained by another approved route, save the complete JSON first and use `trace.mjs record-search` with `--actual-tool x_search --requested-tool host-native-x-search --force-raw`.

## Credentials and wrappers

Credential resolution is fill-missing and allowlisted:

1. Existing `process.env` wins and is never overwritten.
2. `RESEARCH_PRO_ENV_FILE`, then `$RESEARCH_PRO_HOME/.env` (default `~/.config/research-pro/.env`), then the default generic path when different.
3. When `RESEARCH_PRO_TRUST_HOST_ENV` is not `0`, Hermes and OpenClaw host sources may fill missing allowlisted keys.
4. A current-working-directory `.env` is read only when `RESEARCH_PRO_LOAD_CWD_ENV=1`.

Only research-pro keys and documented aliases are read from host files. Useful controls are:

```bash
export RESEARCH_PRO_HOME="$HOME/.config/research-pro"
export RESEARCH_PRO_ENV_FILE="/private/path/research-pro.env"
export RESEARCH_PRO_TRUST_HOST_ENV=0
export RESEARCH_PRO_LOAD_CWD_ENV=1
```

Do not print these files or values. Keep the directory mode at `700` and the env file mode at `600`.

Third-party CLIs read `process.env` and do not load the configured env files themselves. Hydrate them through the shim:

```bash
node "$BASE/scripts/run-with-creds.mjs" tvly search "QUERY"
node "$BASE/scripts/run-with-creds.mjs" firecrawl scrape "https://example.com/page"
```

The shim passes credentials only to the child environment and writes no key to stdout/stderr. `grok_search.mjs` and `research.mjs` resolve keys in process and can be called directly.

## Finalize and inspect

During the delivery reserve, save the answer and hand over before the overall deadline. If tracing is enabled and initialization returned a run id, also finalize the trace and inspect its status within that reserve. If trace is explicitly off, skip the command below and report persistent trace coverage as unavailable. If initialization failed unexpectedly, report the failure rather than running finalization with a missing id. Pass `--trace-coverage full` only when every external retrieval has a valid trace entry; otherwise use `partial` or `metadata-only` and explain the gap.

```bash
node "$BASE/scripts/trace.mjs" finalize \
  --run-id "$RESEARCH_PRO_RUN_ID" \
  --summary "short result summary" \
  --confidence conditional \
  --status completed_with_gaps \
  --termination-reason access-or-trace-gap \
  --trace-coverage partial
```

Use `--status completed` with `--trace-coverage full` only after every external retrieval has a readable valid trace entry and all referenced artifacts exist. The runtime may downgrade a requested `completed` status to `completed_with_gaps` when trace or artifacts are incomplete. Treat that status as evidence about the run, not as a reason to claim complete coverage.

The run directory contains `run.json`, `calls.jsonl`, optional `raw/<call_id>.json`, and an optional redacted `report.md` under `$RESEARCH_PRO_HOME/runs/<run_id>/`. Keep raw content out of chat and avoid copying private paths or credential-like assignments into a report. `scripts/lib/output_guard.mjs` provides safe-value checks and redaction helpers for code that emits artifacts.
