#!/usr/bin/env node
/**
 * CLI: page-structure-audit --url https://example.com/ [--out ./out.json]
 * Alias: psa
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inventoryHomepage, loadDotEnv } from "./index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
loadDotEnv(ROOT);

function log(msg, extra = "") {
  console.error(`[psa] ${msg}${extra ? ` ${extra}` : ""}`);
}

function parseArgs(argv) {
  let url = process.env.CAPTURE_URL?.trim() || process.env.SITE_URL?.trim() || "";
  let outPath = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url" && argv[i + 1]) url = argv[++i].trim();
    else if (argv[i] === "--out" && argv[i + 1]) outPath = path.resolve(argv[++i]);
  }
  if (!url) {
    console.error(
      "Usage: page-structure-audit --url https://example.com/ [--out file.json]\n       psa --url https://example.com/",
    );
    process.exit(1);
  }
  return { url, outPath };
}

async function main() {
  const { url, outPath } = parseArgs(process.argv.slice(2));
  const host = (() => {
    try {
      return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(
        /^www\./,
        "",
      );
    } catch {
      return "site";
    }
  })();
  const workDir = path.join(ROOT, "runs", host.replace(/[^a-z0-9.-]+/gi, "-"));
  const dest = outPath || path.join(workDir, "page-structure-audit.json");

  const inventory = await inventoryHomepage(url, {
    workDir,
    headed: process.env.CAPTURE_HEADED === "1",
    onLog: log,
  });

  const { _meta, ...publicInventory } = inventory;
  if (_meta) log("model", _meta.model);

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(publicInventory, null, 2)}\n`, "utf8");
  log("wrote", dest);
  console.log(JSON.stringify(publicInventory, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
