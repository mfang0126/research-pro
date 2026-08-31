#!/bin/bash
# Thin wrapper → research.mjs (credentials never printed to stdout)
# Usage: ./research.sh '{"input": "your research query", ...}' [output_file]
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/research.mjs" "$@"
