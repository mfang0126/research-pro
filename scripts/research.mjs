#!/usr/bin/env node
/**
 * Tavily Research API — credentials via resolveKey (never prints secrets).
 *
 * Usage:
 *   node scripts/research.mjs '{"input":"query","model":"auto"}' [output_file]
 *   ./research.sh '...'   # thin wrapper → this file
 */
import fs from "node:fs";
import { resolveKey } from "./lib/credentials.mjs";

function usage() {
  console.error(`Usage: node research.mjs '<json>' [output_file]

Required JSON field:
  input: string

Optional:
  model: mini | pro | auto (default)
  citation_format: numbered | mla | apa | chicago
  output_schema: object

Credentials: TAVILY_API_KEY via process.env or credentials.mjs (never override).
Doctor: node scripts/doctor.mjs`);
  process.exit(1);
}

const jsonInputRaw = process.argv[2];
const outputFile = process.argv[3];
if (!jsonInputRaw) usage();

let body;
try {
  body = JSON.parse(jsonInputRaw);
} catch {
  console.error("Error: Invalid JSON input");
  process.exit(1);
}
if (!body || typeof body.input !== "string" || !body.input.trim()) {
  console.error("Error: 'input' field is required");
  process.exit(1);
}

const apiKey = resolveKey("TAVILY_API_KEY").value;
if (!apiKey) {
  console.error("Error: TAVILY_API_KEY not set");
  console.error("Run: node scripts/doctor.mjs  (see SETUP.md)");
  process.exit(1);
}

// Defaults (streaming off for token management)
if (body.stream === undefined) body.stream = false;
if (body.citation_format == null) body.citation_format = "numbered";

const model = body.model ?? "auto";
console.error(`Researching: ${body.input} (model: ${model})`);
console.error("This may take 30-120 seconds...");

async function postResearch(payload) {
  const res = await fetch("https://api.tavily.com/research", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "x-client-source": "research-pro-skill",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    throw new Error(`Tavily research HTTP ${res.status}: ${text.slice(0, 800)}`);
  }
  return data;
}

async function poll(requestId) {
  const maxAttempts = 36;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`https://api.tavily.com/research/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Poll non-JSON: ${text.slice(0, 400)}`);
    }
    const status = data.status ?? "error";
    if (status === "completed") {
      console.error("Research completed!");
      return data;
    }
    if (status === "error" || status === "failed") {
      throw new Error(`Research failed: ${text.slice(0, 800)}`);
    }
    console.error(`Still researching... (attempt ${attempt}/${maxAttempts})`);
  }
  throw new Error(`Research timed out after 180s (request_id: ${requestId})`);
}

let data = await postResearch(body);
const status = data.status ?? "completed";
if (status === "pending") {
  const requestId = data.request_id;
  console.error(`Research initiated (request_id: ${requestId}), polling...`);
  data = await poll(requestId);
}

const out = JSON.stringify(data, null, 2);
if (outputFile) {
  fs.writeFileSync(outputFile, out);
  console.error(`Results saved to: ${outputFile}`);
} else {
  console.log(out);
}
