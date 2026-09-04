/**
 * Research Pro Task 4 — contract/schema foundation tests (offline, no deps).
 *
 * Covers:
 *   - required contract fields (decision/object/in_scope/out_of_scope/answer_shape)
 *   - empty sub_questions / duplicate ids (I-005)
 *   - unknown schema version + stable error codes
 *   - deterministic canonical hash + scope key (I-005/I-021)
 *   - no-dependency restricted YAML subset round-trip (I-036):
 *     arbitrary JSON/text is NOT accepted as YAML
 *   - URL / output safety primitives (I-034)
 *   - allowed contract state / metadata types + legal transitions (I-009/I-029)
 *   - typed source/evidence/relation/claim/event records (I-023/I-030/I-031/I-032/I-033)
 *   - authority registry (I-032)
 *   - root↔nested byte-identical sync check (I-015/I-021)
 *
 * Pure Node stdlib (node:test, node:assert). No network, no installs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import {
  CONTRACT_SCHEMA_VERSION,
  SUPPORTED_STATES,
  STATE_TRANSITIONS,
  ERROR_CODES,
  validateContract,
  canonicalizeContract,
  canonicalContractJson,
  contractHash,
  scopeKey,
  scopeKeyComponents,
  writeContractYaml,
  parseContractYaml,
  serializeYaml,
  parseYaml,
  yamlRoundTrip,
  validateStateTransition,
  validateSourceRecord,
  validateEvidenceRecord,
  validateRelationRecord,
  validateClaimRecord,
  validateEventRecord,
  validateAuthorityRegistry,
  relationPermitsSupport,
  TRUSTED_AUTHORITIES,
} from "../scripts/lib/contract.mjs";

import {
  canonicalizeUrl,
  classifyUrl,
  redactUrl,
  finalUrlStatus,
} from "../scripts/lib/url_policy.mjs";

import {
  assertSafeOutputValue,
  redactText,
  containsPrivatePath,
} from "../scripts/lib/output_guard.mjs";

import {
  sha256Hex,
  manifestEntry,
  entryFromBytes,
  packageId,
  syncDriftReport,
} from "../scripts/lib/archive.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const NESTED = path.join(ROOT, "skills", "research-pro");

// Files that the lane synchronizes byte-identically into the nested package.
const SYNCED_REL_PATHS = [
  "schemas/search-contract.schema.json",
  "schemas/search-event.schema.json",
  "schemas/source-receipt.schema.json",
  "schemas/source.schema.json",
  "schemas/evidence.schema.json",
  "schemas/relation.schema.json",
  "schemas/authority-registry.schema.json",
  "schemas/trusted-authorities.json",
  "schemas/claim.schema.json",
  "scripts/lib/contract.mjs",
  "scripts/lib/archive.mjs",
  "scripts/lib/url_policy.mjs",
  "scripts/lib/output_guard.mjs",
];

/** Minimal but complete contract based on plan §2.2. */
function validContract(overrides = {}) {
  return {
    schema_version: "1.0",
    question: "Which public Ghostty configurations are most worth using, and why?",
    decision: "rank_public_configs_for_daily_use",
    object: "public Ghostty terminal configuration repositories and embedded configs",
    in_scope: [
      "GitHub repositories and raw configuration files",
      "official Ghostty configuration reference",
      "public community usage/discussion signals",
    ],
    out_of_scope: ["global installation counts", "private analytics", "unverified claims of universal preference"],
    answer_shape:
      "three separate tables: public popularity, public adoption signals, practical usefulness; plus evidence, limitations",
    anchor_evidence: ["user_phrase:最流行 用的最多"],
    sub_questions: [
      { id: "Q1", question: "Which candidates have the strongest public-interest signals?", acceptance: "Each candidate has dated repository metadata and a source URL." },
      { id: "Q2", question: "Which candidates contain a real Ghostty configuration?", acceptance: "Each recommended candidate has a verified config path/content receipt." },
    ],
    source_policy: { primary: ["ghostty.org", "github.com"], secondary: ["reddit.com"], bridge: "optional_kimi_webbridge" },
    budget: { max_backend_calls: 80, max_candidate_fetches: 20, max_retries_per_source: 1, max_bridge_fetches: 10, basis: "provisional" },
    freshness: { as_of: "2026-09-03", class: "historical_snapshot" },
    state: "DRAFT",
    confirmation: { mode: "interactive", status: "pending", display_hash: null, confirmed_at: null, confirmed_by: null },
    query_strategy: {
      seeds_per_sub_question: 2,
      zero_result_relaxations: 1,
      primary_intention: "decision-research",
      secondary_intentions: [],
      stop_rules: ["all_required_sub_questions_supported", "budget_exhausted"],
    },
    deep_requirements: { minimum_independent_sources_per_sub_question: 2, adversarial_round_required: true },
    ...overrides,
  };
}

