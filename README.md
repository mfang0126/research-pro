# research-pro

系统化研究 skill（螺旋收敛模型）。把任何问题分解成子问题，迭代搜索，越搜越清晰。

独立 repo 于 2026-08-29 从 `~/.agents` monorepo 拆出。

## 快速开始

```bash
# 安装（创建 symlink 到 Hermes external-skills）
bash scripts/install.sh

# 验证
node scripts/doctor.mjs --require-ready
```

## 使用

在 Hermes 中说「帮我研究 X」自动触发，或直接加载 skill。

## 结构

| 路径 | 说明 |
|------|------|
| `SKILL.md` | 核心方法论（897 行） |
| `SETUP.md` | 安装说明 |
| `scripts/` | doctor, trace, grok_search, host_native_trace 等 |
| `references/` | Tavily/XAI/Firecrawl 文档、安全策略 |
| `evals/` | 测试用例 |

## 版本

v3.17.1-mf（螺旋收敛模型，含 host-native trace bridge）

版本线见 monorepo 历史 commit message（初始 commit 体）。
