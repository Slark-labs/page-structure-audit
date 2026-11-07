/** OpenRouter asks for Referer; keep configurable for any deployment (no repo-specific default). */
export function openRouterHttpReferer() {
  const r = process.env.OPENROUTER_HTTP_REFERER?.trim();
  return r || "http://localhost";
}
