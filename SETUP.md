# research-pro Setup Guide

**Version:** 3.17.0-mf
Runtime-agnostic research skill for Claude Code, Hermes, OpenClaw, Codex, Kimi Code, or plain shell.

Anyone can install in **3 steps**: copy skill → put one API key → run doctor.

---

## Quick start (anyone)

### 1) Install the skill

```bash
# Option A — copy this folder wherever you keep agent skills
DEST="${RESEARCH_PRO_INSTALL_DIR:-$HOME/Projects/research-pro}"
mkdir -p "$(dirname "$DEST")"
# If you already have this repo checked out:
cp -R /path/to/research-pro "$DEST"
# Or: git clone <your-skills-repo> and use skills/research-pro

# Wire into agents you use (skip dirs that don't exist)
mkdir -p ~/.claude/skills ~/.hermes/external-skills ~/.openclaw/skills 2>/dev/null || true
ln -sfn "$DEST" ~/.claude/skills/research-pro
ln -sfn "$DEST" ~/.hermes/external-skills/research-pro
ln -sfn "$DEST" ~/.openclaw/skills/research-pro

# Codex (if you use $CODEX_HOME/skills)
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
ln -sfn "$DEST" "${CODEX_HOME:-$HOME/.codex}/skills/research-pro"
```

Or from the skill directory:

```bash
bash scripts/install.sh
```

Requires: **Node.js 18+** (`node -v`).

### 2) Add at least one API key (generic — works for every host)

```bash
mkdir -p ~/.config/research-pro
chmod 700 ~/.config/research-pro
cp /path/to/research-pro/env.example ~/.config/research-pro/.env
# edit and set at least ONE of:
#   TAVILY_API_KEY=...
#   XAI_API_KEY=...
#   OPENROUTER_API_KEY=...
chmod 600 ~/.config/research-pro/.env
```

**Minimum:** any one of those three, **or** use a host-native web search tool (Hermes/Claude built-ins) without these scripts.

**Never commit keys.** Scripts never override an already-set `process.env` value.

### 3) Verify (READY gate)

```bash
node ~/Projects/research-pro/scripts/doctor.mjs --require-ready
# expect: ready YES / exit 0
# exit 1 → follow the setup card (add a key), then re-run
```

Then ask your agent:

```text
帮我查一下 Next.js 15 有什么新功能
# or: research Next.js 15 new features
```

Agents must run doctor before external search (SKILL Phase 1.0).
---

## API keys

### Generic (recommended for multi-agent users)

`~/.config/research-pro/.env` — see `env.example`.

Overrides:

```bash
export RESEARCH_PRO_HOME=~/.config/research-pro
export RESEARCH_PRO_ENV_FILE=/path/to/custom.env
```

### Host-specific (optional — fill-missing only)

| Host | Where to put keys |
|------|-------------------|
| **Hermes** | `~/.hermes/.env` |
| **OpenClaw** | `~/.openclaw/.env` or `openclaw.json` → `env` |
| **Claude Code** | `~/.claude/settings.json` → `"env": { "TAVILY_API_KEY": "..." }` |
| **Codex** | Shell env that launches Codex; allow `*_API_KEY` if you use `shell_environment_policy` |
| **Kimi Code** | Export before launch, or use generic `.env` |

### Optional keys

| Key | Used for |
|-----|----------|
| `TAVILY_API_KEY` | search / extract / research |
| `XAI_API_KEY` | Grok web + X search |
| `OPENROUTER_API_KEY` | Perplexity/sonar fallback |
| `FIRECRAWL_API_KEY` | JS-heavy scrape |
| `YOUTUBE_API_KEY` | YouTube Data API (`YOUTUBE_API` alias OK) |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | SERP |
| `REDDIT_SESSION` | Reddit cookie (optional) |

### Credential resolution order

1. `process.env` (**never** overridden)
2. `RESEARCH_PRO_ENV_FILE` or `$RESEARCH_PRO_HOME/.env`
3. `~/.config/research-pro/.env`
4. Host adapters (missing only): Hermes → OpenClaw  
   - Disable hosts: `export RESEARCH_PRO_TRUST_HOST_ENV=0`
5. CWD `./.env` only if `RESEARCH_PRO_LOAD_CWD_ENV=1`

Only research-pro key names are read from host files (allowlist — unrelated secrets discarded).

---

## Optional CLIs

| Tool | Install | Adds |
|------|---------|------|
| `tvly` | Tavily CLI | fast search/extract/research |
| `firecrawl` | `npm i -g firecrawl-cli` | scrape |
| `yt-dlp` | `brew install yt-dlp` | YouTube without API key |

Missing tools are skipped.

---

## Security (short)

- Do **not** store keys inside the skill directory
- Prefer process injection or `~/.config/research-pro/.env`
- Deprecated: `scripts/lib/print-key.mjs` (stdout can leak into agent logs)
- Prefer: `scripts/research.mjs` / `grok_search.mjs` (in-process `resolveKey`)

Details: `references/security.md` · runtimes: `references/runtimes.md`

---

## Logs

```text
RESEARCH_PRO_HOME  default: ~/.config/research-pro
run-log:           $RESEARCH_PRO_HOME/run-log.jsonl
```

---

## How it works

1. Classifies depth (Quick / Standard / Deep)
2. Routes by **capability** (not a single vendor)
3. Returns structured report with citations

Full methodology: `SKILL.md`
