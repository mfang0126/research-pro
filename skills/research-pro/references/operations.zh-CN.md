# Research Pro operations reference

> 中文译本：如与英文原文 [operations.md](operations.md) 有出入，以原文为准。

状态：适用于 `3.21.0-mf` 的现行文档。本文件记录的是现有脚本的情况；它既不新增研究状态机，也不改变脚本行为。当任务涉及外部检索、凭据、trace 或输出处理时，阅读本文件。

## 定位 skill

把已安装的 skill 目录作为 `BASE`。对于独立检出的情形，它是仓库中的 `skills/research-pro` 目录；对于直接检出的仓库，则可能是仓库根目录。

```bash
BASE="/path/to/research-pro"
```

不要用凭据目录充当 `BASE`，也不要把密钥放进 skill 目录。

## 在不暴露凭据的前提下检查就绪状态

脚本方案的最低要求是具备 `TAVILY_API_KEY`、`XAI_API_KEY` 或 `OPENROUTER_API_KEY` 三者之一。宿主原生的 `web_search` 或同等工具可以独立可用。doctor 只报告存在性与能力，绝不报告密钥值。

```bash
node "$BASE/scripts/doctor.mjs" --require-ready --json
```

退出码为 `0` 且 `ready: true` 表示脚本侧检索可运行。退出码为 `1` 表示脚本侧不可用；如果宿主有可用的原生搜索工具，就改用下文的宿主桥接，并记录脚本侧处于降级状态。如果两侧都不可用，就报告设置卡片并停止外部检索。绝不要用编造的结果替代缺失的证据。

如需将机器可读快照保存到 skill 目录之外：

```bash
DOCTOR_JSON="$(mktemp "${TMPDIR:-/tmp}/research-pro-doctor.XXXXXX")"
node "$BASE/scripts/doctor.mjs" --json > "$DOCTOR_JSON"
python3 - "$DOCTOR_JSON" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print({"ready": data.get("ready"), "tier": data.get("tier"), "capabilities": data.get("capabilities", {})})
PY
```

该 JSON 包含路径和能力标志，不包含机密值。若保留该文件，请保持其私密。

## 安全地启动 trace

`trace.mjs init` 会向 stdout 写入一个 JSON 对象，并向 stderr 写入诊断信息。请把 stdout 捕获到临时文件中，再解析该文件。不要把输出通过管道传给 `node -e`，也不要假定 stdin 能以字符串方式读取。

```bash
set -euo pipefail
QUESTION="the short research question"
TRACE_INIT_JSON="$(mktemp "${TMPDIR:-/tmp}/research-pro-init.XXXXXX")"
node "$BASE/scripts/trace.mjs" init \
  --question "$QUESTION" \
  --depth standard \
  --sub-q "Q1,Q2" > "$TRACE_INIT_JSON"  # Replace with the subquestions actually known; omit when none.

export RESEARCH_PRO_RUN_ID="$(python3 - "$TRACE_INIT_JSON" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
print(data.get("run_id") or "")
PY
)"

if [ "${RESEARCH_PRO_TRACE:-light}" = "off" ]; then
  unset RESEARCH_PRO_RUN_ID
elif [ -z "$RESEARCH_PRO_RUN_ID" ]; then
  echo "trace init did not return run_id; inspect $TRACE_INIT_JSON" >&2
  exit 1
fi
```

该临时 JSON 有意保持私密，以供检查。不再需要时，用 `trash "$TRACE_INIT_JSON"` 把它移入用户的废纸篓；不要将其内容打印到共享的对话记录中。

当 `RESEARCH_PRO_TRACE=off` 时，init 会返回 `skipped: true`，且不返回 run id。不要自行伪造一个。请遵守该配置：以实际工具响应作为证据，跳过 `record-search` 和 `finalize`，并披露持久化 trace 覆盖不可用。不要仅仅为了满足某个报告字段而重新启用 trace。默认 trace 模式是 `light`；仅当确有获取原始证据的必要、且存储边界合适时，才使用 `full` 或 `--force-raw`。

常用的 trace 环境变量：

| 变量 | 现有行为 |
|---|---|
| `RESEARCH_PRO_HOME` | trace/缓存根目录；默认 `~/.config/research-pro` |
| `RESEARCH_PRO_TRACE` | `off`、`light` 或 `full`；默认 `light` |
| `RESEARCH_PRO_RUN_ID` | 当前活动的 run id |
| `RESEARCH_PRO_TRACE_TOP_N` | light 条目中保留的 URL 数量；默认 `10` |
| `RESEARCH_PRO_TRACE_MAX_RAW_BYTES` | 原始证据大小上限；默认 `200000` |

## 带 trace 的搜索

使用 smart-search 时，让包装脚本保持搜索本身的 stdout/退出行为不变，由 smart-search 层记录旁路通道：

```bash
bash "$BASE/scripts/search_with_trace.sh" \
  --query "the query" \
  --hint quick \
  --sub-q Q1 \
  --round 1 > result.json
```

使用与当前检索需求相匹配的 hint。hint 不是证据等级。保留返回 JSON 中的 `degraded` 和错误字段。

对于已经保存到文件的结果，显式记录：

