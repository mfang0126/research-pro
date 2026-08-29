# research-pro

系统化研究 skill — 螺旋收敛模型。把任何问题分解成子问题，迭代搜索，越搜越清晰。

Works with: **Hermes** · **Claude Code** · **OpenClaw** · **Codex** · **Kimi Code** · any agent that reads skills.

---

## 🚀 Quick Start (2 minutes)

### 1. Set your API key (one line)

```bash
mkdir -p ~/.config/research-pro && chmod 700 ~/.config/research-pro
echo "TAVILY_API_KEY=tvly-YOUR_KEY_HERE" > ~/.config/research-pro/.env && chmod 600 ~/.config/research-pro/.env
```

Get a free key: https://app.tavily.com (1000 calls/month, no credit card, email signup). Or use `XAI_API_KEY` / `OPENROUTER_API_KEY`.

### 2. Install + verify (one command)

```bash
git clone https://github.com/mfang0126/research-pro.git /tmp/research-pro && \
cd /tmp/research-pro && bash scripts/install.sh && \
node scripts/doctor.mjs --require-ready
```

### 3. Use it

```text
帮我研究 Next.js 15 有什么新功能
```

That's it. The skill auto-triggers on research keywords.

---

## 🤖 Agent One-Shot Setup

Want your AI agent to install everything for you? See **[SETUP_PROMPT.md](SETUP_PROMPT.md)** — copy-paste one prompt and the agent does the rest.

---

## What it does

| Feature | Description |
|---------|-------------|
| 🔍 Multi-tool search | Tavily, Grok (web + X/Twitter), Perplexity, Firecrawl, YouTube |
| 🗺️ Research Map | Track sub-questions, facts, clues, confidence |
| 🎯 Search Contract | Lock scope before searching, prevent topic drift |
| 📊 Structured reports | YAML frontmatter, comparison matrices, source lists |
| 🔄 Spiral convergence | Iterative: search → update map → find gaps → repeat |
| 📝 Search trace | Every search logged for debugging and comparison |
| 🛡️ READY gate | Won't search without verified keys |

---

## Structure

```
research-pro/
├── SKILL.md              # Core methodology (897 lines)
├── SETUP.md              # Full setup guide
├── SETUP_PROMPT.md       # One-shot agent setup prompt
├── README.md             # You are here
├── env.example           # Key template
├── evals/                # Test cases
├── references/           # Tavily/XAI docs, security, quality checklist
└── scripts/
    ├── doctor.mjs        # Health check (run first!)
    ├── install.sh        # Installer (symlinks into agents)
    ├── trace.mjs         # Search trace CLI
    ├── grok_search.mjs   # Grok web/X search
    ├── host_native_trace.py  # Hermes bridge for web_search/web_extract
    ├── run-with-creds.mjs    # Credential shim for CLI tools
    ├── search_with_trace.sh  # Smart-search wrapper
    └── ...               # More utilities
```

---

## Version

v3.17.2 — spiral convergence model with host-native trace bridge.

Changelog: see git log or `SKILL.md` frontmatter.
