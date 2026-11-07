/**
 * page-structure-audit — page section / CTA / trust inventory.
 * Started as homepage inventory; intended to expand to other page types.
 */

export { inventoryHomepage, analyzePage } from "./run.mjs";

export {
  SECTION_TYPE_REFERENCE,
  DEFAULT_INVENTORY_MODEL,
  DEFAULT_INVENTORY_RETRY_MODEL,
  DEFAULT_SECTION_TEXT_MAX,
  DEFAULT_OUTLINE_TEXT_MAX,
  buildSectionOutline,
  normalizeInventory,
  normalizeSectionType,
  isChromeSectionType,
  inventoryNeedsRetry,
  inventorySystemPrompt,
  scanPageSignals,
  countWords,
  bodyWordsFromSections,
  ctaCountFromSections,
  spacedVisibleText,
  unglueHeadingWords,
} from "./inventory.mjs";

export { callLLM, messageTextFromOpenRouter } from "./llm-client.mjs";
export { parseJsonObjectLoose, parseJsonArrayLoose, stripCodeFences } from "./llm-json.mjs";
export { loadDotEnv } from "./load-dotenv.mjs";
