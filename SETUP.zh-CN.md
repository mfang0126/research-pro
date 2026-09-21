# research-pro Setup Guide

> 中文译本：如与英文原文 [SETUP.md](SETUP.md) 有出入，以原文为准。

**版本：** 3.21.0-mf
与运行时无关的研究 skill，适用于 Claude Code、Hermes、OpenClaw、Codex、Kimi Code 或纯 shell。

任何人都可以按 **3 个步骤**完成安装：复制 skill → 填入一个 API 密钥 → 运行 doctor。

---

## 快速开始（任何人都适用）

### 1）安装 skill

```bash
# Option A — copy this folder wherever you keep agent skills
DEST="${RESEARCH_PRO_INSTALL_DIR:-$HOME/.skills/research-pro}"
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

或者在 skill 目录中执行：

```bash
bash scripts/install.sh
```

要求：**Node.js 18+**（`node -v`）。

### 2）至少添加一个 API 密钥（通用方式——适用于所有宿主）

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

**最低要求：** 上述三个密钥中任意一个即可；**或者**不使用这些脚本，改用宿主原生的网络搜索工具（Hermes/Claude 内置功能）。

**切勿提交密钥。** 脚本永远不会覆盖已设置的 `process.env` 值。

### 3）验证（READY 门槛）

```bash
node "$DEST/scripts/doctor.mjs" --require-ready
# expect: ready YES / exit 0
# exit 1 → follow the setup card (add a key), then re-run
```

然后向你的智能体提问：

```text
帮我查一下 Next.js 15 有什么新功能
# or: research Next.js 15 new features
```

智能体必须先运行 doctor，才能执行外部搜索（SKILL 第 1.0 阶段）。
---

## API 密钥

### 通用方式（推荐多智能体用户使用）

`~/.config/research-pro/.env` —— 参见 `env.example`。

覆盖设置：

```bash
export RESEARCH_PRO_HOME=~/.config/research-pro
export RESEARCH_PRO_ENV_FILE=/path/to/custom.env
```

### 各宿主专属方式（可选——仅补缺失项）

| 宿主 | 密钥放置位置 |
|------|-------------------|
| **Hermes** | `<your-api-key-config>` |
| **OpenClaw** | `~/.openclaw/.env` 或 `openclaw.json` → `env` |
| **Claude Code** | `~/.your-agent/config.json` → `"env": { "TAVILY_API_KEY": "..." }` |
| **Codex** | 启动 Codex 的 shell 环境变量；如果使用 `shell_environment_policy`，需放行 `*_API_KEY` |
| **Kimi Code** | 启动前 export，或使用通用 `.env` |

### 可选密钥

| 密钥 | 用途 |
|-----|----------|
| `TAVILY_API_KEY` | 搜索 / 提取 / 研究 |
| `XAI_API_KEY` | Grok 网页搜索 + X 搜索 |
| `OPENROUTER_API_KEY` | Perplexity/sonar 回退 |
| `FIRECRAWL_API_KEY` | JS 密集型页面抓取 |
| `YOUTUBE_API_KEY` | YouTube Data API（`YOUTUBE_API` 别名亦可） |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | SERP |
| `REDDIT_SESSION` | Reddit cookie（可选） |

### 凭据解析顺序

1. `process.env`（**永不**被覆盖）
2. `RESEARCH_PRO_ENV_FILE` 或 `$RESEARCH_PRO_HOME/.env`
3. `~/.config/research-pro/.env`
4. 宿主适配器（仅补缺失项）：Hermes → OpenClaw  
   - 禁用宿主来源：`export RESEARCH_PRO_TRUST_HOST_ENV=0`
5. 仅当 `RESEARCH_PRO_LOAD_CWD_ENV=1` 时，读取 CWD 下的 `./.env`

从宿主文件读取的只有 research-pro 的密钥名（白名单机制——无关的机密会被丢弃）。

---

## 可选 CLI 工具

| 工具 | 安装方式 | 新增能力 |
|------|---------|------|
| `tvly` | Tavily CLI | 快速的搜索/提取/研究 |
| `firecrawl` | `npm i -g firecrawl-cli` | 抓取 |
| `yt-dlp` | `brew install yt-dlp` | 无需 API 密钥即可使用 YouTube |

缺失的工具会被跳过。

---

## 安全（简述）

- **不要**把密钥存放在 skill 目录内
- 优先使用进程注入或 `~/.config/research-pro/.env`
- 已弃用：`scripts/lib/print-key.mjs`（stdout 可能泄漏到智能体日志中）
- 推荐：`scripts/research.mjs` / `grok_search.mjs`（进程内 `resolveKey`）

详情：`references/security.md` · 运行时：`references/runtimes.md`

---

## 日志

```text
RESEARCH_PRO_HOME  default: ~/.config/research-pro
run-log:           $RESEARCH_PRO_HOME/run-log.jsonl
```

---

## 工作原理

1. 识别用户想要做出的决策以及当前的知识缺口。
2. 基于当前证据，在共享预算内选择搜索、阅读、澄清或停止。
3. 返回与任务相称的答案，并附上支撑来源、适用范围限制和未解决的缺口。

doctor 检查工具是否就绪，不评估证据质量。旧版的深度标签只是可选元数据，不是强制性的搜索顺序或完成配额。

完整方法论：`SKILL.md`
