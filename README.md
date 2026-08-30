# research-pro

**Systematic research skill — spiral convergence model.** Break any question (vague or clear) into sub-questions, search iteratively, and converge until every sub-question has an answer.

系统化研究 skill — 螺旋收敛模型。把任何问题（模糊或清晰）分解成子问题，迭代搜索，越搜越清晰，直到每个子问题都有答案。

Works with: **Hermes** · **Claude Code** · **OpenClaw** · **Codex** · **Kimi Code** · any agent that reads skills.

兼容：**Hermes** · **Claude Code** · **OpenClaw** · **Codex** · **Kimi Code** · 任何能读取 skill 的 agent。

---

## 🚀 Quick Start (2 minutes) · 快速开始（2 分钟）

### 1. Set your API key (one line) · 配置 API key（一条命令）

```bash
mkdir -p ~/.config/research-pro && chmod 700 ~/.config/research-pro
echo "TAVILY_API_KEY=tvly-YOUR_KEY_HERE" > ~/.config/research-pro/.env && chmod 600 ~/.config/research-pro/.env
```

Get a free key: https://app.tavily.com (1000 calls/month, no credit card, email signup). Or use `XAI_API_KEY` / `OPENROUTER_API_KEY`.

免费获取 key：https://app.tavily.com（每月 1000 次调用，无需信用卡，邮箱注册即可）。也可使用 `XAI_API_KEY` / `OPENROUTER_API_KEY`。

### 2. Install + verify (one command) · 安装并验证（一条命令）

```bash
git clone https://github.com/mfang0126/research-pro.git /tmp/research-pro && \
cd /tmp/research-pro && bash scripts/install.sh && \
node scripts/doctor.mjs --require-ready
```

### 3. Use it · 使用

```text
Research what's new in Next.js 15
帮我研究 Next.js 15 有什么新功能
```

That's it. The skill auto-triggers on research keywords (e.g. "帮我研究", "调研", "research", "investigate").

就这么简单。skill 会在检测到研究类关键词时自动触发（如"帮我研究""调研""research""investigate"）。

---

## 🤖 Agent One-Shot Setup · Agent 一键配置

Want your AI agent to install everything for you? See **[SETUP_PROMPT.md](SETUP_PROMPT.md)** — copy-paste one prompt and the agent does the rest.

想让 AI agent 自动完成全部安装？参见 **[SETUP_PROMPT.md](SETUP_PROMPT.md)** — 复制粘贴一段提示词，agent 会完成其余所有工作。

---

## What it does · 功能

| Feature · 功能 | Description · 说明 |
|---------|-------------|
| 🔍 Multi-tool search · 多工具搜索 | Tavily, Grok (web + X/Twitter), Perplexity, Firecrawl, YouTube |
| 🗺️ Research Map · 研究地图 | Track sub-questions, facts, clues, confidence · 追踪子问题、事实、线索与置信度 |
| 🎯 Search Contract · 搜索契约 | Lock scope before searching, prevent topic drift · 搜索前锁定范围，防止主题漂移 |
| 📊 Structured reports · 结构化报告 | YAML frontmatter, comparison matrices, source lists · YAML 元数据、对比矩阵、来源清单 |
| 🔄 Spiral convergence · 螺旋收敛 | Iterative: search → update map → find gaps → repeat · 迭代：搜索 → 更新地图 → 找缺口 → 重复 |
| 📝 Search trace · 搜索轨迹 | Every search logged for debugging and comparison · 每次搜索留痕，便于调试与对比 |
| 🛡️ READY gate · READY 门禁 | Won't search without verified keys · 未验证 key 前不执行搜索 |

### The 5 phases · 五个阶段

| Phase · 阶段 | Purpose · 目标 |
|---------|-------------|
| 1. Understand the question · 理解问题 | Parse intent, verify preconditions, confirm the search target · 解析意图、验证前提、确认搜索目标 |
| 2. Prepare the search · 搜索准备 | Build queries, route tools, lock the Search Contract · 构建 query、路由工具、锁定搜索契约 |
| 3. Search + map update · 搜索与地图更新 | Core loop: gather evidence, update facts & confidence · 核心循环：收集证据，更新事实与置信度 |
| 4. Convergence check · 收敛判断 | Decide: converge, fill gaps, or pivot direction · 判定：收敛、补缺口或转向 |
| 5. Log + self-optimize · 日志与自我优化 | Persist trace, review frequency, tune the next run · 留痕复盘，优化下一轮 |

---

## Structure · 项目结构

```
research-pro/
├── SKILL.md              # Core methodology (900+ lines) · 核心方法论
├── SETUP.md              # Full setup guide · 完整安装指南
├── SETUP_PROMPT.md       # One-shot agent setup prompt · agent 一键安装提示词
├── README.md             # You are here · 你正在看这里
├── env.example           # Key template · key 模板
├── evals/                # Test cases · 测试用例
├── references/           # Tavily/XAI docs, security, quality checklist
└── scripts/
    ├── doctor.mjs        # Health check (run first!) · 健康检查（先运行！）
    ├── install.sh        # Installer (symlinks into agents) · 安装器（软链到各 agent）
    ├── trace.mjs         # Search trace CLI · 搜索轨迹 CLI
    ├── grok_search.mjs   # Grok web/X search · Grok 网页/X 搜索
    ├── host_native_trace.py  # Hermes bridge for web_search/web_extract · Hermes 桥接
    ├── run-with-creds.mjs    # Credential shim for CLI tools · CLI 凭据外壳
    ├── search_with_trace.sh  # Smart-search wrapper · 智能搜索封装
    └── ...               # More utilities · 更多工具
```

---

## Version · 版本

v3.17.1-mf — spiral convergence model with host-native trace bridge.

v3.17.1-mf — 螺旋收敛模型，含 host-native 搜索轨迹桥接。

Changelog: see git log or `SKILL.md` frontmatter.
更新日志：见 git log 或 `SKILL.md` frontmatter。