function codesOf(result) {
  return result.errors.map((e) => `${e.code}@${e.path}`);
}

test("contract foundation: ERROR_CODES is a stable string-keyed enum", () => {
  assert.equal(typeof ERROR_CODES, "object");
  const values = Object.values(ERROR_CODES);
  assert.ok(values.length >= 15, "expected a meaningful stable error-code set");
  for (const v of values) {
    assert.equal(typeof v, "string");
    assert.match(v, /^[A-Z][A-Z0-9_]+$/);
  }
  // These are the codes the upstream audit/plan depend on.
  for (const need of ["UNSUPPORTED_VERSION", "MISSING_FIELD", "EMPTY_FIELD", "INVALID_STATE", "INVALID_TRANSITION", "EMPTY_SUB_QUESTIONS"]) {
    assert.ok(need in ERROR_CODES, `missing stable error code ${need}`);
  }
});

test("validateContract accepts a complete research contract", () => {
  const r = validateContract(validContract());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.errors, []);
});

test("validateContract rejects missing required boundary fields with stable codes (I-005)", () => {
  for (const field of ["decision", "object", "in_scope", "out_of_scope", "answer_shape", "question"]) {
    const c = validContract();
    delete c[field];
    const r = validateContract(c);
    assert.equal(r.ok, false, `${field} must be required`);
    assert.ok(
      codesOf(r).some((c2) => c2 === `${ERROR_CODES.MISSING_FIELD}@${field}`),
      `expected MISSING_FIELD@${field}, got ${JSON.stringify(codesOf(r))}`
    );
  }
});

test("validateContract rejects empty boundary fields (decision/answer_shape/in_scope)", () => {
  const emptyCases = [
    ["decision", ""],
    ["answer_shape", "   "],
    ["in_scope", []],
    ["out_of_scope", []],
    ["object", ""],
    ["question", ""],
  ];
  for (const [field, value] of emptyCases) {
    const r = validateContract(validContract({ [field]: value }));
    assert.equal(r.ok, false, `${field} must not be empty`);
    assert.ok(
      codesOf(r).some((c) => c === `${ERROR_CODES.EMPTY_FIELD}@${field}`),
      `expected EMPTY_FIELD@${field}, got ${JSON.stringify(codesOf(r))}`
    );
  }
});

test("validateContract rejects unknown schema version and missing version (stable code)", () => {
  const v2 = validateContract(validContract({ schema_version: "2.0" }));
  assert.equal(v2.ok, false);
  assert.ok(codesOf(v2).some((c) => c === `${ERROR_CODES.UNSUPPORTED_VERSION}@schema_version`));

  const missing = validContract();
  delete missing.schema_version;
  const rm = validateContract(missing);
  assert.equal(rm.ok, false);
  assert.ok(codesOf(rm).some((c) => c === `MISSING_FIELD@schema_version`));
});

test("validateContract rejects non-object input and unknown top-level fields", () => {
  assert.equal(validateContract(null).ok, false);
  assert.equal(validateContract("not a contract").ok, false);
  assert.ok(codesOf(validateContract(42)).some((c) => c.startsWith(ERROR_CODES.CONTRACT_NOT_OBJECT)));
  const bad = validContract({ bogus_field: 123 });
  const r = validateContract(bad);
  assert.equal(r.ok, false);
  assert.ok(codesOf(r).some((c) => c === `UNKNOWN_TOP_LEVEL_FIELD@bogus_field`));
});

test("validateContract rejects empty / duplicate / malformed sub_questions (I-005)", () => {
  const empty = validateContract(validContract({ sub_questions: [] }));
  assert.equal(empty.ok, false);
  assert.ok(codesOf(empty).some((c) => c === `EMPTY_SUB_QUESTIONS@sub_questions`));

  const dup = validateContract(
    validContract({
      sub_questions: [
        { id: "Q1", question: "a", acceptance: "b" },
        { id: "Q1", question: "c", acceptance: "d" },
      ],
    })
  );
  assert.equal(dup.ok, false);
  assert.ok(codesOf(dup).some((c) => c === `DUPLICATE_SUB_QUESTION_ID@sub_questions`));

  const malformed = validateContract(
    validContract({ sub_questions: [{ id: "Q1", question: "no acceptance field here" }] })
  );
  assert.equal(malformed.ok, false);
  assert.ok(codesOf(malformed).some((c) => c === `INVALID_SUB_QUESTION@sub_questions`));
});

