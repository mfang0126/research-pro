# Search orchestration

> 中文译本：如与英文原文 [search-orchestration.md](search-orchestration.md) 有出入，以原文为准。

状态：`3.21.0-mf` 的现行参考文档。分工：[search-actions-and-access.md](search-actions-and-access.md) 负责“意图→动作”的指引，本文件负责**能力目录**、**provider 链路**、**预算**与**收敛纪律**。原则：由语义分类决定路由，再由确定性规则（链路、去重、breaker 熔断、ledger 账本）落地执行。

下文的价格与可用性于 2026-09-21 依据各 provider 的定价页面、账户账单与实测探针核实。出现配额事件或 provider 变更后需重新核实。

## 能力目录

research-pro 可触达的全部检索能力。“族”（Family）＝用于归并故障域/成本域的 pipeline 身份标识。

| # | 能力 | 族 | 机制 | 返回内容 | 单价 | 延迟 | 证据角色 | 状态 / 限制 |
|---|---|---|---|---|---|---|---|---|
| 1 | `quick` | TAVILY | Tavily 基础搜索（`tvly` CLI） | 干净的网页结果 + 摘要片段 | $0.008/次搜索 | ~1 s | 发现 | 配额与 #2/#3/#4 共用 |
| 2 | `official` | TAVILY | 带 `{q} official documentation` 偏向的 Tavily | 偏向官方文档的网页结果 | $0.008 | ~1 s | 发现（官方） | 与 #1 同一 pipeline——不构成独立来源 |
| 3 | `community` | TAVILY | 带 `{q} site:reddit.com` 偏向的 Tavily | 偏向 Reddit 的结果 | $0.008 | ~1 s | 发现（社区） | 仅用于发现——阅读需用 #10/#9 |
| 4 | `deep` | TAVILY | Tavily Research（mini/pro） | 多来源综合报告 | $0.12–$2.00 | ~42 s | 综合（次级） | 成本断崖；每个子问题 ≤1 次（Deep 模式）；绝不作为原始证据 |
| 5 | `realtime` | XAI | Grok 网页搜索 | 当前网页/新闻结果 | 计入 xAI 用量 | ~2–6 s | 发现（时新） | 独立 pipeline |
| 6 | `social` | XAI | Grok `x_search` | X/Twitter 帖子与话题串 | 计入 xAI 用量 | ~2–6 s | 一手社交内容 | 唯一可用的 X 路由；返回 0 条属正常情况 |
| 7 | `video` | YOUTUBE | YouTube Data API 搜索 | 视频列表 + 元数据 | 消耗 key 配额 | ~1–2 s | 媒体发现 | 文字稿是单独的阅读步骤（见 #16） |
| 8 | `serp` | GOOGLE-RAW | DataForSEO Google organic live/advanced | 引擎原始结果 | $0.002 live / $0.0012 priority / $0.0006 standard | 1–17 s | 发现（最贴近原始结果） | `site:` 生效；**`time_range` 会被接受但不起作用**（2026-09-21 实测：past_week / past_hour 的结果集与不加过滤完全一致）——不要依赖它获取最新结果；CJK 通过 `language_code` 支持；其他引擎（baidu/naver/seznam）需要新增端点——不在本文件范围内；`--limit <10` 无效（最小深度为 10） |
| 9 | `scrape` | SCRAPE | Firecrawl → firecrawl-waitfor → kimi-webbridge | 页面正文（markdown） | 1 信用点/页（免费额度 1k/月；付费 $0.0032–0.005） | 3–30 s | 阅读（可引用） | Reddit 被 CF 拦截 → 改用 #10 |
| 10 | `reddit-cli` | SCRAPE | research-pro 内置 Reddit 阅读器 | Reddit 帖串内容 | 免费 | 1–2 s | 阅读（Reddit） | 绕过 CF 拦截 |
| 11 | 宿主机 `web_search` | HOST | Hermes 宿主机工具 | 网页结果 | 消耗宿主机后端 key | ~1 s | 发现 | 借用宿主机的后端（本机为 Tavily——与 #1 共享故障域） |
| 12 | 宿主机 `web_extract` | HOST | Hermes 宿主机工具 | 页面文本 | 消耗宿主机后端 key | 不稳定 | 阅读 | 注意事项同 #11 |
| 13 | `curl` | LOCAL | 直接 HTTP 抓取 | 原始页面/HTML | 免费 | 毫秒–秒 | 阅读（静态页） | 不受 provider 配额影响 |
| 14 | `xhs` | XHS | MediaCrawler | 小红书帖子 | 免费/本地 | ~ s | 社交（CJK） | 可选；需本地安装 |
| 15 | Tavily Extract | TAVILY | `run-with-creds.mjs tvly extract <url>` | 通过 Tavily 获取页面文本 | $0.008/5 个 URL | ~2–5 s | 阅读 | 与 Tavily 配额池共用 |
| 16 | 视频转写文字稿 | LOCAL | yt-dlp / API transcript | 视频语音文本 | 免费/本地 | ~5–30 s | 阅读（视频） | #7 对应的阅读步骤 |
| 17 | 检索缓存 | LOCAL | `retrieval_cache.py` / search cache | 既有结果（零成本） | $0 | 即时 | 去重/召回 | 任何付费调用前先查这里 |

