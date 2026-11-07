/**
 * Core runner: Playwright fetch + OpenRouter analysis → inventory JSON.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { load } from "cheerio";
import { chromium } from "playwright";

import { callLLM } from "./llm-client.mjs";
import { parseJsonObjectLoose } from "./llm-json.mjs";
import {
  DEFAULT_INVENTORY_MODEL,
  DEFAULT_INVENTORY_RETRY_MODEL,
  DEFAULT_OUTLINE_TEXT_MAX,
  DEFAULT_SECTION_TEXT_MAX,
  buildSectionOutline,
  inferRenderMode,
  inventoryNeedsRetry,
  inventorySystemPrompt,
  normalizeInventory,
  scanPageSignals,
} from "./inventory.mjs";

/**
 * @param {import('playwright').Page} page
 */
async function pageWordCount(page) {
  return page.evaluate(() => {
    const t = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    if (!t) return 0;
    return t.split(" ").filter(Boolean).length;
  });
}

/**
 * @param {object[]} outline
 * @param {string[]} errors
 */
function outlineFallback(outline, errors) {
  return {
    sections: outline.map((o, i) => ({
      position: i + 1,
      type: /header|banner/i.test(o.tag + o.classes)
        ? "header"
        : /footer|contentinfo/i.test(o.tag + o.classes)
          ? "footer"
          : "generic",
      heading: o.heading || "",
      headingLevel: o.headingLevel,
      wordCount: o.wordCount,
      elements: [],
      trustSignals: [],
    })),
    confidence: 0.25,
    errors: [...errors],
  };
}

/**
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   timeoutMs: number,
 *   userPayload: object,
 *   imagePaths?: string[],
 *   onLog?: (msg: string, extra?: string) => void,
 *   onUsage?: (usage: object) => void,
 * }} opts
 */
async function callInventoryModel(opts) {
  const log = opts.onLog || (() => {});
  const response = await callLLM({
    system: inventorySystemPrompt(),
    message: `Analyze this page and return the inventory JSON object.\n\n${JSON.stringify(opts.userPayload, null, 2)}`,
    apiKey: opts.apiKey,
    model: opts.model,
    maxTokens: 4500,
    timeoutMs: opts.timeoutMs,
    imagePaths: opts.imagePaths,
    onUsage: (u) => {
      log(
        "usage",
        `${opts.model} in=${u.prompt_tokens ?? u.input_tokens ?? "?"} out=${u.completion_tokens ?? u.output_tokens ?? "?"} cost=${u.cost != null ? `$${Number(u.cost).toFixed(5)}` : "?"}`,
      );
      try {
        opts.onUsage?.(u);
      } catch {
        /* callback errors are non-fatal */
      }
    },
  });
  return parseJsonObjectLoose(response, "page structure audit");
}

/**
 * Inventory a page URL (homepage-oriented today; expanding to other page types).
 *
 * @param {string} url
 * @param {{
 *   apiKey?: string,
 *   model?: string,
 *   retryModel?: string,
 *   timeoutMs?: number,
 *   skipScreenshot?: boolean,
 *   sectionTextMax?: number,
 *   outlineTextMax?: number,
 *   workDir?: string,
 *   outDir?: string,
 *   headed?: boolean,
 *   onLog?: (msg: string, extra?: string) => void,
 *   onUsage?: (usage: object) => void,
 * }} [opts]
 * @returns {Promise<object>} inventory JSON
 */
