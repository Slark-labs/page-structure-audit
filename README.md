# page-structure-audit

Turn a live page URL into a structured **section / CTA / trust** inventory JSON (Playwright + OpenRouter).

Started as homepage inventory extracted from the `wp-to-clean-static` pipeline. The library API is meant to expand to other page types (landing, services, contact, etc.) while keeping the same inventory shape.

## Install

```bash
npm install github:sllark/page-structure-audit
npx playwright install chromium
# or from this repo: npm run prepare:browser
```

Requires **Node 18+** and `OPENROUTER_API_KEY`.

## Library

```js
import { analyzePage, inventoryHomepage } from "page-structure-audit";

// Preferred name going forward:
const result = await analyzePage("https://example.com", {
  apiKey: process.env.OPENROUTER_API_KEY,
  // model: "google/gemini-3-flash-preview",
  // retryModel: "z-ai/glm-4.6v",
  // skipScreenshot: false,
  // sectionTextMax: 2000,
  // outlineTextMax: 40000,
  // timeoutMs: 180000,
  // outDir: "./tmp/psa-run",   // alias: workDir
  // onLog: (msg, extra) => console.error(msg, extra ?? ""),
  // onUsage: (usage) => console.error(usage),
});

// Alias kept for callers that started with homepage inventory:
// const result = await inventoryHomepage("https://example.com", { ... });

console.log(result.sections);
```

## CLI

```bash
cp env.example .env   # add OPENROUTER_API_KEY
npx page-structure-audit --url https://example.com/
# or: npx psa --url https://example.com/ --out ./out.json
npm run audit -- --url https://example.com/
```

## Env

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Required |
| `OPENROUTER_MODEL_INVENTORY` | Primary model (default `google/gemini-3-flash-preview`) |
| `OPENROUTER_MODEL_INVENTORY_RETRY` | Soft-gate retry (default `z-ai/glm-4.6v`) |
| `INVENTORY_TIMEOUT_MS` | LLM timeout (default `180000`) |
| `INVENTORY_SKIP_SCREENSHOT` | `1` / `true` to skip full-page shot |
| `INVENTORY_SECTION_TEXT_MAX` | Per-band text cap (default `2000`) |
| `INVENTORY_OUTLINE_TEXT_MAX` | Total outline text cap (default `40000`) |
| `CAPTURE_URL` / `SITE_URL` | Default URL if `--url` omitted |
| `OPENROUTER_HTTP_REFERER` | Optional OpenRouter referer header |

See `env.example`.

## Output shape

```json
{
  "url": "https://example.com",
  "fetched": true,
  "renderMode": "static",
  "totalWords": 1240,
  "bodyWords": 1100,
  "sections": [
    {
      "position": 1,
      "type": "hero",
      "heading": "…",
      "headingLevel": "h1",
      "wordCount": 45,
      "elements": ["cta_call", "cta_form"],
      "trustSignals": ["licensed_insured"]
    }
  ],
  "phonePlacement": ["header", "hero"],
  "ctaCount": { "call": 5, "form": 2, "quote": 1 },
  "trustSignals": ["licensed_insured"],
  "confidence": 0.94,
  "errors": []
}
```

- `totalWords` = sum of all section `wordCount`s (includes header/footer/sticky).
- `bodyWords` = same sum excluding chrome (`header`, `footer`, `sticky`, …).
- `type` is freeform (suggested names provided to the model; custom names allowed).
