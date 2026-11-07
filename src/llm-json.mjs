/**
 * Shared JSON helpers for OpenRouter model responses: fence stripping, tolerant
 * array parsing, and selector-id extraction. Used by section detection + gap-fill.
 */

/**
 * Strip leading/trailing ```json fences from a model response.
 * @param {string} raw
 * @returns {string}
 */
export function stripCodeFences(raw) {
  return String(raw)
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/im, "");
}

/**
 * Tolerant parse of a JSON array from a model response: strip fences, JSON.parse,
 * and on failure retry on the substring between the first `[` and last `]`.
 * Unwraps `{ sections: [] }` wrappers.
 * @param {string} raw
 * @param {string} [label] used in error messages
 * @returns {unknown[]}
 */
export function parseJsonArrayLoose(raw, label = "model response") {
  const cleaned = stripCodeFences(raw).trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error(`Could not parse JSON array from ${label}`);
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(/** @type {any} */ (parsed).sections)) {
    return /** @type {any} */ (parsed).sections;
  }
  throw new Error(`${label} JSON was not an array or { sections: [] }`);
}

/**
 * Tolerant parse of a JSON object from a model response: strip fences, JSON.parse,
 * and on failure retry on the substring between the first `{` and last `}`.
 * @param {string} raw
 * @param {string} [label]
 * @returns {Record<string, unknown>}
 */
export function parseJsonObjectLoose(raw, label = "model response") {
  const cleaned = stripCodeFences(raw).trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error(`Could not parse JSON object from ${label}`);
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} JSON was not an object`);
  }
  return /** @type {Record<string, unknown>} */ (parsed);
}

/**
 * First valid HTML id hash in a selector (any position), e.g. `body .wrap #hero > div`.
 * Used as a hint for `resolveUniqueSelector` when the model omits `id`.
 * @param {string} sel
 * @returns {string | null}
 */
export function firstIdFromSelector(sel) {
  const re = /#([a-zA-Z_][\w-]*)/g;
  let m;
  while ((m = re.exec(sel)) !== null) {
    const id = m[1];
    if (id && /^[a-zA-Z_][\w-]*$/.test(id)) return id;
  }
  return null;
}
