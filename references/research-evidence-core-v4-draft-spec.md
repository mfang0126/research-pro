# Research Evidence Core v4 草案规范

> 状态：`DRAFT`  
> 性质：候选规范，不是实现代码、已批准政策、发布授权或迁移授权。  
> 基线日期：2026-07-27  
> 当前兼容基线：Research Pro `3.15.1-mf`

## 0. 文档地位与事实边界

本文件提出一个可移植的 `research-evidence-core` 候选规范。全文中：

- **已验证当前状态**仅指对 Research Pro `3.15.1-mf` 的 `SKILL.md` 规范文本所作的本地读取与核对；不代表脚本、运行时、历史产物或跨运行时行为已经验证。
- 标为 **`DRAFT`**、**`proposal`**、**候选**的内容均未获采纳。
- 基线文档提到的外部资料仍为 `pending independent revalidation`；本文件不把那些资料的内容升级为独立验证事实。
- 本文件不改变 v3 行为，不批准 v4 投入使用，也不规定某个 agent、profile 或审查安排已经被证明更优。

已验证的当前规范文本具备 READY 门闩、local-first、Search Contract、研究地图、多轮 Critic/Reflection、来源清单、运行 trace 和结构化最终报告；同时，研究地图仍是工作记忆，现有 trace 可清理，最终报告尚未建立稳定的 Source/Evidence/Claim/Relation/Inference 权威图谱。以上结论只适用于已读取的规范文本。

## 1. 目的与非目标

### 1.1 `DRAFT` 目的

本候选 core 旨在规定一种 agent-agnostic、runtime-agnostic 的研究证据模型，使研究结果能够：

1. 将实质性事实主张追溯到精确证据和来源；
2. 区分来源陈述、直接观察、研究主张、推断和决策；
3. 明确一条边是结构连接，还是具有认识论含义的支持、反驳或限定；
4. 保存关系的方向、蕴含程度、适用范围、理由和审查状态；
5. 在上游内容变化时，确定性地标记受影响的下游记录；
6. 形成可持久保存、可验证、可迁移、可独立阅读的研究 package；
7. 让 Research Pro、Hermes、Codex 及其他宿主通过 adapter 使用同一 core。

### 1.2 `DRAFT` 非目标

Core 不负责：

- 搜索后端选择、查询执行、抓取或浏览器操作；
- 凭据读取、secret 保存、READY 探测或权限配置；
- 本机输出根、私有绝对路径或特定文件系统布局；
- 聊天确认界面、Kanban、发布、通知或客户交付；
- 证明某种 human/agent/profile 组合天然优于另一种组合；
- 将所有文字都当成待外部证实的事实。标题、用户输入、流程元数据和明确标注的价值偏好不属于外部事实验证对象；
- 自动保证研究结论为真。Core 只提供可检查的记录、关系、状态与失败条件。

Research Pro、Hermes、Codex 等集成均位于 core 之外。Core 可以要求 adapter 提供某项能力，但不得指定具体工具、供应商、环境变量、凭据位置或宿主名称。

## 2. 规范词汇

下列定义均为 `DRAFT proposal`。

| 术语 | 候选规范含义 |
|---|---|
| **Source** | 被读取、观察或测量的来源对象及其来源谱系。Source 本身不是某项主张的真实性证明。 |
| **Evidence** | 从一个 Source 中捕获的、可定位的摘录、测量值、本地观察或数据行。Evidence 不得混入未标注的解释。 |
| **Claim** | 可被支持、反驳或审查的命题。候选类型为 `source_assertion`、`observed_fact`、`research_claim`。 |
| **Relation** | 两个记录之间的一等有向边。它既可表达结构，也可表达认识论支持、反驳、语境限定或决策输入。 |
| **Inference** | 由一个或多个 Claim/Inference 经显式假设、推理和替代解释形成的分析结论；不得伪装成已观察事实。 |
| **Decision Context** | 决策目标、评价标准及权重、约束、风险容忍度、成本、权衡、可逆性和利益相关方价值。 |
| **Decision** | 在一个明确 Decision Context 下形成的候选建议、选择或不行动结论。Decision 不是事实链自然生成的终点。 |
| **Open Question** | 尚缺证据或尚未解决、且可能影响 Claim、Inference 或 Decision 的问题。 |
| **Review** | 对记录内容、关系蕴含、scope、状态转换或 package 完整性的可追溯检查结果。 |
| **Package** | 使用相对路径组织、带 manifest 与完整性信息、可被另一运行时独立验证的便携研究产物。 |

