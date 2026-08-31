# One-Shot Agent Setup Prompt

Copy the block below and paste it into your AI agent (Hermes, Claude Code, Codex, Kimi, etc.). The agent will install research-pro, configure your API key, and verify everything works.

---

## Step 1: Get your API key (free, 1 minute)

Go to https://app.tavily.com → sign up with email (no credit card needed) → copy your API key from the dashboard.

Or use xAI (https://console.x.ai) / OpenRouter (https://openrouter.ai/keys).

## Step 2: Tell your agent to install

Paste this to your AI agent (replace `tvly-YOUR_KEY_HERE` with your real key):

```text
Do these steps to install the research-pro skill:

1. Clone and install:
   git clone https://github.com/mfang0126/research-pro.git /tmp/research-pro
   cd /tmp/research-pro && bash scripts/install.sh

2. Set up the API key:
   mkdir -p ~/.config/research-pro
   cp /tmp/research-pro/env.example ~/.config/research-pro/.env
   Then edit ~/.config/research-pro/.env and set: TAVILY_API_KEY=tvly-YOUR_KEY_HERE
   chmod 600 ~/.config/research-pro/.env

3. Verify:
   node scripts/doctor.mjs --require-ready --json

4. If ready: true, search for "latest AI news today" as a test.

Report: installed ✓/✗ · keys ✓/✗ · test search ✓/✗
```

---

## How it works

The installer (`install.sh`) will:
- Copy the skill to `~/.skills/research-pro` (or wherever you clone it)
- Create symlinks into any agents it finds (`~/.hermes/external-skills/`, `~/.claude/skills/`, `~/.openclaw/skills/`, `~/.codex/skills/`)
- Copy the key template to `~/.config/research-pro/.env` (won't overwrite if you already created it in Step 1)
- Run the doctor

The doctor (`doctor.mjs`) checks:
- Node.js 18+ installed
- At least one API key found
- Key format looks valid
- Reports `tier`: none / min / good / full

After install, just say "research [topic]" or "帮我研究 [主题]" and the skill auto-triggers.
