#!/usr/bin/env node
// Compatibility entrypoint: validate packaging, not agent research behavior.
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function main() {
  const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
  const version = skill.match(/^version:\s*(\S+)/m)?.[1];
  assert(version, "missing skill version");
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  assert(readme.includes(version), "README does not identify the current version");
  const mirrorRoot = path.join(root, "skills/research-pro");
  const hasMirror = await stat(mirrorRoot).then((entry) => entry.isDirectory()).catch((error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  if (process.argv.includes("--require-mirror")) assert(hasMirror, "required mirror missing");
  const files = ["SKILL.md", "README.md", "evals/test_prompts.json", "evals/validate_contract_gate.mjs"];
  for (const file of await readdir(path.join(root, "references"))) {
    if (file.endsWith(".md")) files.push(`references/${file}`);
  }
  for (const relative of files) {
    const content = await readFile(path.join(root, relative));
    if (hasMirror) {
      const mirror = await readFile(path.join(mirrorRoot, relative));
      assert(content.equals(mirror), `mirror differs: ${relative}`);
    }
    if (!relative.endsWith(".md")) continue;
    for (const match of content.toString().matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
      await readFile(path.resolve(root, path.dirname(relative), target));
    }
  }
  const fixtures = JSON.parse(await readFile(path.join(root, "evals/test_prompts.json"), "utf8"));
  const ids = new Set();
  for (const fixture of fixtures.evals) {
    assert(!ids.has(fixture.id), `duplicate prompt id: ${fixture.id}`);
    ids.add(fixture.id);
    assert(fixture.prompt?.trim(), `missing prompt: ${fixture.id}`);
  }
  console.log(`OK: intent document packaging; mirror ${hasMirror ? "checked" : "not present (standalone package)"}. Agent behavior NOT evaluated. Legacy contract tests live in the repository tests/ directory.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