规范关键词建议采用：

- **MUST / 必须**：候选规范若被采纳后不可省略；
- **MUST NOT / 不得**：候选规范若被采纳后禁止；
- **SHOULD / 应当**：有充分理由才可偏离，并须记录理由；
- **MAY / 可以**：可选行为。

这些关键词当前仍属于 `DRAFT`，不构成已生效政策。

## 3. 类型化关系模型

### 3.1 `DRAFT` 图模型

候选 core 使用有类型的有向图，而不是线性流水线：

```text
Source --contains--> Evidence
Evidence --supports / contradicts / contextualizes--> Claim
Claim --supports / contradicts / contextualizes--> Inference
Claim / Inference --informs--> Decision
Decision Context --constrains / informs--> Decision
Open Question --requires--> Evidence（目标可尚不存在）
Review --reviews--> Record / Relation / Package
Package --includes--> Artifact
```

### 3.2 结构关系与认识论关系

**结构关系**描述归属、组成、谱系或审查对象，不得被计作对命题的支持：

- `contains`：Source 包含 Evidence；
- `derived_from`：Source 派生自另一个 Source；
- `groups_with`：Source 属于同一独立性组；
- `includes`：Package 包含 artifact；
- `reviews`：Review 检查某记录、关系或 Package；
- `requires`：Open Question 指向所需 Evidence 类型或占位目标。

**认识论支持关系**表达某个上游记录如何影响某个命题或结论：

- `supports`：正向支持；
- `contradicts`：反向支持，即反驳；
- `contextualizes`：只提供背景、限制或解释条件，不足以单独支持；
- `informs`：为 Inference 或 Decision 提供输入，但不表示单独蕴含；
- `constrains`：Decision Context 对 Decision 的可行域施加限制。

结构关系不得拥有虚假的 `entailment: direct`。认识论关系必须携带第 3.3 节字段。

### 3.3 每条认识论 Relation 的必需语义

候选 Relation 必须记录：

| 字段 | `DRAFT` 要求 |
|---|---|
| `from_id`, `to_id` | 明确方向；不得依赖数组顺序或文字暗示。 |
| `relation_type` | 使用受控词汇，如 `supports`、`contradicts`、`contextualizes`、`informs`、`constrains`。 |
| `polarity` | `positive`、`negative` 或 `neutral`；必须与 relation type 一致。 |
| `support_role` | `necessary`、`corroborating`、`contextual` 或 `decision_input`。 |
| `entailment` | `direct`、`partial`、`indirect` 或 `none`。 |
| `scope_match` | `full`、`partial`、`mismatch` 或 `unknown`，并指明时间、对象、地域、版本等差异。 |
| `rationale` | 简述为何该边成立；不得只重复两端文本。 |
| `status` | `proposed`、`reviewed`、`disputed`、`invalidated` 或 `withdrawn`。 |
| `created_by`, `created_at` | 创建主体与时间；主体使用非秘密、package 内可解释的标识。 |
| `reviewed_by`, `reviewed_at` | 当状态声称已审查时必须存在；未审查时不得伪填。 |

额外规则：

