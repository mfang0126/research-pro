import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFollowupProvenance,
  bindFollowup,
  EVIDENCE_CAPABILITIES,
} from "../scripts/lib/source_integrity.mjs";

test("all declared evidence capabilities are explicit", () => {
  assert.ok(EVIDENCE_CAPABILITIES.includes("discovery_only"));
  assert.ok(EVIDENCE_CAPABILITIES.includes("evidence_grade"));
});

test("a follow-up with both lineage identifiers is bound", () => {
  const result = validateFollowupProvenance({
    evidence_capability: "evidence_grade",
    parent_event_id: "evt-discovery",
    discovery_evidence_id: "E-001",
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "bound");
});

test("missing discovery lineage cannot remain evidence-grade", () => {
  for (const record of [
    { evidence_capability: "evidence_grade" },
    { evidence_capability: "evidence_grade", parent_event_id: null, discovery_evidence_id: null },
  ]) {
    const result = validateFollowupProvenance(record);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].failure_class, "unbound_followup");
  }
});

test("a bounded downgrade is explicit rather than silently promoted", () => {
  const result = bindFollowup(
    { evidence_capability: "evidence_grade" },
    { downgrade: true },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "downgraded");
  assert.equal(result.evidence_capability, "discovery_only");
});

test("official evidence requires a trusted authority identifier", () => {
  const missing = validateFollowupProvenance({ evidence_capability: "page_body" }, { official: true });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.failure_class === "unknown_authority"));
  const bound = validateFollowupProvenance({ evidence_capability: "page_body", authority_registry_id: "ghostty" }, { official: true });
  assert.equal(bound.ok, true);
});
