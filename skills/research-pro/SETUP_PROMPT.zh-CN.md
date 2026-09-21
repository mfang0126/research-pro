# One-Shot Agent Setup Prompt

> 中文译本：如与英文原文 [SETUP_PROMPT.md](SETUP_PROMPT.md) 有出入，以原文为准。

复制下面的文本块，粘贴给你的 AI 智能体（Hermes、Claude Code、Codex、Kimi 等）。智能体会安装 research-pro、配置你的 API 密钥，并验证一切正常。

---

## 第 1 步：获取 API 密钥（免费，1 分钟）

打开 https://app.tavily.com → 用邮箱注册（无需信用卡）→ 从控制台复制你的 API 密钥。

也可以使用 xAI（https://console.x.ai）或 OpenRouter（https://openrouter.ai/keys）。

## 第 2 步：让你的智能体执行安装

把下面这段粘贴给 AI 智能体（将 `tvly-YOUR_KEY_HERE` 替换为你的真实密钥）：

```text
按以下步骤安装 research-pro skill：

1. 克隆并安装：
   git clone https://github.com/mfang0126/research-pro.git /tmp/research-pro
   cd /tmp/research-pro && bash scripts/install.sh

2. 配置 API 密钥：
   mkdir -p ~/.config/research-pro
   cp /tmp/research-pro/env.example ~/.config/research-pro/.env
   然后编辑 ~/.config/research-pro/.env 并设置：TAVILY_API_KEY=tvly-YOUR_KEY_HERE
   chmod 600 ~/.config/research-pro/.env

3. 验证：
   node scripts/doctor.mjs --require-ready --json

4. 如果 ready: true，就以 "latest AI news today" 作为测试执行一次搜索。

汇报：安装 ✓/✗ · 密钥 ✓/✗ · 测试搜索 ✓/✗
```

---

## 工作原理

安装脚本（`install.sh`）将执行以下操作：
- 把 skill 复制到 `~/.skills/research-pro`（或你克隆到的任意位置）
- 在检测到的各个智能体目录中创建符号链接（`~/.hermes/external-skills/`、`~/.claude/skills/`、`~/.openclaw/skills/`、`~/.codex/skills/`）
- 把密钥模板复制到 `~/.config/research-pro/.env`（如果你已在第 1 步创建过，则不会覆盖）
- 运行 doctor

doctor（`doctor.mjs`）会检查：
- 是否已安装 Node.js 18+
- 是否至少找到一个 API 密钥
- 密钥格式是否看起来有效
- 并报告 `tier`：none / min / good / full

安装完成后，只需说 “research [topic]” 或 “帮我研究 [主题]”，skill 就会自动触发。