1. `entailment: none` 的边不得令 Claim 进入 `supported` 或 `corroborated`。
2. `scope_match: mismatch` 的边不得作为正向有效支持。
3. `contextualizes` 不得被 validator 计为支持数量。
4. `corroborating` 只有在独立性规则通过后才可增加独立佐证计数。
5. `informs` 不等价于“证明 Decision 正确”。
6. Source 的笼统 `authority` 或 `freshness` 不能替代具体 Relation 对具体 Claim 的 scope 与质量判断。

### 3.4 允许的端点组合

`DRAFT proposal` 至少约束：

| From | Relation | To | 说明 |
|---|---|---|---|
| Source | `contains` | Evidence | 结构边 |
| Source | `derived_from` | Source | 谱系边，必须无环 |
| Evidence | `supports/contradicts/contextualizes` | Claim | 认识论边 |
| Claim | `supports/contradicts/contextualizes` | Inference | 认识论边 |
| Inference | `supports/contradicts` | Inference | 允许分层推断，但必须无循环依赖 |
| Claim/Inference | `informs` | Decision | 决策输入 |
| Decision Context | `constrains/informs` | Decision | 目标、标准与约束 |
| Review | `reviews` | 任一可审查记录或 Relation | 结构边 |

Evidence 不得直接 `proves` Decision；本候选词汇不定义 `proves`。

## 4. Claim 生命周期与下游失效

### 4.1 Claim 类型与状态

候选 Claim 类型：

- `source_assertion`：准确表达某来源声称了什么；
- `observed_fact`：直接测量或本地观察；
- `research_claim`：研究者基于证据综合提出的事实性命题。

候选状态：

```text
proposed -> supported -> corroborated
    |           |             |
    +--------> disputed <-----+
                    |
               retracted
```

规则：

1. 新 Claim 必须从 `proposed` 开始。
2. `supported` 至少需要一条有效正向 Relation，且不得存在未处置的致命 scope mismatch。
3. `corroborated` 必须满足预先声明的佐证门槛；至少来自两个不同 independence group 的有效支持只是候选最低条件，不代表普遍充分。
4. 存在实质性有效反驳且尚未裁决时，Claim 必须为 `disputed`，不能继续以无条件事实出现在报告中。
5. 原作者撤回、关键证据失真、错误 locator 或命题被明确否定时，Claim 应转为 `retracted`。
6. 状态降级不得删除历史；必须写入 journal 事件和原因。
7. 从 `retracted` 恢复不得原地改回；应创建新 Claim ID，并保留 supersedes/superseded_by 结构关系。

### 4.2 下游失效传播

当 Source、Evidence、Claim 或 Relation 的内容、locator、hash、scope、状态或独立性组发生影响语义的变化时，候选 validator 必须：

1. 将直接依赖该记录的已审查 Relation 标记为 `invalidated` 或 `review_required`；
2. 将依赖失效 Relation 的 Claim/Inference 的先前支持计算作废并重新计算状态；
3. 将下游 Inference 标记为 `stale`，直到其所有必要支持重新通过；
4. 将受影响 Decision 标记为 `stale` 或 `blocked`，不得继续显示为当前有效建议；
5. 将引用受影响对象的 Review 标记为 `stale`；
6. 更新 Package 完整性状态，使其不能继续声称 `complete_validated`；
7. 在 journal 中记录传播起点、受影响 ID 集合、时间和触发原因。

传播不得静默删除记录。`contextual` 支持失效可以只触发 `review_required`；`necessary` 支持失效必须阻断下游有效状态。若自动化无法判断影响，应 fail closed 为 `review_required`，不得保持“有效”。

## 5. 来源独立性与派生来源

### 5.1 `DRAFT` 来源谱系

每个 Source 应记录：

- `canonical_source_id`：同一内容或同一发布对象的规范代表；
- `derived_from`：直接或已知上游来源 ID；
- `independence_group`：共享主要上游事实、数据集、稿件或测量过程的来源组；
- `derivation_kind`：如 `republication`、`summary`、`translation`、`search_snippet`、`syndication`、`shared_dataset`；
- `independence_status`：`independent`、`derived`、`shared_upstream`、`unknown`；
- `independence_rationale`：分组依据与不确定性。

