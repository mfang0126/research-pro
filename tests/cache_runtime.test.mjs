import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import * as rootCache from "../scripts/lib/cache.mjs";
import * as nestedCache from "../skills/research-pro/scripts/lib/cache.mjs";
import {
  lookupCache,
  makeCacheRecord,
  appendCacheRecord,
} from "../scripts/lib/cache.mjs";

const CACHE_IMPLEMENTATIONS = [
  ["root", rootCache],
  ["nested", nestedCache],
];

test("record-only combo evidence is preserved and reusable", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-cache-"));
  const file = path.join(home, "search-cache.jsonl");
  const payload = {
    tool: "combo",
    batches: [
      { requested_hint: "video", tool: "youtube", records: [{ id: "video-1" }] },
      { requested_hint: "social", tool: "grok_x", records: [{ id: "social-1" }] },
    ],
    merged_records: [{ id: "video-1" }, { id: "social-1" }],
  };
  const options = {
    query: "combo records",
    hints: ["video", "social"],
    scope_key: "record-combo",
    intention: "video",
  };
  const record = makeCacheRecord(payload, options);
  assert.equal(record.status, "ok");
  assert.equal(record.result_count, 2);
  appendCacheRecord(record, { file });

  const hit = lookupCache(options, { file });
  assert.equal(hit.hit, true);
  assert.deepEqual(hit.result.merged_records, [
    { id: "video-1" },
    { id: "social-1" },
  ]);
});

test("cache result counts deduplicate mixed result and record evidence", () => {
  const record = makeCacheRecord({
    results: [{ id: "same", url: "https://example.com/same" }],
    records: [{ id: "same", url: "https://example.com/same" }, { id: "other" }],
  });
  assert.equal(record.result_count, 2);
});

test("combo freshness considers every hint", () => {
  const record = makeCacheRecord(
    { tool: "combo", results: [{ url: "https://example.com" }] },
    { query: "fresh combo", hints: ["quick", "social"], intention: "quick" },
  );

  assert.equal(record.freshness_class, "dynamic");
});

test("cache lookup derives the hint from the payload when callers omit hints", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-cache-"));
  const file = path.join(home, "search-cache.jsonl");
  const payload = {
    query: "payload hint",
    hint: "quick",
    tool: "tavily",
    results: [{ url: "https://example.com/payload-hint" }],
  };
  const record = makeCacheRecord(payload, { scope_key: "payload-hint" });
  appendCacheRecord(record, { file });

  const hit = lookupCache(
    { query: "payload hint", hint: "quick", scope_key: "payload-hint" },
    { file },
  );
  assert.equal(hit.hit, true);
  assert.equal(hit.result.results[0].url, "https://example.com/payload-hint");
});

test("cache redacts nested secret fields, sensitive URL parameters, and query text", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-cache-"));
  const file = path.join(home, "search-cache.jsonl");
  const secret = "fixture-secret-value";
  const record = makeCacheRecord(
    {
      tool: "fixture",
      token: secret,
      nested: { authorization: secret },
      results: [{ url: `https://example.com/path?token=${secret}` }],
    },
    { query: `query token=${secret}`, hint: "quick" },
  );
  const written = appendCacheRecord(record, { file });
  assert.equal(written.ok, true);
  const text = fs.readFileSync(file, "utf8");
  assert.equal(text.includes(secret), false);
  assert.equal(text.includes(`token=${secret}`), false);
});

test("cache lookup reports unreadable cache paths instead of a normal miss", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-cache-dir-"));
  const result = lookupCache({ query: "fixture", hint: "quick" }, { file: directory });
  assert.equal(result.hit, false);
  assert.equal(result.ok, false);
  assert.ok(result.read_error);
});

