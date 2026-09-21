/**
 * jev_trace.mjs — optional trace side-channel for jev_plan / jev_rank.
 *
 * Appends one call record to the active research-pro run when a run id is
 * set (RESEARCH_PRO_RUN_ID or the current-run pointer). Never fails the
 * caller: a trace problem returns {ok:false,...} and is reported on stderr
 * by the CLI, not thrown.
 */
import { appendCall } from "./trace.mjs";

/**
 * @param {{kind: string, request?: string, out?: any, input?: any, status?: string, error?: string|null}} args
 */
export function appendJevCall({ kind, request, out = null, input = null, status = "ok", error = null }) {
  const runId = process.env.RESEARCH_PRO_RUN_ID || null;
  if (!runId) return { ok: true, skipped: true, reason: "no_run_id" };
  try {
    return appendCall({
      run_id: runId,
      query: request || "",
      hint: kind,
      tool: kind,
      requested_tool: kind,
      provider: out?.provider || "typesafe",
      model: out?.model || null,
      usage: out?.usage || null,
      elapsed_ms: typeof out?.latencyMs === "number" ? out.latencyMs : null,
      sub_q: input?.sub_q || null,
      status,
      error: error || null,
      source: "jev-judge",
    });
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