### 5.2 计数规则

1. 同一 independence group 内的多个 Source 不得计作多个独立佐证。
2. 转载、翻译、新闻摘要、搜索摘要和引用同一上游研究的数据，默认不得计作独立来源。
3. `independence_status: unknown` 不得被自动计为独立；可以作为线索或背景。
4. 一个 Source 可以对不同 Claim 具有不同的相关性和时效性；不得以 Source 全局分数替代 relation-level 判断。
5. 自动去重仅能提出候选分组；改变独立佐证计数前应保留理由并允许 Review。
6. 派生图必须无环；发现循环即验证失败。

## 6. 候选 canonical ledger 与稳定 ID

### 6.1 权威边界

`DRAFT proposal`：`ledger.yaml` 是 Package 内唯一结构化权威数据源。`final-report.md` 是由 ledger 投影的读者视图，不得反向成为权威编辑入口。`journal.jsonl` 保存事件历史，但不取代当前 ledger 状态。

Ledger 候选顶层集合：

- `sources`
- `evidence`
- `claims`
- `relations`
- `inferences`
- `decision_contexts`
- `decisions`
- `open_questions`
- `reviews`

### 6.2 稳定 ID 约束

1. ID 在一个 Package 内必须唯一，且创建后永久不复用。
2. ID 不得编码私有路径、凭据、客户信息、可变标题或数组位置。
3. 修改记录内容不得修改其 ID；若语义身份改变，应创建新 ID 并显式关联替代关系。
4. 删除采用 tombstone 或状态撤回，不得让旧 ID 指向新对象。
5. ID 前缀应反映实体类型，如 `SRC-`、`EVD-`、`CLM-`、`REL-`、`INF-`、`CTX-`、`DEC-`、`OQ-`、`REV-`。
6. 跨 Package 引用不属于 P0 最小能力；若未来启用，必须包含 `package_id + record_id`，不能依赖文件系统位置。
7. 内容寻址 ID 属于后续候选增强，不应成为 P0 的唯一 ID 方案。

### 6.3 非最终 YAML 示例

以下片段仅为 **`DRAFT / non-final illustrative YAML`**，字段名和枚举尚未获采纳：

```yaml
# DRAFT / non-final illustrative YAML
ledger_version: "proposal-v4"
sources:
  - id: SRC-001
    title: "示例规范文档"
    locator: "https://example.invalid/spec"
    source_type: documentation
    accessed_at: "2026-07-27T00:00:00Z"
    canonical_source_id: SRC-001
    derived_from: []
    independence_group: IG-001
    independence_status: independent
    scope_limit: "仅覆盖该版本规范文本"

evidence:
  - id: EVD-001
    source_id: SRC-001
    evidence_type: quote
    locator: "section-2"
    excerpt_or_value: "示例摘录"
    captured_at: "2026-07-27T00:01:00Z"
    verification_status: captured

claims:
  - id: CLM-001
    text: "示例来源在第二节声明了该内容"
    claim_kind: source_assertion
    scope: "该来源第二节"
    temporal_scope: "所读取版本"
    status: proposed
```

```yaml
# DRAFT / non-final illustrative YAML
relations:
  - id: REL-001
    from_id: EVD-001
    to_id: CLM-001
    relation_type: supports
    polarity: positive
    support_role: necessary
    entailment: direct
    scope_match: full
    rationale: "摘录直接包含该来源陈述"
    status: proposed
    created_by: actor-researcher
    created_at: "2026-07-27T00:02:00Z"
    reviewed_by: null
    reviewed_at: null

inferences:
  - id: INF-001
    text: "候选分析结论"
    assumptions: ["示例假设"]
    alternatives: ["替代解释"]
    falsifiers: ["若出现相反测量则不成立"]
    confidence: low
    status: proposed

decision_contexts:
  - id: CTX-001
    goal: "选择可审计的研究流程"
    criteria: ["可追溯性", "维护成本"]
    constraints: ["不依赖单一运行时"]
    risk_tolerance: low
    reversibility: reversible

decisions:
  - id: DEC-001
    recommendation: "先进行 shadow-mode 评估"
    decision_context_id: CTX-001
    decision_risk: medium
    status: proposed
```

