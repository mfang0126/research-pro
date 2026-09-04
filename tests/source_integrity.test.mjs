/**
 * Research Pro Task 7 — source identity and content-kind tests.
 * Offline only; fixtures are sanitized and no network/provider/browser is used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyApiJson,
  classifyContent,
  contentSha256,
  githubRepoFromUrl,
  verifyEntryIdentity,
  verifyBatch,
  classifyFinalUrl,
  sanitizeFinalUrl,
  validateFollowupProvenance,
  bindFollowup,
  projectIdentityToCache,
  compareCacheIdentity,
  retainRawPayload,
  sanitizePublicOutput,
  validatePublicOutput,
  preserveEvidenceStatusLabels,
} from "../scripts/lib/source_integrity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(path.join(here, "fixtures", name), "utf8"));

test("clean batch is internally identity-verified and evidence eligible", () => {
  const payload = fixture("batch_identity_clean.json");
  const result = verifyBatch(payload);
  assert.equal(result.identity_status, "verified");
  assert.equal(result.evidence_eligible, true);
  assert.equal(result.identity_failures.length, 0);
  assert.equal(result.result_count, 5);
  assert.equal(result.verified_count, 5);
});

test("shifted batch fails closed with four per-entry identity mismatches", () => {
  const payload = fixture("batch_identity_mismatch.json");
  const before = payload.results.map((entry) => entry.url);
  const result = verifyBatch(payload);
  assert.equal(result.identity_status, "failed");
  assert.equal(result.evidence_eligible, false);
  assert.equal(result.identity_failures.length, 4);
  assert.deepEqual(result.identity_failures.map((entry) => entry.index), [1, 2, 3, 4]);
  // Verification must not repair by array position or mutate the untrusted input.
  assert.deepEqual(payload.results.map((entry) => entry.url), before);
  assert.deepEqual(result.results.map((entry) => entry.identity_status), ["verified", "failed", "failed", "failed", "failed"]);
});

test("explicit URL/full_name/html_url identity passes without positional inference", () => {
  const entry = {
    full_name: "octo/demo",
    html_url: "https://github.com/octo/demo",
    title: "octo/demo - GitHub",
  };
  const result = verifyEntryIdentity(entry, { requested_url: "https://github.com/octo/demo" });
  assert.equal(result.identity_status, "verified");
  assert.equal(result.evidence_eligible, true);
  assert.equal(githubRepoFromUrl("https://api.github.com/repos/octo/demo"), "octo/demo");
  assert.equal(githubRepoFromUrl("https://github.com/octo/demo/tree/main"), "octo/demo");
});

test("ambiguous and malformed result entries are unverified, not exceptions", () => {
  const noIdentity = verifyEntryIdentity({ title: "a page without a repository identity" });
  assert.equal(noIdentity.identity_status, "unverified");
  assert.equal(noIdentity.evidence_eligible, false);
  const malformed = verifyEntryIdentity({ url: 42, title: "octo/demo" });
  assert.equal(malformed.identity_status, "unverified");
  assert.equal(malformed.identity_failures[0].failure_class, "malformed_field");
  const missingResults = verifyBatch({ results: "not-an-array" });
  assert.equal(missingResults.identity_status, "unverified");
  assert.equal(missingResults.evidence_eligible, false);
});

test("API JSON is parsed before normalization and invalid transport is rejected", () => {
  const escaped = fixture("github_api_escaped_json.json");
  const wrapper = fixture("github_api_wrapper_prefixed.json");
  const escapedResult = classifyApiJson(escaped.raw);
  assert.equal(escapedResult.ok, false);
  assert.equal(escapedResult.content_kind, escaped.expected_content_kind);
  assert.equal(escapedResult.reason_class, escaped.expected_reason_class);
  const wrapperResult = classifyApiJson(wrapper.raw);
  assert.equal(wrapperResult.ok, false);
  assert.equal(wrapperResult.content_kind, wrapper.expected_content_kind);
  assert.equal(wrapperResult.reason_class, wrapper.expected_reason_class);

  const validRaw = JSON.stringify({ full_name: "octo/demo", html_url: "https://github.com/octo/demo" });
  const valid = classifyApiJson(validRaw);
  assert.equal(valid.ok, true);
  assert.equal(valid.content_kind, "api_json");
  assert.deepEqual(valid.parsed, JSON.parse(validRaw));
  assert.equal(valid.content_sha256, contentSha256(validRaw));
});

test("content kind and content hash are explicit and stable", () => {
  const raw = "plain body\n";
  const text = classifyContent(raw, "raw_text");
  assert.equal(text.ok, true);
  assert.equal(text.content_kind, "raw_text");
  assert.equal(text.content, raw);
  assert.equal(text.content_bytes, Buffer.byteLength(raw));
  assert.equal(text.content_sha256, contentSha256(raw));
  const html = classifyContent("<h1>demo</h1>", "html_markdown");
  assert.equal(html.content_kind, "html_markdown");
  const auto = classifyContent('{"ok":true}');
  assert.equal(auto.content_kind, "api_json");
});

test("final URL safety rejects unsafe, private, credentialed, and sensitive URLs", () => {
  assert.equal(classifyFinalUrl("https://example.com/docs").final_url_status, "ok");
  assert.equal(classifyFinalUrl("javascript:alert(1)").final_url_status, "rejected");
  assert.equal(classifyFinalUrl("https://user:pw@example.com/docs").status, "credential_present");
  assert.equal(classifyFinalUrl("http://127.0.0.1:8080/").status, "loopback");
  assert.equal(classifyFinalUrl("http://192.168.1.2/").status, "private");
  const sensitive = classifyFinalUrl("https://example.com/?q=ok&api_key=redacted");
  assert.equal(sensitive.final_url_status, "rejected");
  assert.ok(!sanitizeFinalUrl("https://example.com/?q=ok&api_key=redacted").includes("redacted"));
  assert.equal(classifyFinalUrl("not a URL").status, "malformed");
});

test("follow-up provenance requires lineage for evidence-grade claims", () => {
  assert.equal(validateFollowupProvenance({ evidence_capability: "discovery_only" }).ok, true);
  const rejected = validateFollowupProvenance({ evidence_capability: "evidence_grade" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.errors[0].failure_class, "unbound_followup");
  const downgraded = validateFollowupProvenance({ evidence_capability: "evidence_grade" }, { downgrade: true });
  assert.equal(downgraded.status, "downgraded");
  assert.equal(downgraded.evidence_capability, "discovery_only");
  const bound = bindFollowup({ evidence_capability: "evidence_grade" }, { parent_event_id: "evt-parent", discovery_evidence_id: "E-discovery" });
  assert.equal(bound.ok, true);
  assert.equal(bound.record.parent_event_id, "evt-parent");
  assert.equal(bound.record.discovery_evidence_id, "E-discovery");
});

test("cache projection preserves source identity and capability fields", () => {
  const source = {
    identity_status: "verified",
    identity_failures: [],
    content_kind: "api_json",
    content_sha256: "a".repeat(64),
    requested_url: "https://github.com/octo/demo",
    returned_url: "https://github.com/octo/demo",
    evidence_capability: "discovery_only",
    final_url_status: "ok",
  };
  const projected = projectIdentityToCache({ payload: source });
  assert.deepEqual(projected, source);
  assert.equal(compareCacheIdentity(projected, source).ok, true);
  assert.equal(compareCacheIdentity({ payload: { identity_status: "verified" } }, source).ok, false);
});

test("truncated raw payload is a valid JSON envelope, never comment-appended JSON", () => {
  const retained = retainRawPayload("x".repeat(1000), { maxBytes: 180 });
  assert.equal(retained.ok, true);
  assert.equal(retained.truncated, true);
  const envelope = JSON.parse(retained.content);
  assert.equal(envelope.truncated, true);
  assert.equal(envelope.original_bytes, 1000);
  assert.ok(Number.isInteger(envelope.stored_bytes));
  assert.ok(!retained.content.includes("//"));
});

test("public output redacts secrets/paths and preserves explicit evidence labels", () => {
  const safe = sanitizePublicOutput({
    note: "api_key=abc123 from /Users/alice/private.txt",
    stack_trace: "internal detail",
    historically_reproduced: true,
    unit_tested: true,
  });
  assert.ok(!JSON.stringify(safe).includes("abc123"));
  assert.ok(!JSON.stringify(safe).includes("/Users/alice"));
  assert.equal(safe.stack_trace, undefined);
  assert.equal(validatePublicOutput(safe).ok, true);
  assert.deepEqual(preserveEvidenceStatusLabels({ historically_reproduced: 1, unit_tested: false, ignored: true }), { historically_reproduced: true, unit_tested: false });
});
