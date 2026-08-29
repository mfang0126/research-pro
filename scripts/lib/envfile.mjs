/**
 * Minimal KEY=VALUE dotenv parser (no dependency).
 * - Supports export KEY=VALUE
 * - Supports single/double quotes
 * - Ignores comments and blank lines
 * - Does not expand variables
 */

import fs from "node:fs";

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!text) return out;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      // strip inline comment for unquoted values: KEY=foo # comment
      const hash = val.indexOf(" #");
      if (hash >= 0) val = val.slice(0, hash).trim();
    }

    out[key] = val;
  }
  return out;
}

/**
 * @param {string} filePath
 * @returns {Record<string, string> | null}
 */
export function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf8");
    return parseEnvText(text);
  } catch {
    return null;
  }
}