```bash
node "$BASE/scripts/trace.mjs" record-search \
  --run-id "$RESEARCH_PRO_RUN_ID" \
  --file /path/to/result.json \
  --hint official \
  --actual-tool the-tool-name \
  --requested-tool the-requested-tool \
  --source saved-result \
  --force-raw
```

只有在完整结果已写入文件之后，才使用 `record-search`。只记录一句“searched”之类的话，却既没有 URL、也没有结果条目或错误对象，那只是元数据，无法支撑任何主张。

## 宿主原生网络工具

启用 trace 时，直接调用宿主原生工具会绕过脚本的 trace/缓存边界。在 Hermes `execute_code` 环境中，应改为运行桥接脚本。当 trace 明确关闭时，直接使用原生响应，不必经过这个记录桥接，但要披露缺少持久化 trace：

```python
import os
import runpy
import sys
from pathlib import Path

BASE = Path(os.environ.get(
    "RESEARCH_PRO_SKILL_DIR",
    "~/.hermes/external-skills/research-pro",
)).expanduser()
bridge = BASE / "scripts" / "host_native_trace.py"
sys.argv = [str(bridge), "search", "--query", "QUERY", "--hint", "quick"]
runpy.run_path(str(bridge), run_name="__main__")
```

对于已知的一个或多个 URL：

```python
sys.argv = [
    str(bridge), "extract",
    "--urls", "https://example.com/page",
    "--hint", "scrape",
]
runpy.run_path(str(bridge), run_name="__main__")
```

桥接脚本会规范化 `data.web`/extract 的结果，在返回原生响应之前先写入原始记录，对错误进行脱敏，并在记录失败时返回结构化失败信息。它必须在 `hermes_tools` 可用的位置运行。如果宿主原生 `x_search` 的结果是通过其他已批准途径获得的，请先保存完整 JSON，再使用 `trace.mjs record-search`，并带上 `--actual-tool x_search --requested-tool host-native-x-search --force-raw`。

## 凭据与包装脚本

凭据解析遵循“仅补缺失”和白名单原则：

1. 已有的 `process.env` 优先，且永远不会被覆盖。
2. 依次是 `RESEARCH_PRO_ENV_FILE`，然后是 `$RESEARCH_PRO_HOME/.env`（默认 `~/.config/research-pro/.env`），再之后是默认的通用路径（若与前者不同）。
3. 当 `RESEARCH_PRO_TRUST_HOST_ENV` 不为 `0` 时，Hermes 和 OpenClaw 的宿主来源可以补全白名单中缺失的密钥。
4. 仅当 `RESEARCH_PRO_LOAD_CWD_ENV=1` 时，才会读取当前工作目录下的 `.env`。

从宿主文件中读取的只有 research-pro 的密钥名和有文档记录的别名。常用的控制项包括：

```bash
export RESEARCH_PRO_HOME="$HOME/.config/research-pro"
export RESEARCH_PRO_ENV_FILE="/private/path/research-pro.env"
export RESEARCH_PRO_TRUST_HOST_ENV=0
export RESEARCH_PRO_LOAD_CWD_ENV=1
```

不要打印这些文件或其内容。目录权限保持 `700`，env 文件权限保持 `600`。

第三方 CLI 只读取 `process.env`，自身不会加载已配置的 env 文件。请通过 shim 为它们注入环境变量：

```bash
node "$BASE/scripts/run-with-creds.mjs" tvly search "QUERY"
node "$BASE/scripts/run-with-creds.mjs" firecrawl scrape "https://example.com/page"
```

shim 只把凭据传给子进程环境，不会向 stdout/stderr 写入任何密钥。`grok_search.mjs` 和 `research.mjs` 在进程内解析密钥，可以直接调用。

## 收尾与检查

在交付预留时段内，保存答案并在总截止时间之前完成交付。如果 trace 已启用且初始化返回了 run id，还要在同一预留时段内完成 trace 收尾并检查其状态。如果 trace 已明确关闭，则跳过下面的命令，并将持久化 trace 覆盖报告为不可用。如果初始化意外失败，应报告该失败，而不是在缺少 id 的情况下执行收尾。仅当每一次外部检索都有有效的 trace 条目时，才传入 `--trace-coverage full`；否则使用 `partial` 或 `metadata-only` 并解释缺口。

```bash
node "$BASE/scripts/trace.mjs" finalize \
  --run-id "$RESEARCH_PRO_RUN_ID" \
  --summary "short result summary" \
  --confidence conditional \
  --status completed_with_gaps \
  --termination-reason access-or-trace-gap \
  --trace-coverage partial
```

只有在每一次外部检索都有可读取的有效 trace 条目、且所有被引用的产物都存在之后，才能同时使用 `--status completed` 和 `--trace-coverage full`。当 trace 或产物不完整时，运行时可能把请求的 `completed` 状态降级为 `completed_with_gaps`。应把该状态视为关于本次运行的证据，而不是宣称覆盖完整的理由。

运行目录位于 `$RESEARCH_PRO_HOME/runs/<run_id>/`，其中包含 `run.json`、`calls.jsonl`、可选的 `raw/<call_id>.json`，以及可选的、经过脱敏的 `report.md`。不要把原始内容带进聊天，避免把私有路径或形似凭据的赋值复制到报告中。`scripts/lib/output_guard.mjs` 为产出制品的代码提供安全值检查与脱敏辅助函数。
