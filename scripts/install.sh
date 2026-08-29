#!/usr/bin/env bash
# Install research-pro for common agent skill directories (symlink).
# Usage: bash scripts/install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${RESEARCH_PRO_INSTALL_DIR:-$HOME/.agents/skills/research-pro}"

echo "research-pro install"
echo "  source: $ROOT"
echo "  dest:   $DEST"

mkdir -p "$(dirname "$DEST")"
if [[ "$ROOT" != "$(cd "$DEST" 2>/dev/null && pwd || true)" && "$ROOT" != "$DEST" ]]; then
  if [[ -e "$DEST" && ! -L "$DEST" && -d "$DEST" ]]; then
    # Already a real directory (e.g. dest IS the source after copy)
    if [[ "$(cd "$DEST" && pwd)" == "$ROOT" ]]; then
      echo "  dest is this skill tree"
    else
      echo "  note: $DEST exists (not a symlink) — wiring agents to existing dest"
    fi
  else
    ln -sfn "$ROOT" "$DEST"
    echo "  linked dest → source"
  fi
else
  echo "  running from install target"
  DEST="$ROOT"
fi

link_agent() {
  local dir="$1"
  local name="$2"
  mkdir -p "$dir"
  ln -sfn "$DEST" "$dir/$name"
  echo "  linked $dir/$name"
}

link_agent "$HOME/.claude/skills" "research-pro"
link_agent "$HOME/.hermes/external-skills" "research-pro"
link_agent "$HOME/.openclaw/skills" "research-pro"
link_agent "${CODEX_HOME:-$HOME/.codex}/skills" "research-pro"

CFG="${RESEARCH_PRO_HOME:-$HOME/.config/research-pro}"
mkdir -p "$CFG"
chmod 700 "$CFG" 2>/dev/null || true
if [[ ! -f "$CFG/.env" ]]; then
  if [[ -f "$ROOT/env.example" ]]; then
    cp "$ROOT/env.example" "$CFG/.env.example"
    echo "  wrote $CFG/.env.example — copy to .env and add keys:"
    echo "    cp $CFG/.env.example $CFG/.env && chmod 600 $CFG/.env"
  fi
else
  echo "  $CFG/.env already present"
fi

echo ""
echo "Next:"
echo "  1) Put at least one key in $CFG/.env  (TAVILY or XAI or OPENROUTER)"
echo "  2) node \"$DEST/scripts/doctor.mjs\""
echo "  3) Ask agent: research <topic>"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found — install Node.js 18+"
  exit 1
fi

node "$DEST/scripts/doctor.mjs" || {
  echo ""
  echo "Doctor reported not runnable yet — add a key, then re-run doctor."
  exit 0
}
