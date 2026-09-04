import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFinalUrl,
  sanitizeFinalUrl,
  sanitizePublicOutput,
  validatePublicOutput,
  retainRawPayload,
} from "../scripts/lib/source_integrity.mjs";

test("unsafe final URLs are rejected without retaining secrets", () => {
  const cases = [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///Users/alice/private.txt",
    "https://user:secret@example.com/path",
    "http://10.0.0.4/internal",
    "https://example.com/?access_token=secret",
  ];
  for (const url of cases) {
    const result = classifyFinalUrl(url);
    assert.equal(result.final_url_status, "rejected", url);
    assert.ok(!String(result.sanitized_url || "").includes("secret"), url);
  }
});

test("approved public URL is preserved and public text is redacted", () => {
  const url = "https://example.com/docs?q=ghostty";
  const result = classifyFinalUrl(url);
  assert.equal(result.final_url_status, "ok");
  assert.equal(result.sanitized_url, url);
  const output = sanitizePublicOutput({ url: result.sanitized_url, text: "token=do-not-leak /home/alice/file" });
  assert.equal(validatePublicOutput(output).ok, true);
  assert.ok(!JSON.stringify(output).includes("do-not-leak"));
  assert.ok(!JSON.stringify(output).includes("/home/alice"));
});

test("raw truncation output remains parseable JSON", () => {
  const result = retainRawPayload(JSON.stringify({ content: "x".repeat(1000) }), { maxBytes: 220 });
  assert.equal(result.truncated, true);
  assert.doesNotThrow(() => JSON.parse(result.content));
});
