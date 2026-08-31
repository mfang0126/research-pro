#!/usr/bin/env bash
# Run smart-search and append results to the active research-pro run (side-channel).
# Does not change search behavior: stdout is still pure smart-search JSON.
#
# Usage:
#   export RESEARCH_PRO_RUN_ID=...   # from: node scripts/trace.mjs init ...
#   scripts/search_with_trace.sh --query "..." --hint quick
#   scripts/search_with_trace.sh --query "..." --hint official,realtime --sub-q Q1 --round 1
#
# Env:
#   RESEARCH_PRO_RUN_ID / RESEARCH_PRO_TRACE / RESEARCH_PRO_HOME
#   SMART_SEARCH          override smart-search entry (default ~/.hermes/skills/.../smart-search.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TRACE_JS="$SCRIPT_DIR/trace.mjs"
SMART_SEARCH="${SMART_SEARCH:-$HOME/.hermes/skills/research/smart-search/scripts/smart-search.sh}"
if [ ! -x "$SMART_SEARCH" ]; then
  SMART_SEARCH="$HOME/.hermes/scripts/smart-search.sh"
fi

SUB_Q=""
ROUND=""
PASS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --sub-q) SUB_Q="${2:-}"; shift 2 ;;
    --round) ROUND="${2:-}"; shift 2 ;;
    *) PASS_ARGS+=("$1"); shift ;;
  esac
done

if [ -n "$SUB_Q" ]; then PASS_ARGS+=(--sub-q "$SUB_Q"); fi
if [ -n "$ROUND" ]; then PASS_ARGS+=(--round "$ROUND"); fi
PASS_ARGS+=(--source smart-search-wrapper)

if [ ! -x "$SMART_SEARCH" ] && [ ! -f "$SMART_SEARCH" ]; then
  echo '{"error":"smart-search not found","tool":null}' >&2
  exit 1
fi

TMP="$(mktemp -t research-pro-search.XXXXXX.json)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

# smart-search owns the common cache + trace boundary. The wrapper only
# preserves stdout/exit semantics; it must not append a second event.
set +e
"$SMART_SEARCH" "${PASS_ARGS[@]}" >"$TMP" 2>/tmp/research-pro-search.err
EC=$?
set -e

cat "$TMP"
exit "$EC"
