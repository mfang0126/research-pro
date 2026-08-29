# One-Shot Agent Setup Prompt

Copy the block below and paste it into your AI agent (Hermes, Claude Code, Codex, Kimi, etc.). The agent will install research-pro, configure your API key, and verify everything works.

---

## Step 1: Create your key file (manual, 10 seconds)

```bash
mkdir -p ~/.config/research-pro && chmod 700 ~/.config/research-pro
cat > ~/.config/research-pro/.env << 'EOF'
TAVILY_API_KEY=tvly-xxxxxxxxxxxxx
# XAI_API_KEY=xai-xxxxxxxxxxxxx
# OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx
EOF
chmod 600 ~/.config/research-pro/.env
```

Replace the `xxxxxxxxxxxxx` with your real key. Uncomment any one you have. **Minimum: any ONE key.**

Get keys:
- **Tavily** (best default): https://tavily.com → free tier 1000 calls/month
- **xAI/Grok**: https://console.x.ai → real-time + X/Twitter search
- **OpenRouter**: https://openrouter.ai → Perplexity fallback

---

## Step 2: Paste this to your agent

```text
Install the research-pro skill and verify it works. Do these steps:

1. Clone the repo:
   git clone https://github.com/mfang0126/research-pro.git /tmp/research-pro

2. Run the installer:
   cd /tmp/research-pro && bash scripts/install.sh

3. Verify the doctor passes:
   node scripts/doctor.mjs --require-ready --json

4. If doctor says "ready: false", tell me which keys are missing.

5. If ready, do a quick test search:
   Tell me the current date and search for "latest AI news today" using the research-pro skill.

Report: installed ✓ / ready ✓ / keys detected ✓ or ✗ / test search ✓ or ✗
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
