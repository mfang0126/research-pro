# Jev pre-judgment layer (jev_plan / jev_rank)

> 中文译本：如与英文原文 [jev-judge.md](jev-judge.md) 有出入，以原文为准。

可选、fail-open（失败即放行）的一层，在一次检索的前后各加一次快速的
TypeSafe **Jev** 调用。Jev 是决策模型（返回带类型的 `noul` / `choice`
答案），不是文本模型：由代码提出候选，由 Jev 选择并评分。

该模式改编自 [superagents-lab/jev-search](https://github.com/superagents-lab/jev-search)
（`src/lib/candidates.ts`、`src/lib/typesafe.ts`、`src/lib/pipeline.ts`；
MIT License，Copyright (c) 2026 Search1API）。research-pro 保留自己的
检索后端，仅复用 Jev 的判定模式。

## 文件

| 文件 | 作用 |
|---|---|
| `scripts/lib/jev_candidates.mjs` | 基于规则的关键词查询候选（代码提出候选，Jev 负责选择） |
| `scripts/lib/jev_client.mjs` | 极简 System One 客户端（单次 POST、不重试、带 kill switch） |
| `scripts/lib/jev_judge.mjs` | `inferPlan()`（query/window/hints）+ `rankResults()`（批量 triage） |
| `scripts/lib/jev_trace.mjs` | 可选的 trace 钩子（`RESEARCH_PRO_RUN_ID`） |
| `scripts/jev_plan.mjs` | CLI：规划一次检索 |
| `scripts/jev_rank.mjs` | CLI：为结果行评分 |

## 用法

```bash
node scripts/jev_plan.mjs '{"request":"<sub-question>"}'
# → { ok, candidates, query{index,text,confidence}, window{choice},
#     targets[{id,p}], recommended{query,hints,window,threshold,fallback},
#     usage, model, provider, latencyMs }

node scripts/jev_rank.mjs '{"request":"...","results":[{"title":"...","snippet":"..."}]}'
# → { ok, scored[{index,id,p}], usage, model, latencyMs, (threshold, below)? }
```

接入一次运行：设置 `RESEARCH_PRO_RUN_ID`（来自 `trace.mjs init`）后，
两个 CLI 都会向 `calls.jsonl` 追加一条记录（`tool: jev_plan|jev_rank`）。
调用 smart-search 时使用 `recommended.query` + `recommended.hints`。

## 配置

| 变量 | 含义 |
|---|---|
| `TYPESAFE_API_KEY` / `JEV_API_KEY` | 同一个 key；两个名称均可（在 `credentials.mjs` 中互为正式名与别名） |
| `TYPESAFE_MODEL` | 默认 `jev-latest`（2026-09 实测为 `jev-1.13.0`） |
| `RESEARCH_PRO_JEV=off` | kill switch（总开关）；该层报告为不可用，调用方直接向下执行 |
| `RESEARCH_PRO_JEV_TIMEOUT_MS` | 请求超时，默认 20000 |

`node scripts/doctor.mjs` 会在 `Capabilities` 之下报告
`jev_judge: available|MISSING`。Jev 不是检索后端，`runnable` 不受影响。

## 校准注意事项（务必阅读）

- **阈值是本地默认值，并非校准后的取值。**`0.6`（hint 选择）以及任何
  排序阈值都来自外部示例；在把它们用作硬性门槛之前，须先在冻结的
  本地样本上重新校准。`rankResults` 的评分只用于排序和标记——
  它们**不是证据**。
- **模型行为随版本变化。**每次调用都要记录返回的 `model`（通过别名
  `jev-latest` 实际观测到 `jev-1.13.0`；该端点仍为 alpha）。当实验需要可复现时，
  必须固定或记录对应的模型快照。
- **已知的校准方向（既有证据，仅可作为先验）：**在 OOD 集合上，
  choice/score 类回答倾向于过度自信，boolean/noul 类则偏于信心不足；
  单独使用 Jev 做重排不如向量检索（融合方案更优）——请把它当作
  快速的门控/triage 层，而不是最终决策者。
- **设计上不重试。**失败的调用会被记录下来（写入 trace），并以
  `{"ok":false,"error":...}` 的形式返回；调用方必须继续走正常流程
  （fail-open）。

## 目前实测结果（2026-09-21，本机）

| 检查项 | 结果 |
|---|---|
| `inferPlan` 形态的调用（7 个问题，CJK 状态） | HTTP 200，668 ms |
| `rerank` 形态的调用（3 行，1 个干扰项） | HTTP 200，590 ms；评分 0.98 / 0.96 / 0.01 |
| 成本 | 合计约 $0.00007（输入 968 + 712 tokens，`jev-1.13.0`） |

## A/B 对照运行（2026-09-21）

两个子问题，每个问题各一条朴素基线（按原样输入的查询，`serp`/dataforseo
后端）与一条 Jev 规划的查询（同一后端）对比；四组结果集均用 `jev_rank`
评分。Trace 运行 `20260921T030349Z_research-pro-x-jev-judge_e9380a`（light 模式）。

| 子问题 | 分组 | top-5 平均 p | 平均 p | p ≥ 0.5 的行数 | URL 重叠 |
|---|---|---|---|---|---|
| S1 Apple-Silicon 社区经验 | A 按原样输入 | 0.908 | 0.914 | 8/8 | 4 条共同 / 12 |
| S1 | B 规划后 | 0.924 | 0.926 | 8/8 | 新增 4 条高 p 发现（0.89–0.93） |
| S2 Jev 社区报告 | A 按原样输入 | 0.862 | 0.845 | 8/8 | 8 条共同 / 8 |
| S2 | B 规划后 | 0.854 | 0.839 | 8/8 | 规划查询＝原始查询（无变化） |

发现：

- 机制端到端可用：规划（约 0.65 s）→ 检索 → 评分（约 0.6–0.8 s）；
  每次调用都记录在运行 trace 中（`tool: jev_plan|jev_rank`，以及各次检索）。
- S1：规划后的候选保留了社区信号、去掉了时间短语，
  产生的相关性持平或更优，**并且**额外找到 4 条高 p
  结果，而这些是朴素查询漏掉的。
- S2：没有候选优于原措辞，Jev 保留了原始查询——这是保守行为，没有出现
  回退恶化（S2-B 的检索命中了跨运行缓存——查询完全相同——因此没有触发新的
  后端调用）。
- 评审噪声：相同的行在不同运行之间评分相差 ±0.01–0.02。请把评分当作
  triage 信号；在做任何阈值决策前先完成校准。
- 环境说明：运行时 Tavily 已超出按量付费上限，因此可执行的 hint 路由
  仅限于非 Tavily 后端，这次对比也就只在单一后端上考察查询构造本身。
  hint 建议本身是合理的（`S1 → deep, realtime, community`；
  `S2 → deep, community`）。
