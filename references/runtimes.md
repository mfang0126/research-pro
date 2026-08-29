# Runtime notes for research-pro credentials

Skill scripts load secrets via `scripts/lib/credentials.mjs`:

- **Never override** existing `process.env`
- **Fill-missing** from generic + host files
- **Never print** secret values (`doctor.mjs` only shows OK/MISSING + source id)

## Preferred injection per host

### Generic / plain shell

```bash
mkdir -p ~/.config/research-pro
# put KEY=value lines in ~/.config/research-pro/.env
export PATH  # ensure node, tvly, etc.
node /path/to/research-pro/scripts/doctor.mjs
```

### Hermes

- Store keys in `~/.hermes/.env`
- Hermes injects skill-declared env into tool sandboxes when configured
- Prefer host tools when available: `web_search`, `x_search`, `web_extract`, Tavily MCP
- Scripts are fallbacks when CLIs are needed

### OpenClaw

- Prefer `~/.openclaw/.env` for provider/search keys
- `openclaw.json` → `env` fills only if missing
- Optional: `skills.entries.research-pro.env` / skill `apiKey` mappings
- Do **not** put provider keys only in untrusted workspace `.env`

### Claude Code

- Prefer session injection:
  `~/.claude/settings.json` → `"env": { "TAVILY_API_KEY": "...", "XAI_API_KEY": "..." }`
- Claude may **deny** reading `.env` files; scripts still work if env was injected
- Avoid asking the model to `cat` secret files

### Codex

- Keys must be in the environment of the process that spawns shell tools
- If `shell_environment_policy` restricts inherit, allow `TAVILY_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `FIRECRAWL_API_KEY`, `YOUTUBE_API_KEY`
- Alternatively use generic `~/.config/research-pro/.env` (script fill-missing)

### Kimi Code

- Model provider keys live in Kimi config; **third-party search keys do not**
- Export Tavily/XAI/etc. in the parent environment, or use generic research-pro `.env`

## Flags

| Env | Default | Effect |
|-----|---------|--------|
| `RESEARCH_PRO_TRUST_HOST_ENV` | on | Set `0` to ignore Hermes/OpenClaw credential files |
| `RESEARCH_PRO_LOAD_CWD_ENV` | off | Set `1` to allow project `./.env` (low trust) |
| `RESEARCH_PRO_HOME` | `~/.config/research-pro` | Skill config/log home |
| `RESEARCH_PRO_ENV_FILE` | — | Explicit dotenv path |

Security: `security.md`. Install: `../SETUP.md` / `../scripts/install.sh`.

## Doctor

```bash
node scripts/doctor.mjs
node scripts/doctor.mjs --json
```

Exit code `0` = runnable (at least one search capability or known CLI).

## Agent Phase 1 hook

Before external research:

```bash
node {baseDir}/scripts/doctor.mjs --json
```

Pick tools from `capabilities.*`. Degrade when a preferred backend is MISSING; only block if `runnable` is false **and** no host-native web search exists.