## 7. 候选 portable Package

### 7.1 `DRAFT` 最小布局

```text
<package-id>/
├── manifest.yaml
├── contract.yaml
├── journal.jsonl
├── ledger.yaml
├── final-report.md
└── snapshots/          # optional，默认关闭
```

### 7.2 Manifest 与完整性

候选 `manifest.yaml` 必须记录：

- `schema_version`、`package_id`、`package_status`；
- Package 内文件的相对路径、媒体类型、字节数和内容 hash；
- 生成器/adapter 的非秘密标识和版本；
- 可选的外部 runtime run 标识，但不得把 runtime trace 变成知识权威；
- 创建、最后更新和验证时间；
- snapshot 策略、隐私分类、保留策略；
- manifest 自身 hash 的计算边界或签名策略。

规则：

1. 所有 artifact 引用必须是 package-relative；不得包含私有绝对路径。
2. Package 不得包含凭据、token、secret、客户数据或无必要的个人数据。
3. snapshot 默认关闭；启用时必须满足许可、版权、隐私和最小必要原则。
4. 写入中 Package 必须为 `incomplete`；只有全部文件、引用、hash 与 validator 通过后才可为 `complete_validated`。
5. 中断恢复不得把部分写入误标为完成。
6. manifest hash 不匹配、缺文件或额外未声明权威文件均应验证失败。
7. runtime trace 与 durable Package 只能通过显式 `run_id/package_id` 互链；trace 的清理不得破坏 Package 的可验证性。
8. Package 验证不得要求某个特定搜索 CLI、宿主、环境变量或本机目录。

## 8. Quick / Standard / Deep 契约

以下均为 `DRAFT proposal`，具体门槛仍需评估。

### 8.1 所有层级的最低可审计标准

无论层级，凡进入最终答复的实质性事实主张，至少必须：

1. 可追溯到 Source；
2. 对关键证据提供可复查 locator；
3. 明确区分 Claim 与 Inference；
4. 对不确定、争议、scope mismatch 和未解决问题作显式标记；
5. 不把同一上游的派生来源算作独立佐证；
6. 不把 `contextualizes` 或 `informs` 误写成直接证明。

### 8.2 Quick

Quick 可以省略：

- 完整耐久 Package；
- 完整 journal；
- 对非关键 Claim 的一等 Relation；
- 全量替代解释和 falsifier；
- 独立审查；
- snapshot。

Quick 不得省略：

- 最终实质性事实的来源与 locator；
- 推断标签；
- 关键 scope 限制；
- 已知矛盾和主要缺口；
- 对高风险决策明确升级到 Standard/Deep 的提示。

Quick 的轻量输出不得声称等同于完整 canonical ledger，也不得被自动提升为高风险决策依据。

### 8.3 Standard

Standard 候选默认生成最小五文件 Package；仅要求记录进入报告或实质影响结论的材料。必须包含：

- 已确认的 contract；
- canonical ledger；
- 关键 Source/Evidence/Claim/Relation/Inference；
- Decision 存在时的 Decision Context；
- 最小 journal 事件；
- manifest 完整性；
- 可确定性生成的 final report；
- validator 通过结果。

### 8.4 Deep

Deep 在 Standard 基础上增加：

- 更完整的反证搜索、替代解释和 falsifier；
- 所有关键关系的审查状态；
- 高影响 Open Question；
- 更完整 journal 与方向变化记录；
- 独立性分组的人工复核；
- 高风险 Decision 的独立 Review；
- 经明确许可的可选 snapshot。