以下入口不属于本循环目录（在此明确说明）：MCP 端点（`scripts/mcp_server.py`）向外部 agent 暴露同样的能力；宿主机的 `x_search` 与浏览器工具虽然存在，但研究工作流的社交/浏览器路径经由 #6 与抓取链路。直接适配器 `grok_search.mjs`（＝ #5/#6）、`research.mjs`（＝ #4）、`reddit-cli.js`（＝ #10）不带来额外独立性。

## 能力之间的关系

### A. Pipeline 族 → 故障/成本域（不等于独立性证明）

- **TAVILY：**#1、#2、#3、#4、#15（宿主机 #11/#12 在借用 Tavily 时也计入）。属同一故障域——2026-09-21 已实证：一次配额上限就同时击穿了上述全部能力。
- **GOOGLE-RAW：**#8。**XAI：**#5、#6。**YOUTUBE：**#7。**SCRAPE/READING：**#9、#10、#13（彼此部分独立）。**LOCAL：**#13、#16、#17，以及 #9 中的 webbridge 一段。
- **收敛规则：**来源是否独立按 **lineage（来源谱系）** 判定（见 [evidence-and-claims.md](evidence-and-claims.md)）：同一份新闻稿、数据集、基准测试或原始帖文，即使经由两个族看到，也只算一个来源。族告诉你谁会跟谁一起故障、你在为谁付费；跨族检索是你*找到*独立谱系的途径，而不是已找到独立谱系的证明。

### B. 替代关系（同一需求——每种模式只选一个，绝不并行调用）

- 通用发现：**#1 ↔ #8**（research 模式：为省成本先用 #8；interactive 模式：为提速先用 #1）。
- 官方信息：#2 ↔ 带同一 `official documentation` 后缀的 #8 ↔ 直接抓取（#9/#13）。
- 社区信息：#3 ↔ #8 + `site:reddit.com`（随后用 #10 阅读）。
- 深度综合：#4 ↔ 多轮 #8 加阅读——只是近似，并非等价替代。
- 读取某个 URL：#9 ↔ #12 ↔ #13 ↔ #15 ↔ webbridge，按页面类型选择（JS 渲染/有登录墙 → webbridge；静态页 → curl）。

### C. 互补关系（不存在替代品）

#6 社交（仅 X）、#7 + #16 视频加文字稿、#17 缓存（去重层），以及“阅读”与“发现”这两个阶段本身。

### D. 阶段流转

`jev_plan` → 发现 slot → `jev_rank`（triage 分流） → 阅读 → 引用。视频多一次转写跳转（#7 → #16）；Reddit 多一次帖串阅读跳转（#3 → #10）。

### E. 回退边（链路的实现方式）

- Tavily 族 → DataForSEO（已在 smart-search 中实现：Tavily 族失败时，同一意图改在 `serp` 上重试，并保留 hint 的查询偏向；失败意图通过 `degrade_reason` / `fallback_used` 披露）。
- `deep`（tavily_research）**不会**自动降级——综合报告不能悄然变成发现结果；失败时 agent 按阶梯升级（多轮 serp + P5.5）。此行为已由回归测试覆盖。
- #9 链路：firecrawl → firecrawl-waitfor → kimi-webbridge。
- 阅读：宿主机 #12 不稳定 → 回退到 #13 / #9 / #15。
- 模式次序：research = 先 #8；interactive = 先 #1。两者都有效。

### F. 反模式（禁止）

- 把同族结果计为独立来源。
- 把经由两个族看到的同一上游产物计为独立来源（lineage 规则）。
- 针对同一目的、用两个 hint 并行发起调用（重复花费；缓存可能掩盖这一问题）。
- 把 #4 的综合报告当作原始证据；把摘要片段当作已读页面。
- 把标题与 URL 为空的行送进 triage 或报告（应先过滤）。