test("validateContract enforces allowed state and confirmation metadata types (I-029/I-009)", () => {
  assert.equal(validateContract(validContract({ state: "SEARCHING" })).ok, true);
  assert.equal(validateContract(validContract({ state: "CONTRACT_ACCEPTED" })).ok, true);
  const badState = validateContract(validContract({ state: "PARTY_TIME" }));
  assert.equal(badState.ok, false);
  assert.ok(codesOf(badState).some((c) => c === `INVALID_STATE@state`));

  const badStatus = validateContract(validContract({ confirmation: { ...validContract().confirmation, status: "confirmed" } }));
  assert.equal(badStatus.ok, false);
  assert.ok(codesOf(badStatus).some((c) => c === `INVALID_CONFIRMATION_STATUS@confirmation.status`));

  const badHash = validateContract(validContract({ confirmation: { ...validContract().confirmation, status: "accepted", display_hash: "not-a-sha" } }));
  assert.equal(badHash.ok, false);
  assert.ok(codesOf(badHash).some((c) => c === `INVALID_DISPLAY_HASH@confirmation.display_hash`));
});

test("validateStateTransition implements DRAFT→CONTRACT_ACCEPTED→SEARCHING (I-029)", () => {
  const allowed = [
    ["DRAFT", "CONTRACT_ACCEPTED"],
    ["CONTRACT_ACCEPTED", "SEARCHING"],
    ["SEARCHING", "SEARCHING"],
    ["SEARCHING", "DONE"],
  ];
  const forbidden = [
    ["DRAFT", "SEARCHING"],
    ["CONTRACT_ACCEPTED", "DRAFT"],
    ["CONTRACT_ACCEPTED", "DONE"],
    ["DONE", "DRAFT"],
    ["DONE", "SEARCHING"],
  ];
  for (const [from, to] of allowed) {
    assert.equal(validateStateTransition(from, to).ok, true, `${from}->${to} should be legal`);
  }
  for (const [from, to] of forbidden) {
    const r = validateStateTransition(from, to);
    assert.equal(r.ok, false, `${from}->${to} must be illegal`);
    assert.ok(codesOf(r).some((c) => c === `INVALID_TRANSITION@${from}->${to}`), JSON.stringify(r.errors));
  }
  const unknown = validateStateTransition("DRAFT", "NOPE");
  assert.equal(unknown.ok, false);
  assert.ok(codesOf(unknown).some((c) => c === `INVALID_STATE@${"NOPE"}`));
  assert.ok(SUPPORTED_STATES.includes("DRAFT"));
  assert.equal(STATE_TRANSITIONS.DRAFT[0], "CONTRACT_ACCEPTED");
});

test("contractHash is deterministic SHA-256 of canonical UTF-8 JSON (I-021)", () => {
  const c = validContract();
  const h1 = contractHash(c);
  const h2 = contractHash(structuredClone(c));
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);

  // manual cross-check against node:crypto
  const manual = crypto.createHash("sha256").update(canonicalContractJson(c), "utf8").digest("hex");
  assert.equal(h1, manual);
});

test("canonicalContractJson sorts object keys with no insignificant whitespace", () => {
  const json = canonicalContractJson(validContract());
  const parsed = JSON.parse(json);
  const keys = Object.keys(parsed);
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(!json.includes("\n"));
  assert.ok(!json.includes(": "), "no spaces after colons: " + json.slice(0, 80));
});

test("contractHash changes when the object changes but not by key order", () => {
  const c = validContract();
  const changed = validContract({ object: "public Ghostty configuration repos only" });
  assert.notEqual(contractHash(c), contractHash(changed));

  const reordered = { ...c };
  const keys = Object.keys(reordered);
  reordered[keys[0]] = reordered[keys[0]];
  // verify order-insensitivity: manually re-insert in different order
  const shuffled = {};
  for (const k of [...keys].reverse()) shuffled[k] = c[k];
  assert.equal(contractHash(c), contractHash(shuffled));
});

test("scopeKey is non-empty, deterministic, and bound to decision/object/scope/as_of (I-005)", () => {
  const c = validContract();
  const sk = scopeKey(c);
  assert.match(sk, /^[0-9a-f]{64}$/);
  assert.equal(sk, scopeKey(structuredClone(c)));

  const parts = scopeKeyComponents(c);
  assert.equal(parts.decision, c.decision);
  assert.equal(parts.object, c.object);
  assert.deepEqual(parts.in_scope, [...c.in_scope].sort());
  assert.equal(parts.as_of, c.freshness.as_of);

  assert.notEqual(scopeKey(validContract({ out_of_scope: ["something else"] })), sk);
  assert.notEqual(scopeKey(validContract({ decision: "compare_two_things" })), sk);
  assert.notEqual(scopeKey(validContract({ object: "different object" })), sk);
  assert.notEqual(scopeKey(validContract({ freshness: { as_of: "2026-09-04", class: "historical_snapshot" } })), sk);

  // a research contract must never produce an empty scope key
  assert.notEqual(sk, "");
});

