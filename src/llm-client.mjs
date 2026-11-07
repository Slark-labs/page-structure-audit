/**
 * Minimal OpenRouter chat helper for small JSON-oriented prompts (e.g. section digest).
 * Optional **vision**: pass `imagePaths` for one or more local PNG/JPEG files (base64 data URLs).
 */

import fs from "node:fs";
import path from "node:path";

import { openRouterHttpReferer } from "./openrouter-headers.mjs";

/**
 * Assistant text from chat/completions: string content, multipart content, or
 * `reasoning_content`/`reasoning` fallback (reasoning models that omit `content`).
 * Always returns a string ("" when missing) and trims the content result.
 * @param {unknown} data
 * @returns {string}
 */
export function messageTextFromOpenRouter(data) {
  const choice = data?.choices?.[0];
  const msg = choice?.message;
  if (!msg || typeof msg !== "object") return "";
  const m = /** @type {Record<string, unknown>} */ (msg);
  const fromContent = openRouterContentToString(m.content).trim();
  if (fromContent) return fromContent;
  for (const k of ["reasoning_content", "reasoning"]) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** @param {unknown} content */
function openRouterContentToString(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const p of content) {
    if (typeof p === "string") parts.push(p);
    else if (p && typeof p === "object") {
      const o = /** @type {Record<string, unknown>} */ (p);
      if (typeof o.text === "string") parts.push(o.text);
      else if (o.type === "text" && typeof o.text === "string") parts.push(o.text);
    }
  }
  return parts.join("");
}

/**
 * @param {{
 *   system: string,
 *   message: string,
 *   apiKey: string,
 *   model: string,
 *   maxTokens?: number,
 *   timeoutMs?: number,
 *   imagePaths?: string[],
 *   maxImageBytesPerFile?: number,
 *   onUsage?: (usage: object) => void,
 * }} opts
 * @returns {Promise<string>} assistant text (caller parses JSON)
 */
export async function callLLM(opts) {
  const { system, message, apiKey, model } = opts;
  const maxTokens =
    typeof opts.maxTokens === "number" && opts.maxTokens > 0 ? opts.maxTokens : 1500;
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs > 0 ? opts.timeoutMs : 90_000;
  const maxImageBytes =
    typeof opts.maxImageBytesPerFile === "number" && opts.maxImageBytesPerFile > 0
      ? opts.maxImageBytesPerFile
      : 6 * 1024 * 1024;

  const key = apiKey?.trim();
  if (!key) throw new Error("callLLM: apiKey is required");

  /** @type {unknown} */
  let userContent = message ?? "";
  const paths = Array.isArray(opts.imagePaths) ? opts.imagePaths : [];
  if (paths.length > 0) {
    /** @type {{ type: string, text?: string, image_url?: { url: string } }[]} */
    const parts = [];
    if (message && String(message).trim()) {
      parts.push({ type: "text", text: String(message) });
    }
    for (const p of paths) {
      if (typeof p !== "string" || !p.trim()) continue;
      const abs = path.resolve(p.trim());
      if (!fs.existsSync(abs)) continue;
      const st = fs.statSync(abs);
      if (st.size > maxImageBytes) {
        parts.push({
          type: "text",
          text: `[screenshot omitted: file too large ${st.size} bytes > ${maxImageBytes}]`,
        });
        continue;
      }
      const buf = fs.readFileSync(abs);
      const lower = abs.toLowerCase();
      const mime = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
            ? "image/jpeg"
            : "image/jpeg";
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${buf.toString("base64")}` },
      });
    }
    if (parts.some((x) => x.type === "image_url")) {
      userContent = parts;
    }
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": openRouterHttpReferer(),
        "X-Title": "page-structure-audit",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        usage: { include: true },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${res.status}: ${t.slice(0, 400)}`);
    }
    const data = await res.json();
    if (data && typeof data.usage === "object" && data.usage) {
      try {
        opts.onUsage?.(/** @type {object} */ (data.usage));
      } catch { /* callback errors are non-fatal */ }
    }
    const txt = messageTextFromOpenRouter(data);
    if (!txt?.trim()) throw new Error("OpenRouter response missing message content");
    return txt.trim();
  } finally {
    clearTimeout(tid);
  }
}
