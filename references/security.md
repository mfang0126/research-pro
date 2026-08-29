# research-pro security notes

## Threat model (local coding agents)

Skills run with the same FS/shell privileges as the agent. Assume:

- A compromised skill or prompt injection can **read files** and **run shell**
- Anything in `process.env` of a shell tool is visible to the agent
- Printing secrets to **stdout** often lands in transcripts / logs

## What research-pro does

| Control | Behavior |
|---------|----------|
| Never override | Existing `process.env` wins |
| Allowlist keys | Only research-pro keys from host `.env` enter the credential map |
| Generic home | Prefer `~/.config/research-pro/.env` (outside skill dir) |
| Host adapters | Optional; disable with `RESEARCH_PRO_TRUST_HOST_ENV=0` |
| CWD `.env` | Off unless `RESEARCH_PRO_LOAD_CWD_ENV=1` |
| Doctor | Reports presence/source ids only — never values |
| Scripts | Resolve keys in-process (`resolveKey`); avoid `print-key` |

## What you should do

### 1. Put secrets outside the skill tree

```bash
mkdir -p ~/.config/research-pro
chmod 700 ~/.config/research-pro
# KEY=value lines in ~/.config/research-pro/.env
chmod 600 ~/.config/research-pro/.env
```

Do **not** put API keys inside `skills/research-pro/` (updates can wipe them; supply-chain risk).

### 2. Prefer host injection when possible

- **Hermes:** `~/.hermes/.env`
- **OpenClaw:** `~/.openclaw/.env`
- **Claude Code:** `~/.claude/settings.json` → `"env": { "TAVILY_API_KEY": "..." }`
- **Codex:** parent shell env + `shell_environment_policy` allowlist

### 3. Harden Claude Code against reading secret files

```json
{
  "permissions": {
    "deny": [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(~/.config/research-pro/**)",
      "Read(~/.hermes/.env)",
      "Read(~/.openclaw/.env)"
    ]
  }
}
```

Scripts still load credentials themselves; the **model** should not `cat` these files.

### 4. Multi-tenant / shared machine

```bash
export RESEARCH_PRO_TRUST_HOST_ENV=0
# only process.env + ~/.config/research-pro/.env
```

### 5. Avoid

- Asking the agent to `source` / `cat` any `.env`
- Using deprecated `print-key.mjs` in automated agent loops
- Committing `.env` or keys in SKILL.md

## Residual risk

Even with allowlisting, a resolved key lives in the script process env for the duration of the API call. Full secretless (local proxy / vault broker) is **not** implemented; see research notes if you need that tier.

## Verify

```bash
node scripts/doctor.mjs
RESEARCH_PRO_TRUST_HOST_ENV=0 node scripts/doctor.mjs --json
```