test("canonicalization preserves literal user identifiers and source tokens (I-011/I-029)", () => {
  const c = validContract();
  const literal = "user_phrase:最流行 用的最多";
  const canon = canonicalizeContract(c);
  assert.deepEqual(canon.anchor_evidence, [literal]);
  assert.match(canon.anchor_evidence[0], /最流行 用的最多/);

  // hash must survive YAML round-trip: persisted contract.yaml parses back to the same canonical hash
  const yamlText = writeContractYaml(c);
  const parsedBack = parseContractYaml(yamlText);
  assert.equal(contractHash(parsedBack), contractHash(c));
});

test("writeContractYaml + parseContractYaml round-trips a contract exactly", () => {
  const c = validContract();
  const parsed = parseContractYaml(writeContractYaml(c));
  assert.deepEqual(parsed, c);
  const valid = validateContract(parsed);
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
});

test("restricted YAML: subset round-trip for scalar/edge values (I-036)", () => {
  const values = [
    { s: "plain", i: 7, f: 1.5, b: true, n: null },
    { s: "1.0", s2: "034", s3: "true", arr: [], m: {} },
    { unicode: "最流行 用的最多", url: "https://example.com/a?b=1", quoted: 'say "hi"' },
  ];
  for (const v of values) {
    assert.deepEqual(yamlRoundTrip(v), v, `round-trip failed for ${JSON.stringify(v)}`);
  }
});

test("restricted YAML: serializer output is deterministic and parses back (I-036)", () => {
  const c = validContract();
  assert.equal(serializeYaml(c), serializeYaml(c));
  const parsed = parseYaml(serializeYaml(c));
  assert.deepEqual(parsed, c);
});

test("restricted YAML: arbitrary JSON or plain text is NOT accepted as YAML (I-036)", () => {
  // flow-style JSON is outside the restricted subset -> must fail, not be silently treated as YAML
  assert.throws(() => parseYaml('{"decision": "x", "object": "y"}'), (e) => e.code === ERROR_CODES.YAML_UNSUPPORTED_FEATURE);
  // unquoted arbitrary text at top level (no mapping) must fail
  assert.throws(() => parseYaml("just some prose text here that is not a mapping\n"), (e) => e.code === ERROR_CODES.YAML_PARSE_ERROR);
});

test("restricted YAML: unsupported constructs are rejected with stable codes, never misparsed (I-036)", () => {
  const reject = (text, code) => {
    assert.throws(() => parseYaml(text), (e) => e.code === code, `expected ${code} for ${JSON.stringify(text)}`);
  };
  reject("---\na: 1\n", "YAML_UNSUPPORTED_FEATURE"); // multi-doc marker
  reject("a: &x 1\nb: *x\n", "YAML_UNSUPPORTED_FEATURE"); // anchor/alias
  reject("a: [1, 2]\n", "YAML_UNSUPPORTED_FEATURE"); // flow sequence
  reject("a: {x: 1}\n", "YAML_UNSUPPORTED_FEATURE"); // flow mapping
  reject("a: |\n  line1\n", "YAML_UNSUPPORTED_FEATURE"); // literal block
  reject("a: >\n  folded\n", "YAML_UNSUPPORTED_FEATURE"); // folded block
  reject("a: 1 # inline comment\n", "YAML_UNSUPPORTED_FEATURE"); // inline comment
  reject("a:\n\tb: 1\n", "YAML_UNSUPPORTED_FEATURE"); // tab indentation
  reject("a: 1\na: 2\n", "YAML_DUPLICATE_KEY"); // duplicate key
  reject("a: \"unterminated\n", "YAML_PARSE_ERROR");
});

test("restricted YAML: full-line comments are allowed and do not affect value determinism", () => {
  const c = validContract();
  const withComments = "# heading comment\n" + serializeYaml(c) + "\n# trailing comment\n";
  const parsed = parseYaml(withComments);
  assert.deepEqual(parsed, c);
  assert.equal(contractHash(parsed), contractHash(c));
});

test("URL policy: canonicalizeUrl normalizes deterministically (I-034)", () => {
  assert.equal(canonicalizeUrl("HTTPS://Example.COM:443/a/b?q=1#frag"), "https://example.com/a/b?q=1#frag");
  assert.equal(canonicalizeUrl("http://example.com:80/x"), "http://example.com/x");
  assert.equal(canonicalizeUrl(canonicalizeUrl("HTTPS://Example.COM:443/a/b")), canonicalizeUrl("HTTPS://Example.COM:443/a/b"));
  assert.throws(() => canonicalizeUrl("not a url"), (e) => e.code === "URL_MALFORMED");
});