## 检索阶梯（P0–P6）

- **P0 规划：**可用时每个子问题调用一次 `jev_plan`（约 0.6 s，fail-open 失败即放行）。可建议的目标：`quick/official/deep/realtime/community/social/video`；`serp` 不是 Jev 的目标。
- **P1 发现：**默认 `serp`；仅当需要 2 秒内的交互式响应时才用 `quick`。只允许一个。
- **P2 定向 slot：**official / realtime / community / social / video——仅当低成本层无法回答时使用；通常 ≤3 个。
- **P3 阅读：**对可能被引用的候选读取正文；通常 ≤2 个；发现 ≠ 阅读。
- **P4 初筛：**`jev_rank` 排序/标记；过滤空行；评分不是证据。
- **P5 综合：**仅在确需综合时使用 `deep`，且须提高 ledger 上限；默认 0 次（Standard），≤1 次（Deep）。
- **P5.5 反证：**Deep 模式下、以及任何论断风险较大时，做一次反方/最强批评的检索。
- **P6 收敛：**每个子问题至少 2 条独立 lineage。

## 按缺口路由

| 缺口 | 首选动作 | 升级到 | 说明 |
|---|---|---|---|
| 通用事实/背景 | #8 `serp` | 速度重要时用 #1 `quick` | 优先选最便宜的 |
| 官方文档/规则/定价 | #2 `official`，或带后缀的 #8 | 直接抓取官方域名（#9/#13） | 读一手域名最有说服力 |
| 最新/当前状态 | #5 `realtime` | #8 并逐一核对摘要中的日期（`time_range` 不起作用） | 核实结果中的日期 |
| 从业者/社区经验 | #3 `community`，或 #8 + `site:reddit.com` | #10 `reddit-cli` | |
| 社交反应 | #6 `social` | — | 唯一路由 |
| 视频/演讲 | #7 `video` | #16 文字稿 | |
| 已知 URL 的正文 | #9 `scrape` | #12 / #13 / #15 | |
| 多来源综合 | 多轮 #8 + 阅读 2–3 个来源 | #4 `deep`（受上限约束）+ P5.5 | 成本断崖 |
| 搜索需求 / SEO 数据 | #8 `serp` | — | DataForSEO 原生能力 |
| CJK 语言查询 | #8 + `--lang`（如 `zh`） | — | Google 端点；其他引擎需另开任务 |

## 预算

预算是每个任务的 ledger（账本）边界，而非通用配额（见 [budget-and-stopping.md](budget-and-stopping.md)）。典型任务的起始默认值如下（如有偏离需说明）：

- **Standard：**约 ≤6 次检索调用（search/scrape/extract；`jev_plan`/`jev_rank` 单独计数，每次约 $0.0001）；在采用 DataForSEO 优先路由与免费额度抓取点数的情况下，每个子问题的付费支出 ≤ 约 $0.03。
- **Deep：**约 ≤12 次检索调用；≤1 次 Tavily-research 调用（其自身价格量级为 $0.12–$2.00——需相应提高 ledger 以涵盖它）；每个子问题中非 deep 的付费支出 ≤ $0.05。
- 典型构成：P1（1）+ P2（≤3）+ P3（≤2）≤ 6。

## 目前实测结果（2026-09-21）

| 检查项 | 结果 |
|---|---|
| DataForSEO `serp` live 调用计费 | $0.002/次（账户账单：4 次 = $0.008） |
| `site:` 操作符透传 | 10/10 条结果来自目标域名 |
| `time_range`（past_week、past_hour） | **不起作用**——3 次探针调用的结果集与不加过滤完全一致；无法用于获取最新结果 |
| 带 `language_code=zh` 的 CJK 查询 | 返回中文结果集 |
| Tavily 族故障处理 | `quick` 自动回退到 `serp`，带 `fallback_used: "dataforseo"` 与完整的降级元数据 |
| Jev plan/rank | 618–693 ms，`jev-1.13.0`，约 $0.0001/次 |

## 可观测性

`node scripts/orchestration_report.mjs [--runs 20] [--json]` —— 基于既有运行 trace 输出：各工具用量、degraded/error/fallback 计数、平均延迟、每次运行及总计的固定价格成本估算（只读，不联网）。plan 采纳率尚未计算——需要先扩展 `jev_trace` 以记录所推荐的 hint。