export async function inventoryHomepage(url, opts = {}) {
  let target = String(url || "").trim();
  if (!target) throw new Error("inventoryHomepage: url is required");
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  const apiKey = (opts.apiKey || process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new Error("inventoryHomepage: apiKey / OPENROUTER_API_KEY required");

  const model =
    opts.model?.trim() ||
    process.env.OPENROUTER_MODEL_INVENTORY?.trim() ||
    DEFAULT_INVENTORY_MODEL;
  const retryModel =
    opts.retryModel?.trim() ||
    process.env.OPENROUTER_MODEL_INVENTORY_RETRY?.trim() ||
    DEFAULT_INVENTORY_RETRY_MODEL;
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs >= 30_000
      ? opts.timeoutMs
      : Number(process.env.INVENTORY_TIMEOUT_MS) >= 30_000
        ? Number(process.env.INVENTORY_TIMEOUT_MS)
        : 180_000;
  const skipShot =
    opts.skipScreenshot === true ||
    ["1", "true", "yes", "on"].includes(
      String(process.env.INVENTORY_SKIP_SCREENSHOT || "")
        .trim()
        .toLowerCase(),
    );
  const sectionTextMax =
    typeof opts.sectionTextMax === "number" && opts.sectionTextMax >= 200
      ? opts.sectionTextMax
      : DEFAULT_SECTION_TEXT_MAX;
  const outlineTextMax =
    typeof opts.outlineTextMax === "number" && opts.outlineTextMax >= 2000
      ? opts.outlineTextMax
      : DEFAULT_OUTLINE_TEXT_MAX;

  const log = opts.onLog || (() => {});
  const onUsage = opts.onUsage;
  const workRoot =
    opts.outDir ||
    opts.workDir ||
    path.join(os.tmpdir(), "page-structure-audit", String(Date.now()));
  const shotDir = path.join(workRoot, "capture");
  fs.mkdirSync(shotDir, { recursive: true });

  log("URL", target);
  log("models", `primary=${model} retry=${retryModel}`);

  /** @type {string[]} */
  const errors = [];
  let html = "";
  let earlyWords = 0;
  let settledWords = 0;
  /** @type {string | null} */
  let screenshotPath = null;

  const browser = await chromium.launch({ headless: opts.headed !== true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    log("goto", target);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 120_000 });
    earlyWords = await pageWordCount(page);
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      /* analytics / websockets often block networkidle */
    }
    await page.waitForTimeout(800);
    settledWords = await pageWordCount(page);
    html = await page.content();

    if (!skipShot) {
      const pngPath = path.join(shotDir, "desktop-full.png");
      const jpgPath = path.join(shotDir, "desktop-full-llm.jpg");
      log("screenshot", "full page…");
      await page.screenshot({ path: pngPath, fullPage: true, type: "png" });
      try {
        const sharpMod = await import("sharp");
        await sharpMod.default(pngPath).jpeg({ quality: 78, mozjpeg: true }).toFile(jpgPath);
        screenshotPath = jpgPath;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`jpeg derivative failed: ${msg.slice(0, 120)}`);
        screenshotPath = pngPath;
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const $ = load(html, { decodeEntities: false });
  $("script, style, noscript").remove();
  const renderMode = inferRenderMode(html, {
    earlyWordCount: earlyWords,
    settledWordCount: settledWords,
  });
  const signals = scanPageSignals($);
  const outline = buildSectionOutline($, { sectionTextMax, outlineTextMax });
  const outlineWords = outline.reduce((n, r) => n + (Number(r.wordCount) || 0), 0);

  log(
    "page",
    `outlineWords=${outlineWords} renderMode=${renderMode} outlineBands=${outline.length} phones=${signals.phonePlacement.join(",") || "none"}`,
  );

  const userPayload = {
    url: target.replace(/\/$/, ""),
    renderModeHint: renderMode,
    outlineWords,
    deterministicSignals: signals,
    outline,
  };

  const imagePaths = screenshotPath ? [screenshotPath] : undefined;
  /** @type {string} */
  let usedModel = model;
  /** @type {object} */
  let rawObj;

  try {
    log("LLM", `primary ${model}${imagePaths ? " + screenshot" : ""}…`);
    rawObj = await callInventoryModel({
      apiKey,
      model,
      timeoutMs,
      userPayload,
      imagePaths,
      onLog: log,
      onUsage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`primary LLM failed (${model}): ${msg}`);
    log("primary failed", msg.slice(0, 200));
    rawObj = outlineFallback(outline, errors);
  }

  let inventory = normalizeInventory(rawObj, {
    url: target,
    totalWords: outlineWords,
    renderMode,
    signals,
    errors: [...errors],
  });

  const shouldRetry =
    retryModel && retryModel !== model && inventoryNeedsRetry(inventory);

  if (shouldRetry) {
    log("retry", `soft gate failed → ${retryModel}`);
    try {
      const retryRaw = await callInventoryModel({
        apiKey,
        model: retryModel,
        timeoutMs,
        userPayload,
        imagePaths,
        onLog: log,
        onUsage,
      });
      const retryInventory = normalizeInventory(retryRaw, {
        url: target,
        totalWords: outlineWords,
        renderMode,
        signals,
        errors: [],
      });
      usedModel = retryModel;
      inventory = retryInventory;
      inventory.errors = [
        ...errors,
        `escalated from ${model} → ${retryModel}`,
        ...(inventory.errors || []),
      ];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      inventory.errors = [
        ...(inventory.errors || []),
        `retry LLM failed (${retryModel}): ${msg}`,
      ];
      log("retry failed — keeping primary/fallback", msg.slice(0, 200));
    }
  }

  inventory.errors = [...new Set((inventory.errors || []).filter(Boolean))];
  inventory._meta = { model: usedModel, workDir: workRoot };
  return inventory;
}

/** Preferred alias — same as {@link inventoryHomepage}. */
export const analyzePage = inventoryHomepage;
