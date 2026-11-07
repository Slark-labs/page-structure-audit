/**
 * Minimal .env loader shared by phase scripts. First-wins: a key already set
 * in the environment (or earlier in the file) is not overwritten. Strips
 * surrounding single/double quotes. Comments (#) and blank lines are skipped.
 *
 * @param {string} [rootDir] directory containing `.env` (defaults to package root).
 */
export function loadDotEnv(rootDir) {
  // Package root = parent of src/ (or cwd override)
  const root = rootDir ?? path.resolve(importDirname(), "..");
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function importDirname() {
  return path.dirname(fileURLToPath(import.meta.url));
}
