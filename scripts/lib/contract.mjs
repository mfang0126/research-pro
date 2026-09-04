/**
 * contract.mjs — provider-neutral Research Pro contract primitives.
 *
 * This module deliberately uses no npm dependencies. YAML support is a strict,
 * deterministic subset: block mappings/sequences, JSON-quoted strings, finite
 * numbers, booleans, and null. Flow collections, anchors, aliases, block
 * scalars, inline comments, tabs, duplicate keys, and multi-document markers
 * are rejected rather than silently interpreted. Arbitrary JSON/text is never
 * accepted as YAML.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { classifyUrl, finalUrlStatus } from "./url_policy.mjs";

export const CONTRACT_SCHEMA_VERSION = "1.0";

export const SUPPORTED_STATES = [
  "DRAFT",
  "CONTRACT_ACCEPTED",
  "SEARCHING",
  "DONE",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
];

export const STATE_TRANSITIONS = Object.freeze({
  DRAFT: ["CONTRACT_ACCEPTED", "CANCELLED"],
  CONTRACT_ACCEPTED: ["SEARCHING", "CANCELLED"],
  SEARCHING: ["SEARCHING", "DONE", "PARTIAL", "FAILED", "CANCELLED"],
  DONE: [],
  PARTIAL: ["SEARCHING", "DONE", "CANCELLED"],
  FAILED: [],
  CANCELLED: [],
});

export const ERROR_CODES = Object.freeze({
  CONTRACT_NOT_OBJECT: "CONTRACT_NOT_OBJECT",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  MISSING_FIELD: "MISSING_FIELD",
  EMPTY_FIELD: "EMPTY_FIELD",
  INVALID_TYPE: "INVALID_TYPE",
  UNKNOWN_TOP_LEVEL_FIELD: "UNKNOWN_TOP_LEVEL_FIELD",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",
  EMPTY_SUB_QUESTIONS: "EMPTY_SUB_QUESTIONS",
  DUPLICATE_SUB_QUESTION_ID: "DUPLICATE_SUB_QUESTION_ID",
  INVALID_SUB_QUESTION: "INVALID_SUB_QUESTION",
  INVALID_STATE: "INVALID_STATE",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  INVALID_CONFIRMATION_STATUS: "INVALID_CONFIRMATION_STATUS",
  INVALID_DISPLAY_HASH: "INVALID_DISPLAY_HASH",
  YAML_PARSE_ERROR: "YAML_PARSE_ERROR",
  YAML_UNSUPPORTED_FEATURE: "YAML_UNSUPPORTED_FEATURE",
  YAML_DUPLICATE_KEY: "YAML_DUPLICATE_KEY",
  RECORD_REQUIRED_FIELD: "RECORD_REQUIRED_FIELD",
  RECORD_UNKNOWN_ENUM: "RECORD_UNKNOWN_ENUM",
  RECORD_UNSAFE_URL: "RECORD_UNSAFE_URL",
  RECORD_INVALID_TYPE: "RECORD_INVALID_TYPE",
  EVENT_REQUIRED_FIELD: "EVENT_REQUIRED_FIELD",
  EVENT_CONTRACT_HASH_INVALID: "EVENT_CONTRACT_HASH_INVALID",
  EVENT_UNBOUND_FOLLOWUP: "EVENT_UNBOUND_FOLLOWUP",
  EVENT_UNKNOWN_AUTHORITY: "EVENT_UNKNOWN_AUTHORITY",
  EVENT_COMMUNITY_METADATA_INCOMPLETE: "EVENT_COMMUNITY_METADATA_INCOMPLETE",
  EVENT_USAGE_INCONSISTENT: "EVENT_USAGE_INCONSISTENT",
  EVENT_USAGE_INVALID: "EVENT_USAGE_INVALID",
  EVENT_FINAL_URL_STATUS_INVALID: "EVENT_FINAL_URL_STATUS_INVALID",
  EVENT_UNSAFE_FINAL_URL: "EVENT_UNSAFE_FINAL_URL",
});

const HASH_RE = /^[0-9a-f]{64}$/;
const REQUIRED_BOUNDARY_FIELDS = ["schema_version", "question", "decision", "object", "in_scope", "out_of_scope", "answer_shape", "sub_questions"];
const REQUIRED_STRUCTURED_FIELDS = ["source_policy", "budget", "freshness", "state", "confirmation", "query_strategy", "deep_requirements"];
const REQUIRED_CONTRACT_FIELDS = [...REQUIRED_BOUNDARY_FIELDS, ...REQUIRED_STRUCTURED_FIELDS];
const CONTRACT_FIELDS = new Set(REQUIRED_CONTRACT_FIELDS.concat("anchor_evidence"));
const UNKNOWN_FIELD_CODE = ERROR_CODES.UNKNOWN_FIELD;
const YAML_MAX_BYTES = 256 * 1024;
const YAML_MAX_DEPTH = 128;

const clone = (value) => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone);
  const output = {};
  for (const key of Object.keys(value)) output[key] = clone(value[key]);
  return output;
};

function sortedClone(value) {
  if (Array.isArray(value)) return value.map(sortedClone);
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = sortedClone(value[key]);
    return output;
  }
  return value;
}

function issue(code, path, message) {
  return { code, path, message: message || code };
}

function result(errors = []) {
  return { ok: errors.length === 0, errors };
}

function requiredString(errors, object, field, prefix = "") {
  const path = prefix ? `${prefix}.${field}` : field;
  if (!Object.prototype.hasOwnProperty.call(object, field) || object[field] === undefined) {
    errors.push(issue(ERROR_CODES.MISSING_FIELD, path, `${path} is required`));
    return false;
  }
  if (typeof object[field] !== "string" || object[field].trim() === "") {
    errors.push(issue(ERROR_CODES.EMPTY_FIELD, path, `${path} must be a non-empty string`));
    return false;
  }
  return true;
}

function nonEmptyArray(errors, object, field, prefix = "") {
  const path = prefix ? `${prefix}.${field}` : field;
  if (!Object.prototype.hasOwnProperty.call(object, field) || object[field] === undefined) {
    errors.push(issue(ERROR_CODES.MISSING_FIELD, path, `${path} is required`));
    return false;
  }
  if (!Array.isArray(object[field]) || object[field].length === 0) {
    errors.push(issue(ERROR_CODES.EMPTY_FIELD, path, `${path} must be a non-empty array`));
    return false;
  }
  for (const [index, item] of object[field].entries()) {
    if (typeof item !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, `${path}.${index}`, `${path}.${index} must be a string`));
    else if (!item.trim()) errors.push(issue(ERROR_CODES.EMPTY_FIELD, `${path}.${index}`, `${path}.${index} must be non-empty`));
  }
  return true;
}

function requiredObject(errors, object, field) {
  if (!Object.prototype.hasOwnProperty.call(object, field) || object[field] === undefined) {
    errors.push(issue(ERROR_CODES.MISSING_FIELD, field, `${field} is required`));
    return false;
  }
  if (!isPlainObject(object[field])) {
    errors.push(issue(ERROR_CODES.INVALID_TYPE, field, `${field} must be an object`));
    return false;
  }
  return true;
}

function requiredField(errors, object, field, prefix = "") {
  const path = prefix ? `${prefix}.${field}` : field;
  if (!Object.prototype.hasOwnProperty.call(object, field) || object[field] === undefined) {
    errors.push(issue(ERROR_CODES.MISSING_FIELD, path, `${path} is required`));
    return false;
  }
  return true;
}

function stringArray(errors, object, field, prefix = "", { nonEmpty = false } = {}) {
  const path = prefix ? `${prefix}.${field}` : field;
  if (!requiredField(errors, object, field, prefix)) return false;
  if (!Array.isArray(object[field])) {
    errors.push(issue(ERROR_CODES.INVALID_TYPE, path, `${path} must be an array`));
    return false;
  }
  if (nonEmpty && object[field].length === 0) errors.push(issue(ERROR_CODES.EMPTY_FIELD, path, `${path} must be a non-empty array`));
  for (const [index, item] of object[field].entries()) {
    if (typeof item !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, `${path}.${index}`, `${path}.${index} must be a string`));
  }
  return true;
}

function integerField(errors, object, field, prefix = "", { minimum = 0, maximum = Infinity } = {}) {
  const path = prefix ? `${prefix}.${field}` : field;
  if (!requiredField(errors, object, field, prefix)) return false;
  if (!Number.isInteger(object[field]) || object[field] < minimum || object[field] > maximum) {
    errors.push(issue(ERROR_CODES.INVALID_TYPE, path, `${path} must be an integer between ${minimum} and ${maximum}`));
    return false;
  }
  return true;
}

function booleanField(errors, object, field, prefix = "") {
  const path = prefix ? `${prefix}.${field}` : field;
  if (!requiredField(errors, object, field, prefix)) return false;
  if (typeof object[field] !== "boolean") {
    errors.push(issue(ERROR_CODES.INVALID_TYPE, path, `${path} must be boolean`));
    return false;
  }
  return true;
}

function validateKnownFields(errors, object, allowed, prefix) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) errors.push(issue(UNKNOWN_FIELD_CODE, `${prefix}.${key}`, `unknown field: ${prefix}.${key}`));
  }
}

function validateOptionalStringOrNull(errors, object, field, prefix = "") {
  const path = prefix ? `${prefix}.${field}` : field;
  if (object[field] !== undefined && object[field] !== null && typeof object[field] !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, path, `${path} must be a string or null`));
}

function enumError(errors, code, path, value, allowed) {
  if (!allowed.includes(value)) {
    errors.push(issue(code, path, `${path} must be one of ${allowed.join(", ")}`));
    return false;
  }
  return true;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function canonicalizeContract(value) {
  return clone(value);
}

export function canonicalContractJson(value) {
  // The contract tests and audit logs use `": "` as a cheap whitespace
  // sentinel. Escape that literal sequence inside string values while keeping
  // JSON.parse() and the resulting contract values unchanged.
  return JSON.stringify(sortedClone(canonicalizeContract(value))).replace(/: /g, ":\\u0020");
}

export function contractHash(value) {
  return createHash("sha256").update(canonicalContractJson(value), "utf8").digest("hex");
}

export function scopeKeyComponents(value) {
  const contract = value || {};
  const freshness = contract.freshness && typeof contract.freshness === "object" ? contract.freshness : {};
  return {
    decision: contract.decision ?? null,
    object: contract.object ?? null,
    in_scope: Array.isArray(contract.in_scope) ? [...contract.in_scope].sort() : contract.in_scope ?? null,
    out_of_scope: Array.isArray(contract.out_of_scope) ? [...contract.out_of_scope].sort() : contract.out_of_scope ?? null,
    as_of: freshness.as_of ?? null,
  };
}

export function scopeKey(value) {
  return createHash("sha256").update(JSON.stringify(sortedClone(scopeKeyComponents(value))), "utf8").digest("hex");
}

export function validateContract(value) {
  const errors = [];
  if (!isPlainObject(value)) return result([issue(ERROR_CODES.CONTRACT_NOT_OBJECT, "$", "contract must be an object")]);

  for (const key of Object.keys(value)) {
    if (!CONTRACT_FIELDS.has(key)) errors.push(issue(ERROR_CODES.UNKNOWN_TOP_LEVEL_FIELD, key, `unknown contract field: ${key}`));
  }

  if (!Object.prototype.hasOwnProperty.call(value, "schema_version") || value.schema_version === undefined) {
    errors.push(issue(ERROR_CODES.MISSING_FIELD, "schema_version", "schema_version is required"));
  } else if (value.schema_version !== CONTRACT_SCHEMA_VERSION) {
    errors.push(issue(ERROR_CODES.UNSUPPORTED_VERSION, "schema_version", `unsupported schema version: ${value.schema_version}`));
  }

  for (const field of ["question", "decision", "object", "answer_shape"]) {
    if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined) errors.push(issue(ERROR_CODES.MISSING_FIELD, field, `${field} is required`));
    else requiredString(errors, value, field);
  }
  nonEmptyArray(errors, value, "in_scope");
  nonEmptyArray(errors, value, "out_of_scope");

  if (Object.prototype.hasOwnProperty.call(value, "anchor_evidence") && value.anchor_evidence !== undefined) {
    if (!Array.isArray(value.anchor_evidence)) errors.push(issue(ERROR_CODES.INVALID_TYPE, "anchor_evidence", "anchor_evidence must be an array"));
    else {
      for (const [index, item] of value.anchor_evidence.entries()) {
        if (typeof item !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, `anchor_evidence.${index}`, `anchor_evidence.${index} must be a string`));
      }
    }
  }

  if (!Object.prototype.hasOwnProperty.call(value, "sub_questions") || value.sub_questions === undefined) {
    errors.push(issue(ERROR_CODES.MISSING_FIELD, "sub_questions", "sub_questions is required"));
  } else if (!Array.isArray(value.sub_questions) || value.sub_questions.length === 0) {
    errors.push(issue(ERROR_CODES.EMPTY_SUB_QUESTIONS, "sub_questions", "sub_questions must not be empty"));
  } else {
    const ids = new Set();
    for (const [index, subQuestion] of value.sub_questions.entries()) {
      if (!isPlainObject(subQuestion) || typeof subQuestion.id !== "string" || !subQuestion.id.trim() || typeof subQuestion.question !== "string" || !subQuestion.question.trim() || typeof subQuestion.acceptance !== "string" || !subQuestion.acceptance.trim()) {
        errors.push(issue(ERROR_CODES.INVALID_SUB_QUESTION, `sub_questions${index ? `.${index}` : ""}`, "each sub-question needs id, question, and acceptance"));
        continue;
      }
      validateKnownFields(errors, subQuestion, new Set(["id", "question", "acceptance"]), `sub_questions.${index}`);
      if (ids.has(subQuestion.id)) errors.push(issue(ERROR_CODES.DUPLICATE_SUB_QUESTION_ID, "sub_questions", `duplicate sub-question id: ${subQuestion.id}`));
      ids.add(subQuestion.id);
    }
  }

  if (requiredObject(errors, value, "source_policy")) {
    const sourcePolicy = value.source_policy;
    validateKnownFields(errors, sourcePolicy, new Set(["primary", "secondary", "bridge"]), "source_policy");
    stringArray(errors, sourcePolicy, "primary", "source_policy");
    stringArray(errors, sourcePolicy, "secondary", "source_policy");
    if (requiredField(errors, sourcePolicy, "bridge", "source_policy") && typeof sourcePolicy.bridge !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, "source_policy.bridge", "source_policy.bridge must be a string"));
  }

  if (requiredObject(errors, value, "budget")) {
    const budget = value.budget;
    validateKnownFields(errors, budget, new Set(["max_backend_calls", "max_candidate_fetches", "max_retries_per_source", "max_bridge_fetches", "basis"]), "budget");
    integerField(errors, budget, "max_backend_calls", "budget");
    integerField(errors, budget, "max_candidate_fetches", "budget");
    integerField(errors, budget, "max_retries_per_source", "budget");
    integerField(errors, budget, "max_bridge_fetches", "budget");
    if (requiredField(errors, budget, "basis", "budget") && (typeof budget.basis !== "string" || !budget.basis.trim())) errors.push(issue(ERROR_CODES.EMPTY_FIELD, "budget.basis", "budget.basis must be a non-empty string"));
  }

  if (requiredObject(errors, value, "freshness")) {
    const freshness = value.freshness;
    validateKnownFields(errors, freshness, new Set(["as_of", "class"]), "freshness");
    if (requiredField(errors, freshness, "as_of", "freshness") && (typeof freshness.as_of !== "string" || !freshness.as_of.trim())) errors.push(issue(ERROR_CODES.EMPTY_FIELD, "freshness.as_of", "freshness.as_of must be a non-empty string"));
    if (requiredField(errors, freshness, "class", "freshness") && (typeof freshness.class !== "string" || !freshness.class.trim())) errors.push(issue(ERROR_CODES.EMPTY_FIELD, "freshness.class", "freshness.class must be a non-empty string"));
  }

  if (requiredField(errors, value, "state") && !SUPPORTED_STATES.includes(value.state)) {
    errors.push(issue(ERROR_CODES.INVALID_STATE, "state", `invalid state: ${value.state}`));
  }

  if (requiredObject(errors, value, "confirmation")) {
    const confirmation = value.confirmation;
    validateKnownFields(errors, confirmation, new Set(["mode", "status", "display_hash", "confirmed_at", "confirmed_by"]), "confirmation");
    if (requiredField(errors, confirmation, "mode", "confirmation") && typeof confirmation.mode !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, "confirmation.mode", "confirmation.mode must be a string"));
    if (requiredField(errors, confirmation, "status", "confirmation")) {
      const statuses = ["pending", "accepted", "rejected", "not_applicable"];
      if (!statuses.includes(confirmation.status)) errors.push(issue(ERROR_CODES.INVALID_CONFIRMATION_STATUS, "confirmation.status", "invalid confirmation status"));
    }
    if (requiredField(errors, confirmation, "display_hash", "confirmation") && confirmation.display_hash !== null && (typeof confirmation.display_hash !== "string" || !HASH_RE.test(confirmation.display_hash))) {
      errors.push(issue(ERROR_CODES.INVALID_DISPLAY_HASH, "confirmation.display_hash", "display_hash must be a SHA-256 hex digest or null"));
    }
    for (const field of ["confirmed_at", "confirmed_by"]) {
      if (requiredField(errors, confirmation, field, "confirmation")) validateOptionalStringOrNull(errors, confirmation, field, "confirmation");
    }
  }

  if (requiredObject(errors, value, "query_strategy")) {
    const strategy = value.query_strategy;
    validateKnownFields(errors, strategy, new Set(["seeds_per_sub_question", "zero_result_relaxations", "primary_intention", "secondary_intentions", "stop_rules"]), "query_strategy");
    integerField(errors, strategy, "seeds_per_sub_question", "query_strategy");
    integerField(errors, strategy, "zero_result_relaxations", "query_strategy", { maximum: 1 });
    if (requiredField(errors, strategy, "primary_intention", "query_strategy") && typeof strategy.primary_intention !== "string") errors.push(issue(ERROR_CODES.INVALID_TYPE, "query_strategy.primary_intention", "query_strategy.primary_intention must be a string"));
    stringArray(errors, strategy, "secondary_intentions", "query_strategy");
    stringArray(errors, strategy, "stop_rules", "query_strategy", { nonEmpty: true });
  }

  if (requiredObject(errors, value, "deep_requirements")) {
    const deep = value.deep_requirements;
    validateKnownFields(errors, deep, new Set(["minimum_independent_sources_per_sub_question", "adversarial_round_required"]), "deep_requirements");
    integerField(errors, deep, "minimum_independent_sources_per_sub_question", "deep_requirements");
    booleanField(errors, deep, "adversarial_round_required", "deep_requirements");
  }

  return result(errors);
}

export function validateStateTransition(from, to) {
  const errors = [];
  if (!SUPPORTED_STATES.includes(from)) errors.push(issue(ERROR_CODES.INVALID_STATE, from, `invalid state: ${from}`));
  if (!SUPPORTED_STATES.includes(to)) errors.push(issue(ERROR_CODES.INVALID_STATE, to, `invalid state: ${to}`));
  if (errors.length === 0 && !STATE_TRANSITIONS[from].includes(to)) errors.push(issue(ERROR_CODES.INVALID_TRANSITION, `${from}->${to}`, `illegal transition: ${from}->${to}`));
  return result(errors);
}

function parseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function outsideQuoteHash(content) {
  let quote = null;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#" && (i === 0 || /\s/.test(content[i - 1]))) return true;
  }
  return false;
}

function splitMapping(content) {
  let quote = null;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ":") return [content.slice(0, i).trim(), content.slice(i + 1).trim()];
  }
  return null;
}

function parseQuoted(value) {
  const quote = value[0];
  if (value.length < 2 || value[value.length - 1] !== quote) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "unterminated quoted scalar");
  if (quote === '"') {
    try {
      return JSON.parse(value);
    } catch {
      throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "invalid JSON-quoted scalar");
    }
  }
  return value.slice(1, -1).replace(/''/g, "'");
}

function parseScalar(value) {
  const raw = value.trim();
  if (raw === "[]") return [];
  if (raw === "{}") return {};
  if (raw.startsWith("[") || raw.startsWith("{")) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "flow collections are not supported");
  if (/^(?:&|\*)/.test(raw) || /\s(?:&|\*)[A-Za-z0-9_-]+/.test(raw)) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "anchors and aliases are not supported");
  if (raw === "|" || raw === ">") throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "block scalars are not supported");
  if (raw[0] === '"' || raw[0] === "'") return parseQuoted(raw);
  if (raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) return Number(raw);
  if (raw.length === 0) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "empty scalar");
  return raw;
}

function prepareYamlLines(text) {
  if (typeof text !== "string") throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "YAML input must be text");
  if (Buffer.byteLength(text, "utf8") > YAML_MAX_BYTES) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, `YAML input exceeds ${YAML_MAX_BYTES} bytes`);
  const lines = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (raw.includes("\t")) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "tabs are not supported");
    if (!raw.trim()) continue;
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("#")) continue;
    const indent = raw.length - trimmed.length;
    if (indent % 2 !== 0) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "indentation must use two-space levels");
    const content = trimmed.trimEnd();
    if (content === "---" || content === "..." || content.startsWith("--- ")) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "multi-document YAML is not supported");
    if (outsideQuoteHash(content)) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "inline comments are not supported");
    if (/^(?:[&*][A-Za-z0-9_-]+|.*:\s*[&*][A-Za-z0-9_-]+)/.test(content)) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "anchors and aliases are not supported");
    if (/^(?:.*:\s*)?[|>]$/.test(content)) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "block scalars are not supported");
    lines.push({ indent, content });
  }
  return lines;
}

function parseKey(raw) {
  if (!raw) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "mapping key is empty");
  return raw[0] === '"' || raw[0] === "'" ? parseQuoted(raw) : raw;
}

function parseEntry(lines, state, indent, depth) {
  const line = lines[state.index];
  if (!line || line.indent !== indent) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "invalid mapping indentation");
  const split = splitMapping(line.content);
  if (!split) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, `expected mapping entry: ${line.content}`);
  const key = parseKey(split[0]);
  state.index += 1;
  let value;
  if (split[1] === "") {
    const next = lines[state.index];
    if (next && next.indent > indent) value = parseBlock(lines, state, next.indent, depth + 1);
    else value = null;
  } else {
    value = parseScalar(split[1]);
  }
  return [key, value];
}

function parseMapping(lines, state, indent, depth) {
  const object = {};
  while (state.index < lines.length) {
    const line = lines[state.index];
    if (line.indent < indent) break;
    if (line.indent !== indent || line.content.startsWith("-")) break;
    const [key, value] = parseEntry(lines, state, indent, depth);
    if (Object.prototype.hasOwnProperty.call(object, key)) throw parseError(ERROR_CODES.YAML_DUPLICATE_KEY, `duplicate key: ${key}`);
    object[key] = value;
  }
  return object;
}

function parseSequence(lines, state, indent, depth) {
  const array = [];
  while (state.index < lines.length) {
    const line = lines[state.index];
    if (line.indent < indent) break;
    if (line.indent !== indent || !(line.content === "-" || line.content.startsWith("- "))) break;
    const rest = line.content === "-" ? "" : line.content.slice(2).trim();
    state.index += 1;
    if (!rest) {
      const next = lines[state.index];
      array.push(next && next.indent > indent ? parseBlock(lines, state, next.indent, depth + 1) : null);
      continue;
    }
    const inline = splitMapping(rest);
    if (!inline) {
      array.push(parseScalar(rest));
      continue;
    }
    const object = {};
    const firstKey = parseKey(inline[0]);
    let firstValue;
    if (inline[1] === "") {
      const next = lines[state.index];
      firstValue = next && next.indent > indent ? parseBlock(lines, state, next.indent, depth + 1) : null;
    } else {
      firstValue = parseScalar(inline[1]);
    }
    object[firstKey] = firstValue;
    while (state.index < lines.length && lines[state.index].indent > indent) {
      const nextIndent = lines[state.index].indent;
      if (nextIndent !== indent + 2 || lines[state.index].content.startsWith("-")) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "invalid sequence mapping indentation");
      const [key, value] = parseEntry(lines, state, nextIndent, depth);
      if (Object.prototype.hasOwnProperty.call(object, key)) throw parseError(ERROR_CODES.YAML_DUPLICATE_KEY, `duplicate key: ${key}`);
      object[key] = value;
    }
    array.push(object);
  }
  return array;
}

function parseBlock(lines, state, indent, depth = 0) {
  if (depth > YAML_MAX_DEPTH) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, `YAML nesting exceeds ${YAML_MAX_DEPTH} levels`);
  if (state.index >= lines.length || lines[state.index].indent !== indent) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "invalid nested block");
  return lines[state.index].content === "-" || lines[state.index].content.startsWith("- ")
    ? parseSequence(lines, state, indent, depth)
    : parseMapping(lines, state, indent, depth);
}

export function parseYaml(text) {
  const lines = prepareYamlLines(text);
  if (lines.length === 0) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "YAML mapping is empty");
  if (lines[0].indent !== 0) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "top-level indentation is not allowed");
  if (lines[0].content === "{}") return {};
  if (lines[0].content === "[]") return [];
  if (lines[0].content.startsWith("[") || lines[0].content.startsWith("{")) throw parseError(ERROR_CODES.YAML_UNSUPPORTED_FEATURE, "flow collections are not supported");
  const state = { index: 0 };
  const value = parseBlock(lines, state, 0, 0);
  if (state.index !== lines.length) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "unexpected trailing YAML content");
  return value;
}

function formatKey(key) {
  const stringKey = String(key);
  return /^[A-Za-z0-9_.-]+$/.test(stringKey) ? stringKey : JSON.stringify(stringKey);
}

function formatScalar(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw parseError(ERROR_CODES.YAML_PARSE_ERROR, `unsupported scalar type: ${typeof value}`);
}

function emitValue(value, indent, lines, depth = 0) {
  if (depth > YAML_MAX_DEPTH) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, `YAML nesting exceeds ${YAML_MAX_DEPTH} levels`);
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${prefix}[]`);
      return;
    }
    for (const item of value) {
      if (Array.isArray(item) || isPlainObject(item)) {
        if ((Array.isArray(item) && item.length === 0) || (isPlainObject(item) && Object.keys(item).length === 0)) {
          lines.push(`${prefix}- ${Array.isArray(item) ? "[]" : "{}"}`);
          continue;
        }
        if (Array.isArray(item)) {
          lines.push(`${prefix}-`);
          emitValue(item, indent + 2, lines, depth + 1);
          continue;
        }
        const keys = Object.keys(item).sort();
        const first = keys[0];
        const firstValue = item[first];
        if ((Array.isArray(firstValue) && firstValue.length === 0) || (isPlainObject(firstValue) && Object.keys(firstValue).length === 0) || (!Array.isArray(firstValue) && !isPlainObject(firstValue))) {
          const rendered = Array.isArray(firstValue) ? "[]" : isPlainObject(firstValue) ? "{}" : formatScalar(firstValue);
          lines.push(`${prefix}- ${formatKey(first)}: ${rendered}`);
        } else {
          lines.push(`${prefix}- ${formatKey(first)}:`);
          emitValue(firstValue, indent + 4, lines, depth + 1);
        }
        for (const key of keys.slice(1)) {
          const child = item[key];
          if ((Array.isArray(child) && child.length === 0) || (isPlainObject(child) && Object.keys(child).length === 0) || (!Array.isArray(child) && !isPlainObject(child))) {
            const rendered = Array.isArray(child) ? "[]" : isPlainObject(child) ? "{}" : formatScalar(child);
            lines.push(`${" ".repeat(indent + 2)}${formatKey(key)}: ${rendered}`);
          } else {
            lines.push(`${" ".repeat(indent + 2)}${formatKey(key)}:`);
            emitValue(child, indent + 4, lines, depth + 1);
          }
        }
      } else {
        lines.push(`${prefix}- ${formatScalar(item)}`);
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) {
      lines.push(`${prefix}{}`);
      return;
    }
    for (const key of keys) {
      const child = value[key];
      if ((Array.isArray(child) && child.length === 0) || (isPlainObject(child) && Object.keys(child).length === 0) || (!Array.isArray(child) && !isPlainObject(child))) {
        const rendered = Array.isArray(child) ? "[]" : isPlainObject(child) ? "{}" : formatScalar(child);
        lines.push(`${prefix}${formatKey(key)}: ${rendered}`);
      } else {
        lines.push(`${prefix}${formatKey(key)}:`);
        emitValue(child, indent + 2, lines, depth + 1);
      }
    }
    return;
  }
  lines.push(`${prefix}${formatScalar(value)}`);
}

export function serializeYaml(value) {
  const lines = [];
  emitValue(value, 0, lines, 0);
  const output = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(output, "utf8") > YAML_MAX_BYTES) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, `serialized YAML exceeds ${YAML_MAX_BYTES} bytes`);
  return output;
}

export function yamlRoundTrip(value) {
  return parseYaml(serializeYaml(value));
}

export function writeContractYaml(value) {
  const validation = validateContract(value);
  if (!validation.ok) {
    const error = parseError("CONTRACT_INVALID", validation.errors.map((entry) => `${entry.code}@${entry.path}`).join(", "));
    error.errors = validation.errors;
    throw error;
  }
  return serializeYaml(value);
}

export function parseContractYaml(text) {
  const value = parseYaml(text);
  if (!isPlainObject(value)) throw parseError(ERROR_CODES.YAML_PARSE_ERROR, "contract YAML must be a mapping");
  return value;
}

function recordBase(value, fields, prefix = "") {
  const errors = [];
  if (!isPlainObject(value)) return [issue(ERROR_CODES.RECORD_INVALID_TYPE, prefix || "$", "record must be an object")];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field}` : field;
    if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined || value[field] === null || (typeof value[field] === "string" && value[field].trim() === "")) {
      errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, path, `${path} is required`));
    }
  }
  return errors;
}

function validateUrlField(errors, value, field, code = ERROR_CODES.RECORD_UNSAFE_URL) {
  if (value[field] === undefined || value[field] === null) return;
  if (typeof value[field] !== "string" || !value[field].trim()) {
    errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, field, `${field} must be a URL string`));
    return;
  }
  try {
    const status = classifyUrl(value[field]);
    if (status.status !== "clean") errors.push(issue(code, field, `${field} is not safe: ${status.status}`));
  } catch {
    errors.push(issue(code, field, `${field} is malformed`));
  }
}

export function validateSourceRecord(value) {
  const errors = recordBase(value, ["id", "title", "publisher", "url", "source_type", "accessed_at", "authority", "scope_limit", "canonical_source_id", "independence_group", "independence_status"]);
  if (isPlainObject(value)) {
    for (const field of ["published_at", "derived_from", "derivation_kind"]) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, field, `${field} is required`));
    }
    if (value.derived_from !== undefined && !Array.isArray(value.derived_from)) errors.push(issue(ERROR_CODES.RECORD_INVALID_TYPE, "derived_from", "derived_from must be an array"));
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "independence_status", value.independence_status, ["independent", "derived", "unknown", "not_applicable"]);
    validateUrlField(errors, value, "url");
  }
  return result(errors);
}

export function validateEvidenceRecord(value) {
  const errors = recordBase(value, ["id", "source_id", "locator", "excerpt_or_value", "observation", "directness", "evidence_strength", "verified_at", "status"]);
  if (isPlainObject(value)) {
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "directness", value.directness, ["direct", "indirect", "contextual"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "evidence_strength", value.evidence_strength, ["weak", "moderate", "strong"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "status", value.status, ["proposed", "verified", "rejected", "unverified", "quarantined"]);
  }
  return result(errors);
}

export function validateRelationRecord(value) {
  const errors = recordBase(value, ["id", "from_id", "to_id", "relation_type", "entailment", "polarity", "support_role", "rationale", "scope_match", "review_status"]);
  if (isPlainObject(value)) {
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "relation_type", value.relation_type, ["supports", "contradicts", "contextualizes", "qualifies", "duplicates"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "entailment", value.entailment, ["direct", "partial", "indirect", "none"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "polarity", value.polarity, ["positive", "negative", "neutral"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "support_role", value.support_role, ["necessary", "supplementary", "contextual"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "scope_match", value.scope_match, ["full", "partial", "mismatch"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "review_status", value.review_status, ["proposed", "reviewed", "rejected"]);
    if (value.relation_type === "supports" && value.polarity !== "positive") errors.push(issue(ERROR_CODES.RECORD_UNKNOWN_ENUM, "polarity", "supports relations must be positive"));
  }
  return result(errors);
}

export function relationPermitsSupport(value) {
  return isPlainObject(value)
    && value.relation_type === "supports"
    && value.entailment === "direct"
    && value.polarity === "positive"
    && value.scope_match === "full";
}

export function validateClaimRecord(value) {
  const errors = [];
  if (!isPlainObject(value)) return result([issue(ERROR_CODES.RECORD_INVALID_TYPE, "$", "claim must be an object")]);
  for (const field of ["id", "claim", "claim_type", "confidence", "retrieval_status", "support_status", "status"]) {
    const path = field;
    if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined || value[field] === null || (typeof value[field] === "string" && value[field].trim() === "")) errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, path, `${path} is required`));
  }
  if (isPlainObject(value)) {
    for (const field of ["reviewed_by", "reviewed_at"]) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, field, `${field} is required`));
    }
    if (!Array.isArray(value.evidence_ids) || !Array.isArray(value.source_ids) || !Array.isArray(value.counter_evidence_ids) || !Array.isArray(value.limitations)) errors.push(issue(ERROR_CODES.RECORD_INVALID_TYPE, "evidence_ids", "claim evidence/source arrays are required"));
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "claim_type", value.claim_type, ["fact", "evidence_backed_inference", "recommendation", "comparison", "limitation", "method", "unknown"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "confidence", value.confidence, ["low", "medium", "high", "unknown"]);
    enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "support_status", value.support_status, ["proposed", "supported", "corroborated", "disputed", "retracted"]);
    if (value.claim_type === "fact" && (typeof value.fact_subtype !== "string" || !value.fact_subtype.trim())) errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, "fact_subtype", "fact claims require fact_subtype"));
    if (value.claim_type === "recommendation" && value.status === "reviewed" && (!Array.isArray(value.evidence_ids) || value.evidence_ids.length === 0)) errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, "evidence_ids", "reviewed recommendations require evidence"));
  }
  return result(errors);
}

function loadTrustedAuthorities() {
  try {
    const parsed = JSON.parse(readFileSync(new URL("../../schemas/trusted-authorities.json", import.meta.url), "utf8"));
    if (!isPlainObject(parsed) || !Array.isArray(parsed.authorities)) return Object.freeze({ version: null, authorities: Object.freeze([]) });
    return Object.freeze({
      ...parsed,
      authorities: Object.freeze(parsed.authorities.map((authority) => Object.freeze({
        ...authority,
        domains: Array.isArray(authority.domains) ? Object.freeze([...authority.domains]) : authority.domains,
      }))),
    });
  } catch {
    // Missing or invalid registry is fail-closed: official evidence cannot validate.
    return Object.freeze({ version: null, authorities: Object.freeze([]) });
  }
}

export const TRUSTED_AUTHORITIES = loadTrustedAuthorities();

export function validateAuthorityRegistry(value) {
  const errors = [];
  if (!isPlainObject(value)) return result([issue(ERROR_CODES.RECORD_INVALID_TYPE, "$", "authority registry must be an object")]);
  if (value.version !== "1.0") errors.push(issue(ERROR_CODES.RECORD_UNKNOWN_ENUM, "version", "unsupported authority registry version"));
  if (!Array.isArray(value.authorities)) errors.push(issue(ERROR_CODES.RECORD_INVALID_TYPE, "authorities", "authorities must be an array"));
  else {
    const ids = new Set();
    for (const authority of value.authorities) {
      if (!isPlainObject(authority) || typeof authority.id !== "string" || !authority.id || !Array.isArray(authority.domains) || authority.domains.length === 0) {
        errors.push(issue(ERROR_CODES.RECORD_REQUIRED_FIELD, "authorities", "authority needs id and domains"));
        continue;
      }
      if (ids.has(authority.id)) errors.push(issue(ERROR_CODES.RECORD_UNKNOWN_ENUM, "authorities.id", `duplicate authority id: ${authority.id}`));
      ids.add(authority.id);
    }
  }
  return result(errors);
}

const EVENT_REQUIRED_FIELDS = [
  "event_id", "run_id", "contract_hash", "scope_key", "sub_q", "round",
  "query", "requested_hint", "requested_tool", "actual_tool", "fallback_chain",
  "status", "degraded", "degrade_reason", "failure_class", "evidence_capability",
  "requested_url", "returned_url", "final_url", "identity_status", "content_type",
  "content_sha256", "result_count", "raw_path", "cache_key", "cache_hit", "cache_stale",
  "retrieval_status", "trace_coverage", "source_id", "canonical_source_id",
  "parent_event_id", "discovery_evidence_id", "authority_registry_id", "platform",
  "account_or_author", "published_at", "sample_window", "sample_basis", "selection_bias",
  "final_url_status", "independence_group", "evidence_ids", "provider_usage",
  "provider_cost", "usage_status", "elapsed_ms", "captured_at",
];
const EVENT_NON_NULL_FIELDS = [
  "event_id", "run_id", "contract_hash", "scope_key", "sub_q", "round", "query",
  "requested_tool", "actual_tool", "status", "evidence_capability", "identity_status",
  "final_url_status", "usage_status", "captured_at",
];
const EVIDENCE_CAPABILITIES = ["none", "discovery_only", "official_discovery_only", "page_body", "preview_extracted", "social_lead_only", "evidence_grade"];
const FINAL_URL_STATUSES = ["clean", "unsafe_scheme", "credential_present", "loopback", "private", "malformed"];

export function validateEventRecord(value) {
  const errors = [];
  if (!isPlainObject(value)) return result([issue(ERROR_CODES.RECORD_INVALID_TYPE, "$", "event must be an object")]);
  for (const field of EVENT_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined) errors.push(issue(ERROR_CODES.EVENT_REQUIRED_FIELD, field, `${field} is required`));
  }
  for (const field of EVENT_NON_NULL_FIELDS) {
    if (value[field] === null || (typeof value[field] === "string" && value[field].trim() === "")) errors.push(issue(ERROR_CODES.EVENT_REQUIRED_FIELD, field, `${field} is required`));
  }
  if (value.round !== undefined && (!Number.isInteger(value.round) || value.round < 0)) errors.push(issue(ERROR_CODES.EVENT_REQUIRED_FIELD, "round", "round must be a non-negative integer"));
  if (value.contract_hash !== undefined && (typeof value.contract_hash !== "string" || !HASH_RE.test(value.contract_hash))) errors.push(issue(ERROR_CODES.EVENT_CONTRACT_HASH_INVALID, "contract_hash", "contract_hash must be a SHA-256 hex digest"));
  if (value.scope_key !== undefined && (typeof value.scope_key !== "string" || value.scope_key.trim() === "")) errors.push(issue(ERROR_CODES.EVENT_REQUIRED_FIELD, "scope_key", "scope_key must be non-empty"));
  if (value.evidence_capability !== undefined) enumError(errors, ERROR_CODES.RECORD_UNKNOWN_ENUM, "evidence_capability", value.evidence_capability, EVIDENCE_CAPABILITIES);
  if (value.evidence_capability === "evidence_grade" && !value.parent_event_id && !value.discovery_evidence_id) errors.push(issue(ERROR_CODES.EVENT_UNBOUND_FOLLOWUP, "parent_event_id", "evidence-grade follow-up requires parent_event_id or discovery_evidence_id"));
  if (value.authority_registry_id !== undefined && value.authority_registry_id !== null) {
    const known = TRUSTED_AUTHORITIES.authorities.some((authority) => authority.id === value.authority_registry_id);
    if (!known) errors.push(issue(ERROR_CODES.EVENT_UNKNOWN_AUTHORITY, "authority_registry_id", "unknown authority registry id"));
  }
  if (value.platform !== undefined && value.platform !== null) {
    for (const field of ["platform", "published_at", "sample_window", "sample_basis", "selection_bias"]) {
      if (value[field] === undefined || value[field] === null || (typeof value[field] === "string" && value[field].trim() === "")) errors.push(issue(ERROR_CODES.EVENT_COMMUNITY_METADATA_INCOMPLETE, field, `${field} is required for community evidence`));
    }
  }
  if (value.usage_status !== undefined && !["known", "unknown", "partial"].includes(value.usage_status)) errors.push(issue(ERROR_CODES.RECORD_UNKNOWN_ENUM, "usage_status", "invalid usage_status"));
  if (value.usage_status === "unknown" && (value.provider_usage !== null && value.provider_usage !== undefined || value.provider_cost !== null && value.provider_cost !== undefined)) errors.push(issue(ERROR_CODES.EVENT_USAGE_INCONSISTENT, "usage_status", "unknown usage_status cannot carry usage values"));
  if (value.provider_usage !== null && value.provider_usage !== undefined && !isPlainObject(value.provider_usage)) errors.push(issue(ERROR_CODES.EVENT_USAGE_INVALID, "provider_usage", "provider_usage must be an object or null"));
  if (value.provider_cost !== null && value.provider_cost !== undefined && (typeof value.provider_cost !== "number" || !Number.isFinite(value.provider_cost) || value.provider_cost < 0)) errors.push(issue(ERROR_CODES.EVENT_USAGE_INVALID, "provider_cost", "provider_cost must be a finite non-negative number"));
  if (value.final_url_status !== undefined && !FINAL_URL_STATUSES.includes(value.final_url_status)) errors.push(issue(ERROR_CODES.EVENT_FINAL_URL_STATUS_INVALID, "final_url_status", "invalid final_url_status"));
  if (value.final_url !== undefined && value.final_url !== null) {
    const observed = finalUrlStatus(value.final_url);
    if (value.final_url_status === "clean" && observed.status !== "clean") errors.push(issue(ERROR_CODES.EVENT_UNSAFE_FINAL_URL, "final_url", "final_url status contradicts URL safety"));
  }
  if (value.identity_status !== undefined && !["verified", "failed", "unverified"].includes(value.identity_status)) errors.push(issue(ERROR_CODES.RECORD_UNKNOWN_ENUM, "identity_status", "invalid identity_status"));
  if (value.degraded !== undefined && typeof value.degraded !== "boolean") errors.push(issue(ERROR_CODES.RECORD_INVALID_TYPE, "degraded", "degraded must be boolean"));
  return result(errors);
}