for (const [label, implementation] of CACHE_IMPLEMENTATIONS) {
  test(`cache redaction preserves token metrics and removes credential-shaped keys (${label})`, () => {
    const secret = "fixture-secret-value";
    const record = implementation.makeCacheRecord(
      {
        token: secret,
        apiKey: secret,
        apikey: secret,
        APIKey: secret,
        APIToken: secret,
        providerAPIToken: secret,
        IDToken: secret,
        APITokens: [secret],
        providerAPITokens: [secret],
        IDTokens: [secret],
        authentication: secret,
        providerAPIKeys: [secret],
        clientSecrets: secret,
        clientSecret: secret,
        client_secret: secret,
        TAVILY_API_KEY: secret,
        vendor_api_key: secret,
        oauth_client_secret: secret,
        x_auth_token: secret,
        "x-api-key": secret,
        "set-cookie": secret,
        "access-token": secret,
        credentials: [secret],
        cookies: [secret],
        apiKeys: [secret],
        sessionid: secret,
        tokens: [secret],
        token_count: 7,
        tokenCount: 8,
        metrics: { token_count: 9 },
        usage: {
          prompt_tokens_details: { cached_tokens: 7, apiKey: secret },
          completion_tokens_details: { reasoning_tokens: 2, credentials: [secret] },
        },
        author: "Ada Lovelace",
        authors: ["Ada Lovelace"],
        authority: "SQLite",
        authority_registry_id: "sqlite-official",
        nested: { privateKey: secret },
      },
      { query: "key normalization", hint: "quick" },
    );

    assert.equal(record.payload.token, undefined);
    assert.equal(record.payload.apiKey, undefined);
    assert.equal(record.payload.apikey, undefined);
    assert.equal(record.payload.APIKey, undefined);
    assert.equal(record.payload.clientSecret, undefined);
    assert.equal(record.payload.client_secret, undefined);
    assert.equal(record.payload.TAVILY_API_KEY, undefined);
    assert.equal(record.payload.vendor_api_key, undefined);
    assert.equal(record.payload.oauth_client_secret, undefined);
    assert.equal(record.payload.x_auth_token, undefined);
    assert.equal(record.payload["x-api-key"], undefined);
    assert.equal(record.payload["set-cookie"], undefined);
    assert.equal(record.payload.tokens, undefined);
    assert.equal(record.payload.credentials, undefined);
    assert.equal(record.payload.cookies, undefined);
    assert.equal(record.payload.apiKeys, undefined);
    assert.equal(record.payload.sessionid, undefined);
    assert.equal(record.payload["access-token"], undefined);
    assert.deepEqual(record.payload.nested, {});
    assert.equal(record.payload.token_count, 7);
    assert.equal(record.payload.tokenCount, 8);
    assert.deepEqual(record.payload.metrics, { token_count: 9 });
    assert.equal(record.payload.usage.prompt_tokens_details.cached_tokens, 7);
    assert.equal(record.payload.usage.prompt_tokens_details.apiKey, undefined);
    assert.equal(record.payload.usage.completion_tokens_details.reasoning_tokens, 2);
    assert.equal(record.payload.usage.completion_tokens_details.credentials, undefined);
    assert.equal(record.payload.author, "Ada Lovelace");
    assert.deepEqual(record.payload.authors, ["Ada Lovelace"]);
    assert.equal(record.payload.authority, "SQLite");
    assert.equal(record.payload.authority_registry_id, "sqlite-official");
    assert.equal(JSON.stringify(record).includes(secret), false);
  });

  test(`cache lookup sanitizes legacy records and URL userinfo (${label})`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-cache-legacy-"));
    const file = path.join(home, "search-cache.jsonl");
    const secret = "fixture-secret-value";
    const options = { query: "legacy cache", hint: "quick" };
    const legacy = {
      cache_key: implementation.cacheKey({
        query: options.query,
        hints: [options.hint],
        intention: options.hint,
        freshness_class: "stable",
      }),
      query: `legacy https://legacy-user:${secret}@example.com/search`,
      hint: options.hint,
      status: "ok",
      degraded: false,
      retrieved_at: new Date().toISOString(),
      freshness_class: "stable",
      freshness_ttl_seconds: 86_400,
      raw: `legacy raw ${secret}`,
      payload: {
        raw: `legacy payload ${secret}`,
        headers: { authorization: secret },
        token_count: 7,
        apiKey: secret,
        credentials: [secret],
        cookies: [secret],
        apiKeys: [secret],
        sessionid: secret,
        usage: {
          prompt_tokens_details: { cached_tokens: 11, credentials: [secret] },
          completion_tokens_details: { reasoning_tokens: 12, apiKey: secret },
        },
        author: "Legacy Author",
        authority: "Legacy Authority",
        content: `body https://body-user:${secret}@example.com/body and https://u:pa@ss@example.com/body ftp://ftp-user:ftp-pass@example.com/file postgresql://db-user:db-pass@example.com/database`,
        results: [{
          url: `https://user:${secret}@example.com/path?token=${secret}`,
          details: { a: { b: { c: { d: { metric: 7 } } } } },
        }],
      },
    };
    fs.writeFileSync(file, `${JSON.stringify(legacy)}\n`, "utf8");

    const hit = implementation.lookupCache(options, { file });
    assert.equal(hit.hit, true);
    assert.equal(hit.result.token_count, 7);
    assert.equal(hit.result.credentials, undefined);
    assert.equal(hit.result.cookies, undefined);
    assert.equal(hit.result.apiKeys, undefined);
    assert.equal(hit.result.sessionid, undefined);
    assert.equal(hit.result.usage.prompt_tokens_details.cached_tokens, 11);
    assert.equal(hit.result.usage.prompt_tokens_details.credentials, undefined);
    assert.equal(hit.result.usage.completion_tokens_details.reasoning_tokens, 12);
    assert.equal(hit.result.usage.completion_tokens_details.apiKey, undefined);
    assert.equal(hit.result.author, "Legacy Author");
    assert.equal(hit.result.authority, "Legacy Authority");
    assert.equal(hit.result.results[0].url, "https://example.com/path");
    assert.equal(hit.result.results[0].details.a.b.c.d.metric, 7);
    assert.equal(JSON.stringify(hit).includes(secret), false);
    assert.doesNotMatch(JSON.stringify(hit), /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s?#]*@/);
    assert.equal(JSON.stringify(hit).includes("legacy raw"), false);
    assert.equal(JSON.stringify(hit).includes("authorization"), false);
  });

  test(`cache writes strip transient fields from extracted result and record entries (${label})`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "research-pro-cache-write-"));
    const file = path.join(home, "search-cache.jsonl");
    const secret = "fixture-secret-value";
    const record = implementation.makeCacheRecord(
      {
        results: [{
          url: "https://example.com/result",
          token_count: 1,
          raw: `result raw ${secret}`,
          headers: { authorization: secret },
          request: { apiKey: secret },
        }],
        records: [{
          id: "record-1",
          token_count: 2,
          raw_text: `record raw ${secret}`,
          response_headers: { authorization: secret },
          request: { accessToken: secret },
        }],
        batches: [{
          results: [{ url: "https://example.com/batch", raw: `batch raw ${secret}` }],
          records: [{ id: "batch-record", headers: { authorization: secret } }],
        }],
        content: `write body https://write-user:${secret}@example.com/body`,
      },
      { query: `write extraction https://query-user:${secret}@example.com/query`, hint: "quick" },
    );
    const written = implementation.appendCacheRecord(record, { file });
    assert.equal(written.ok, true);
    const persisted = fs.readFileSync(file, "utf8");
    assert.equal(persisted.includes(secret), false);
    assert.equal(persisted.includes("result raw"), false);
    assert.equal(persisted.includes("record raw"), false);
    assert.equal(persisted.includes("batch raw"), false);
    assert.equal(persisted.includes("authorization"), false);
    assert.doesNotMatch(persisted, /https:\/\/[^/\s@]+@/);
    assert.equal(persisted.includes('"token_count":1'), true);
    assert.equal(persisted.includes('"token_count":2'), true);
  });
}