test("URL policy: classifyUrl rejects unsafe schemes, credentials, loopback and private hosts (I-034)", () => {
  assert.equal(classifyUrl("https://example.com/path").status, "clean");
  assert.equal(classifyUrl("javascript:alert(1)").status, "unsafe_scheme");
  assert.equal(classifyUrl("data:text/html,hi").status, "unsafe_scheme");
  assert.equal(classifyUrl("file:///etc/passwd").status, "unsafe_scheme");
  assert.equal(classifyUrl("https://user:pass@example.com/").status, "credential_in_url");
  assert.equal(classifyUrl("http://127.0.0.1:8080/x").status, "loopback");
  assert.equal(classifyUrl("http://localhost/x").status, "loopback");
  assert.equal(classifyUrl("http://[::1]/").status, "loopback");
  assert.equal(classifyUrl("http://192.168.1.10/x").status, "private");
  assert.equal(classifyUrl("http://10.0.0.5/x").status, "private");
  assert.equal(classifyUrl("http://172.16.3.9/x").status, "private");
  assert.throws(() => classifyUrl("garbage url"), (e) => e.code === "URL_MALFORMED");
});

test("URL policy: redactUrl strips credentials and sensitive query params (I-034)", () => {
  const r = redactUrl("https://user:secret@example.com/search?q=ghostty&api_key=abc123&token=xyz");
  assert.equal(r, "https://example.com/search?q=ghostty");
  assert.ok(!r.includes("abc123"));
  assert.ok(!r.includes("user:secret"));
});

test("URL policy: finalUrlStatus returns a stable status value (I-034)", () => {
  assert.equal(finalUrlStatus("https://example.com/ok").status, "clean");
  assert.equal(finalUrlStatus("javascript:alert(1)").status, "unsafe_scheme");
  assert.equal(finalUrlStatus("https://user:pw@example.com/").status, "credential_present");
  assert.equal(finalUrlStatus("http://127.0.0.1/x").status, "loopback");
  assert.equal(finalUrlStatus("http://192.168.0.4/x").status, "private");
  assert.equal(finalUrlStatus("totally broken").status, "malformed");
});

test("output guard: assertSafeOutputValue rejects unsafe JS values (I-034)", () => {
  assert.equal(assertSafeOutputValue("fine").ok, true);
  assert.equal(assertSafeOutputValue(42).ok, true);
  assert.equal(assertSafeOutputValue(["a", "b"]).ok, true);
  assert.equal(assertSafeOutputValue(() => {}).ok, false);
  assert.equal(assertSafeOutputValue(NaN).ok, false);
  assert.equal(assertSafeOutputValue(Infinity).ok, false);
  assert.equal(assertSafeOutputValue("a\u0000b").ok, false);
  assert.equal(assertSafeOutputValue("x".repeat(20000)).ok, false); // over length cap
});

test("output guard: redactText hides common secret patterns and private paths", () => {
  const redacted = redactText("key=abc123 token=def456 api_key=ghi  password=hunter2");
  for (const secret of ["abc123", "def456", "ghi", "hunter2"]) {
    assert.ok(!redacted.includes(secret), `secret ${secret} leaked`);
  }
  assert.equal(containsPrivatePath("see /Users/alice/Documents/note.md here"), true);
  assert.equal(containsPrivatePath("public text without paths", ), false);
});

test("archive: sha256Hex is the standard SHA-256 (I-021)", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex(Buffer.from("abc")), sha256Hex("abc"));
});

test("archive: manifestEntry and entryFromBytes capture bytes + sha256 (I-021/I-008)", () => {
  const buf = Buffer.from("hello world", "utf8");
  const entry = entryFromBytes("contract.yaml", buf);
  assert.equal(entry.path, "contract.yaml");
  assert.equal(entry.bytes, 11);
  assert.equal(entry.sha256, sha256Hex(buf));
  const m = manifestEntry({ path: "contract.yaml", bytes: 11, sha256: entry.sha256, schema_version: "1.0", redacted: false });
  assert.equal(m.schema_version, "1.0");
  assert.equal(m.redacted, false);
  assert.equal(m.sha256, entry.sha256);
});

test("archive: packageId is deterministic", () => {
  const id1 = packageId({ runId: "run-1", contractHash: "a".repeat(64) });
  const id2 = packageId({ runId: "run-1", contractHash: "a".repeat(64) });
  assert.equal(id1, id2);
  assert.notEqual(id1, packageId({ runId: "run-2", contractHash: "a".repeat(64) }));
});