Deep 不意味着自动正确，也不意味着必须采用某种特定 profile 或多 agent 架构。

## 9. Human / Agent Review 模型

### 9.1 可自检事项

创建记录的同一 human 或 agent 可以执行机械性自检：

- schema 与必填字段；
- ID 唯一性和引用存在性；
- relation 端点类型；
- hash、manifest 和相对路径；
- Source 派生图和推断图是否有环；
- 状态转换是否合法；
- 报告是否可从 ledger 确定性生成；
- Evidence locator 是否存在于已捕获内容中；
- 明显的 scope 或时间字段缺失。

自检结果必须标为 `self_review`，不得冒充独立 Review。

### 9.2 需要独立 Review 的事项

以下候选情形要求由未创建目标记录的 reviewer 复核：

- 高影响 Claim 的 `corroborated`；
- `entailment: direct` 且承担必要支持角色的关键 Relation；
- disputed/retracted 状态的裁决；
- 高风险或难以逆转 Decision；
- 来源独立性存在争议；
- shadow-mode 退出、Standard 默认启用或公开发布验收；
- 人工标注 eval 的最终接受。

“独立”必须按明确威胁模型定义，可涉及不同上下文、不同操作者、不同权限或盲审；不能仅凭 profile 名称推断真正独立。

### 9.3 不作优越性断言

本规范不认定独立 profile、same-profile fresh context、不同 agent 或人工 reviewer 中任何一种安排已经被证明普遍更优。采用何种安排必须依据本地架构事实、权限与记忆边界、威胁模型、预先定义的指标和比较 eval。未知时应记录 Open Question，而不是升级为强制政策。

## 10. Validation 与 Eval

### 10.1 正例 fixtures

候选正例至少覆盖：

1. 单个精确摘录直接支持一个 `source_assertion`；
2. 两个真正独立的来源使 Claim 从 `supported` 进入 `corroborated`；
3. 一条反驳 Relation 令 Claim 进入 `disputed`；
4. Claim 状态变化使下游 Review、Inference、Decision 失效；
5. Package 在另一机器、另一输出根下使用相对路径验证成功；
6. journal 重放得到与 ledger 等价的最终状态；
7. 相同 ledger 确定性生成相同 final report；
8. Quick 输出满足最低可审计标准但不伪装成 Standard Package。

### 10.2 负例 fixtures 与显式失败

Validator/eval 必须拒绝或明确降级：

- **错 locator**：Evidence 声称来自某页/段，但该位置不存在或内容不符；
- **不蕴含**：摘录只谈一般原则，却将 Relation 标为对具体实现结论的 `direct` 支持；
- **伪独立佐证**：转载、翻译和搜索摘要共享同一上游，却被计为三个独立来源；
- **推断伪装事实**：含假设的结论被存为 `observed_fact`；
- **超范围建议**：Decision 超出已确认 contract 的 object/in-scope；
- **非法类型边**：Source 直接 `supports` Decision，或 Evidence 直接 `proves` Decision；
- **断链引用**：Relation 指向不存在的 ID；
- **孤儿记录**：进入报告的 Claim 无可追溯支持或无显式推断标签；
- **循环依赖**：Inference A 与 B 相互支持形成闭环；
- **stale review**：上游内容改变后仍保留旧 Review 为有效；
- **撤回污染**：retracted Claim 的下游 Decision 仍为 current；
- **hash 不匹配**：artifact 内容与 manifest 不一致；
- **绝对路径**：portable artifact 中出现私有绝对输出根；
- **secret 泄漏**：Package 含凭据或 secret；
- **不完整误报完成**：缺文件或写入中断却标记为 `complete_validated`；
- **Quick 越权**：缺少必要审计记录的 Quick 结果被自动用于高风险 Decision。

每个失败 fixture 必须声明预期错误代码、失败层级和不得继续的下游状态。只有“能解析”不算通过；语义 validator 必须覆盖 entailment、scope、独立性和状态传播。

## 11. Adapter 契约

### 11.1 Core 与 adapter 的边界

Core 定义实体、关系、状态机、schema、journal 事件、Package、验证和 capability contract。Adapter 实现宿主能力并声明可用性，不得改变 core 语义。

| 能力 | Adapter 责任 | Core 约束 |
|---|---|---|
| Search | 查询构造后的执行、后端路由、抓取、浏览器 | Core 只接收规范化 Source/Evidence；不命名后端 |
| Credentials | 读取、隔离、轮换、READY 探测 | secret 不得进入 ledger、manifest 或 report |
| Storage | 输出根、原子写入、恢复、锁与并发 | Package 内仅相对路径；完成状态 fail closed |
| Trace | runtime 调用日志、性能与故障诊断 | trace 非权威；只能用 ID 与 Package 互链 |
| UI / Confirmation | 展示 contract、获取明确确认、纠偏 | Core 保存确认状态与证据，不规定聊天界面 |
| Kanban | 卡片、状态、评论、自动化 | 完全在 core 外；Package 不依赖 Kanban 存在 |
| Publication | 渲染、上传、权限、撤回 | 发布物必须可追溯到已验证 Package |

### 11.2 Capability 声明

Adapter 应在运行前声明其支持的能力、失败模式和降级状态。Core 不得因 adapter 缺少某项可选能力而偷偷改变语义。例如缺少 snapshot 能力时，应保持 snapshot 关闭；缺少独立审查能力时，高风险 Decision 应停留在 `review_required`。

## 12. 从 Research Pro v3.15.1-mf 迁移

以下迁移规则为 `DRAFT proposal`：

1. **保持 v3 行为不变**：Search Contract、READY/local-first、trace 和最终报告流程先不改。
2. **新增旁路候选产物**：以 opt-in shadow mode 同时生成 v4 Package；v3 仍是用户可见行为的当前权威。
3. **分离 trace 与知识资产**：v3 runtime trace 继续用于调试；v4 Package 作为候选耐久资产，两者只通过 ID 互链。
4. **回放已有样本**：将已完成研究映射到候选 ledger，比较 v3 报告与 v4 投影的语义差异。
5. **记录不可映射项**：缺 locator、缺独立性信息、混合事实与推断等情况必须形成迁移报告，不得补造证据。
6. **shadow 失败不污染 v3**：候选 Package 生成失败时，v3 研究流程不得被宣称已迁移；失败应可诊断且不覆盖原结果。
7. **退出 shadow 的前提**：P0 全部通过，并完成预先定义的 v3/v4 回归与人工审查。
8. **Standard 默认切换**：只能在 shadow mode 证明可用、P1 所需回归达标并得到明确批准后考虑。
9. **Quick 保持轻量**：不得因 v4 引入而强制 Quick 生成完整 Package。
10. **最后拆 adapter**：只有 core 语义稳定后，才候选地拆分特定搜索、trace、存储和发布逻辑。

迁移不得把旧报告中未区分的推断自动升级为 factual Claim，也不得把多个 URL 自动视为独立佐证。

## 13. 接受门槛与未决决策

### 13.1 P0：任何 v4 实际使用前

- Relation 为一等记录，方向、polarity、support role、entailment、scope、理由和 Review 可验证；
- versioned schema、唯一 canonical ledger、稳定且不可复用的 ID 规则完成；
- Claim 生命周期和下游失效传播可机器检查；
- 断链、孤儿、非法类型边、循环依赖和非法状态转换被拒绝；
- derived-source 与 independence-group 规则阻止伪独立佐证；
- Claim、Inference、Decision 与 Decision Context 的类型门禁完成；
- Package 支持相对路径、manifest/hash、原子完成状态和中断恢复；
- Quick/Standard/Deep 契约明确，最低可审计标准可验证；
- 正例与本文件列出的关键负例 fixtures 全部达到预期；
- 隐私、版权、secret、snapshot 和保留策略具有安全默认值。