test("archive: syncDriftReport detects differing and missing files (I-015/I-021)", () => {
  const dirA = mkdtempSync(path.join(tmpdir(), "rpa-"));
  const dirB = mkdtempSync(path.join(tmpdir(), "rpb-"));
  try {
    const sub = "nested/dir";
    mkdirSync(path.join(dirA, sub), { recursive: true });
    mkdirSync(path.join(dirB, sub), { recursive: true });
    writeFileSync(path.join(dirA, "a.yaml"), "x: 1\n");
    writeFileSync(path.join(dirB, "a.yaml"), "x: 1\n");
    writeFileSync(path.join(dirA, sub, "b.mjs"), "export const v = 1;\n");
    writeFileSync(path.join(dirB, sub, "b.mjs"), "export const v = 2;\n"); // differs
    writeFileSync(path.join(dirA, "only-in-a.txt"), "z\n");

    const ok = syncDriftReport({ rootDir: dirA, nestedDir: dirB, relativePaths: ["a.yaml", "nested/dir/b.mjs"] });
    assert.equal(ok.ok, false);
    assert.deepEqual(ok.differing.sort(), ["nested/dir/b.mjs"]);
    assert.deepEqual(ok.missing, []);

    writeFileSync(path.join(dirB, sub, "b.mjs"), "export const v = 1;\n");
    const ok2 = syncDriftReport({ rootDir: dirA, nestedDir: dirB, relativePaths: ["a.yaml", "nested/dir/b.mjs"] });
    assert.equal(ok2.ok, true);
    assert.deepEqual(ok2.differing, []);
    assert.deepEqual(ok2.missing, []);

    const missingReport = syncDriftReport({ rootDir: dirA, nestedDir: dirB, relativePaths: ["ghost.yaml"] });
    assert.deepEqual(missingReport.missing, ["ghost.yaml"]);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test("typed records: source record validation (I-023)", () => {
  const good = {
    id: "S-001",
    title: "Official Ghostty config reference",
    publisher: "Ghostty",
    url: "https://ghostty.org/docs/config/reference",
    source_type: "documentation",
    published_at: null,
    accessed_at: "2026-09-03T00:00:00Z",
    authority: "official",
    scope_limit: "config reference only",
    canonical_source_id: "S-001",
    independence_group: "IG-001",
    derived_from: [],
    derivation_kind: null,
    independence_status: "independent",
  };
  assert.equal(validateSourceRecord(good).ok, true);

  const noId = validateSourceRecord({ ...good, id: "" });
  assert.equal(noId.ok, false);
  assert.ok(codesOf(noId).some((c) => c === `RECORD_REQUIRED_FIELD@id`));

  const badKind = validateSourceRecord({ ...good, independence_status: "whatever" });
  assert.equal(badKind.ok, false);
  assert.ok(codesOf(badKind).some((c) => c === `RECORD_UNKNOWN_ENUM@independence_status`));

  const unsafeUrl = validateSourceRecord({ ...good, url: "javascript:alert(1)" });
  assert.equal(unsafeUrl.ok, false);
  assert.ok(codesOf(unsafeUrl).some((c) => c === `RECORD_UNSAFE_URL@url`));
});

test("typed records: evidence + relation records (I-023)", () => {
  const evidence = {
    id: "E-001",
    source_id: "S-001",
    locator: "section-2",
    excerpt_or_value: "The config reference lists these keys.",
    observation: "paraphrase of docs",
    directness: "direct",
    evidence_strength: "strong",
    verified_at: "2026-09-03T00:00:00Z",
    status: "verified",
  };
  assert.equal(validateEvidenceRecord(evidence).ok, true);
  assert.equal(validateEvidenceRecord({ ...evidence, evidence_strength: "immense" }).ok, false);

  const relGood = {
    id: "R-001",
    from_id: "E-001",
    to_id: "C-001",
    relation_type: "supports",
    entailment: "direct",
    polarity: "positive",
    support_role: "necessary",
    rationale: "the excerpt states the key is supported",
    scope_match: "full",
    review_status: "proposed",
  };
  assert.equal(validateRelationRecord(relGood).ok, true);
  assert.equal(validateRelationRecord({ ...relGood, entailment: "absolute" }).ok, false);
  assert.equal(validateRelationRecord({ ...relGood, polarity: "negative" }).ok, false, "supports cannot be negative");
});

test("typed records: entailment none / scope mismatch / contextualizes never permit claim support (I-023)", () => {
  const base = {
    id: "R-1", from_id: "E-1", to_id: "C-1", relation_type: "supports", polarity: "positive",
    support_role: "necessary", rationale: "x", scope_match: "full", review_status: "proposed",
  };
  assert.equal(relationPermitsSupport({ ...base, entailment: "direct" }), true);
  assert.equal(relationPermitsSupport({ ...base, entailment: "none" }), false);
  assert.equal(relationPermitsSupport({ ...base, entailment: "partial", scope_match: "mismatch" }), false);
  assert.equal(relationPermitsSupport({ ...base, entailment: "direct", relation_type: "contextualizes", polarity: "neutral" }), false);
  assert.equal(relationPermitsSupport({ ...base, entailment: "indirect" }), false);
});

test("typed records: claim record validation (I-023)", () => {
  const claim = {
    id: "C-001",
    claim: "Ghostty's config reference documents a list of supported options.",
    claim_type: "fact",
    fact_subtype: "source_assertion",
    evidence_ids: ["E-001"],
    source_ids: ["S-001"],
    confidence: "high",
    counter_evidence_ids: [],
    limitations: [],
    retrieval_status: "source_verified",
    support_status: "proposed",
    status: "open",
    reviewed_by: null,
    reviewed_at: null,
  };
  assert.equal(validateClaimRecord(claim).ok, true);
  assert.equal(validateClaimRecord({ ...claim, claim_type: "legendary" }).ok, false);
  assert.equal(validateClaimRecord({ ...claim, fact_subtype: null }).ok, false, "fact claims require fact_subtype");
  const rec = validateClaimRecord({ ...claim, claim_type: "recommendation", status: "reviewed", evidence_ids: [] });
  assert.equal(rec.ok, false, "recommendation with no evidence cannot be reviewed");
});

test("authority registry: data file matches registry schema and ids are unique (I-032)", () => {
  const r = validateAuthorityRegistry(TRUSTED_AUTHORITIES);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(TRUSTED_AUTHORITIES.version, "1.0");
  const ids = TRUSTED_AUTHORITIES.authorities.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "registry ids must be unique");
  for (const a of TRUSTED_AUTHORITIES.authorities) {
    assert.ok(a.domains.length > 0, `registry authority ${a.id} needs domains`);
  }
});

test("event records: research events require contract_hash / scope_key / sub_q / round (I-005)", () => {
  const ev = validEvent();
  assert.equal(validateEventRecord(ev).ok, true, JSON.stringify(validateEventRecord(ev).errors));
  for (const field of ["contract_hash", "scope_key", "sub_q", "round"]) {
    const clone = { ...ev, [field]: undefined };
    const r = validateEventRecord(clone);
    assert.equal(r.ok, false, `${field} must be required`);
    assert.ok(codesOf(r).some((c) => c === `EVENT_REQUIRED_FIELD@${field}`), JSON.stringify(codesOf(r)));
  }
  assert.ok(codesOf(validateEventRecord({ ...ev, contract_hash: "zz" })).some((c) => c === `EVENT_CONTRACT_HASH_INVALID@contract_hash`));
  assert.ok(codesOf(validateEventRecord({ ...ev, scope_key: "" })).some((c) => c === `EVENT_REQUIRED_FIELD@scope_key`));
});

test("event records: evidence-grade follow-up retrieval must be parent/discovery bound (I-031)", () => {
  const ev = validEvent({ evidence_capability: "evidence_grade" });
  assert.equal(validateEventRecord(ev).ok, true); // explicitly bound
  const unbound = validEvent({ evidence_capability: "evidence_grade", parent_event_id: null, discovery_evidence_id: null });
  const r = validateEventRecord(unbound);
  assert.equal(r.ok, false);
  assert.ok(codesOf(r).some((c) => c === `EVENT_UNBOUND_FOLLOWUP@parent_event_id`));
});

test("event records: authority_registry_id must exist in the trusted registry (I-032)", () => {
  assert.equal(validateEventRecord(validEvent({ authority_registry_id: "ghostty" })).ok, true);
  const r = validateEventRecord(validEvent({ authority_registry_id: "not-a-real-authority" }));
  assert.equal(r.ok, false);
  assert.ok(codesOf(r).some((c) => c === `EVENT_UNKNOWN_AUTHORITY@authority_registry_id`));
});

test("event records: community coverage requires platform/sample metadata (I-033)", () => {
  const good = validEvent({ platform: "reddit.com", published_at: "2026-09-01T00:00:00Z", sample_basis: "search within window", sample_window: "last 30 days", selection_bias: "self-selected posters", account_or_author: "u/anon", final_url: "https://www.reddit.com/r/ghostty/comments/1x/" });
  assert.equal(validateEventRecord(good).ok, true, JSON.stringify(validateEventRecord(good).errors));
  const r = validateEventRecord({ ...good, sample_basis: undefined });
  assert.equal(r.ok, false);
  assert.ok(codesOf(r).some((c) => c === `EVENT_COMMUNITY_METADATA_INCOMPLETE@sample_basis`));
});

test("event records: provider usage/cost are typed and consistent with usage_status (I-030)", () => {
  const known = validEvent({ usage_status: "known", provider_usage: { prompt_tokens: 10, completion_tokens: 5 }, provider_cost: 0.001 });
  assert.equal(validateEventRecord(known).ok, true);
  const r = validateEventRecord(validEvent({ usage_status: "unknown", provider_usage: { prompt_tokens: 10 } }));
  assert.equal(r.ok, false, "unknown usage_status must not carry usage values");
  assert.ok(codesOf(r).some((c) => c === `EVENT_USAGE_INCONSISTENT@usage_status`));
  const badType = validateEventRecord(validEvent({ usage_status: "known", provider_cost: "cheap" }));
  assert.equal(badType.ok, false);
  assert.ok(codesOf(badType).some((c) => c === `EVENT_USAGE_INVALID@provider_cost`));
});

test("event records: final_url_status is an allowed enum and unsafe final URLs are rejected (I-034)", () => {
  assert.equal(validateEventRecord(validEvent({ final_url_status: "clean" })).ok, true);
  const r = validateEventRecord(validEvent({ final_url_status: "banana" }));
  assert.equal(r.ok, false);
  assert.ok(codesOf(r).some((c) => c === `EVENT_FINAL_URL_STATUS_INVALID@final_url_status`));
  const unsafe = validateEventRecord(validEvent({ final_url: "javascript:alert(1)", final_url_status: "clean" }));
  assert.equal(unsafe.ok, false);
  assert.ok(codesOf(unsafe).some((c) => c === `EVENT_UNSAFE_FINAL_URL@final_url`));
});

test("root↔nested synced files are byte-identical (I-015/I-021)", () => {
  for (const rel of SYNCED_REL_PATHS) {
    const rootBytes = readFileSync(path.join(ROOT, rel));
    const nestedBytes = readFileSync(path.join(NESTED, rel));
    assert.ok(rootBytes.equals(nestedBytes), `${rel} root and nested copies differ`);
  }
  const report = syncDriftReport({ rootDir: ROOT, nestedDir: NESTED, relativePaths: SYNCED_REL_PATHS });
  assert.equal(report.ok, true, JSON.stringify(report));
});

test("schemas: all schema files are valid JSON with a top-level object shape", () => {
  const schemaFiles = readdirSync(path.join(ROOT, "schemas")).filter((f) => f.endsWith(".schema.json")).sort();
  assert.deepEqual(schemaFiles, [
    "authority-registry.schema.json",
    "claim.schema.json",
    "evidence.schema.json",
    "relation.schema.json",
    "search-contract.schema.json",
    "search-event.schema.json",
    "source-receipt.schema.json",
    "source.schema.json",
  ]);
  for (const f of schemaFiles) {
    const s = JSON.parse(readFileSync(path.join(ROOT, "schemas", f), "utf8"));
    assert.equal(s.type, "object", `${f} must be an object schema`);
    assert.equal(typeof s.title, "string", `${f} needs a title`);
    assert.ok(s.properties && Object.keys(s.properties).length > 0, `${f} needs properties`);
    assert.ok(Array.isArray(s.required), `${f} needs a required list`);
  }
});

/** Minimal complete event record based on plan §2.3 field list. */
function validEvent(overrides = {}) {
  return {
    event_id: "evt-0001",
    run_id: "run-2026-09-03T01:45:47Z",
    contract_hash: "a".repeat(64),
    scope_key: "scope-" + "b".repeat(60),
    sub_q: "Q1",
    round: 1,
    query: "ghostty config popular",
    requested_hint: "web",
    requested_tool: "web_extract",
    actual_tool: "web_extract",
    fallback_chain: [],
    status: "ok",
    degraded: false,
    degrade_reason: null,
    failure_class: null,
    evidence_capability: "discovery_only",
    requested_url: "https://ghostty.org/docs/config/reference",
    returned_url: "https://ghostty.org/docs/config/reference",
    final_url: "https://ghostty.org/docs/config/reference",
    identity_status: "clean",
    content_type: "text/html",
    content_sha256: "c".repeat(64),
    result_count: 5,
    raw_path: "raw/evt-0001.json",
    cache_key: null,
    cache_hit: false,
    cache_stale: false,
    retrieval_status: "candidate_pool",
    trace_coverage: "full",
    source_id: null,
    canonical_source_id: null,
    parent_event_id: null,
    discovery_evidence_id: "evt-0000",
    authority_registry_id: "ghostty",
    platform: null,
    account_or_author: null,
    published_at: null,
    sample_window: null,
    sample_basis: null,
    selection_bias: null,
    final_url_status: "clean",
    independence_group: null,
    evidence_ids: [],
    provider_usage: null,
    provider_cost: null,
    usage_status: "unknown",
    elapsed_ms: 120,
    captured_at: "2026-09-03T01:46:00Z",
    ...overrides,
  };
}