### 13.2 P1：公开发布或 Standard 默认前

- v3 Search Contract、trace 与最终报告兼容回归通过；
- shadow-mode 回放达到预先定义的语义一致性门槛；
- 跨 runtime、跨机器、不同输出根的 portability 测试通过；
- journal 可重放，final report 可确定性生成；
- stale Review 与 disputed/retracted 污染传播通过；
- relation/entailment 人工标注集和盲审达到预先定义指标；
- adapter contract tests 覆盖 search、storage、trace、confirmation 与 publication 边界；
- 已取得明确的采用或发布批准。

### 13.3 P2：后续增强

- 内容寻址、source fingerprint 与更高精度去重；
- Claim 图可视化；
- 多 reviewer 签名与经过评估的 QA workflow；
- 增量合并、跨 Package 引用和冲突规则；
- 自动矛盾发现；
- 知识库、浏览器和发布集成，且不破坏 core 边界。

### 13.4 显式未决决策

以下事项保持 `UNRESOLVED / DRAFT`：

1. Standard 的最小记录量和维护成本门槛；
2. `corroborated` 所需独立来源数量是否应按风险分级；
3. 哪些内容变化只触发 `review_required`，哪些必须级联 `invalidated`；
4. Review 独立性的可机器检查定义；
5. same-profile fresh context、独立 profile、不同 agent 与人工盲审的比较效果；
6. ID 生成算法及是否在 P2 引入内容寻址；
7. journal 是否必须能够完全重建 ledger，还是只需审计关键事件；
8. Package 签名、manifest 自身完整性和可信时间策略；
9. snapshot 的许可分类、默认保留期和删除语义；
10. Quick 何时必须升级为 Standard/Deep；
11. 跨 Package 引用、合并与撤回传播规则；
12. v3 报告与 v4 投影的“语义一致”验收指标；
13. 外部资料独立复核后的适用范围；
14. 不同文件系统、权限模型和 adapter 下的 portability 实测结果。

任何未决项都不得在实现或发布说明中表述为已决定。

## 14. `DRAFT` 实施排序

本节只命名候选 artifact 与验证结果，不授权或描述代码修改。

1. **语义冻结**  
   候选 artifact：`core-v4-vocabulary.md`、`relation-semantics.md`、`claim-lifecycle.md`。  
   验证结果：术语无冲突；结构边与认识论边可区分；状态转换和传播表可由 reviewer 一致解释。

2. **Schema 与 fixtures**  
   候选 artifact：`ledger.schema.*`、`manifest.schema.*`、`fixtures/positive/`、`fixtures/negative/`。  
   验证结果：所有正例通过；所有负例以预期错误代码失败；无断链、非法边和伪完成。

3. **Package 与确定性投影契约**  
   候选 artifact：最小 Standard Package 样例、manifest 完整性说明、report projection 规范。  
   验证结果：跨输出根验证成功；同一 ledger 生成等价报告；hash 篡改被拒绝。

4. **Adapter capability contract**  
   候选 artifact：adapter capability schema、search/storage/trace/confirmation/publication contract tests。  
   验证结果：缺失能力时 fail closed；无绝对路径、secret 或 runtime 特定依赖进入 core artifact。

5. **v3 shadow-mode 映射**  
   候选 artifact：v3-to-v4 mapping、迁移报告格式、回放样本集。  
   验证结果：v3 当前行为不变；不可映射事实被显式报告；shadow 失败不污染 v3 结果。

6. **Review 与验收报告**  
   候选 artifact：relation 标注集、stale-propagation 报告、portability 报告、P0/P1 gate checklist。  
   验证结果：预先定义的质量指标达到；所有未决项、例外和风险可见；在明确批准前保持 `DRAFT`。

完成以上排序并不自动代表 v4 获得采用。采用、公开发布和 Standard 默认启用必须分别获得明确决策。
