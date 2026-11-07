/**
 * Homepage section inventory — content/CTA/trust analysis (not pipeline BEM capture).
 * Produces the audit JSON schema used for homepage structure reviews.
 */

import { load } from "cheerio";

/**
 * Suggested section names for the LLM (examples only — freeform names are allowed
 * when content fits none of these well).
 */
export const SECTION_TYPE_REFERENCE = [
  "hero",
  "services",
  "about",
  "process",
  "testimonials",
  "faq",
  "blog-preview",
  "portfolio",
  "pricing",
  "cta",
  "form",
  "trust",
  "social-proof",
  "why_us",
  "team",
  "gallery",
  "map",
  "contact",
  "header",
  "footer",
  "divider",
  "generic",
];

/** Default caps for outline text sent to the inventory LLM. */
export const DEFAULT_SECTION_TEXT_MAX = 2000;
export const DEFAULT_OUTLINE_TEXT_MAX = 40_000;

/** Common model synonyms → preferred spellings (does not block other names). */
const SECTION_TYPE_ALIASES = {
  service: "services",
  testimonial: "testimonials",
  testimonials_slider: "testimonials",
  reviews: "social-proof",
  why: "why_us",
  why_choose: "why_us",
  why_choose_us: "why_us",
  whyus: "why_us",
  differentiators: "why_us",
  reasons: "why_us",
};

const CHROME_SECTION_TYPES = new Set(["header", "footer"]);

/**
 * Normalize a freeform section name to kebab/snake-ish slug.
 * Unknown names are kept (not forced onto the reference list).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeSectionType(raw) {
  let t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "_")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  if (!t) return "generic";
  if (SECTION_TYPE_ALIASES[t]) t = SECTION_TYPE_ALIASES[t];
  if (t.length > 64) t = t.slice(0, 64).replace(/_+$/g, "");
  return t || "generic";
}

/** @param {string} type */
export function isChromeSectionType(type) {
  const t = normalizeSectionType(type);
  if (CHROME_SECTION_TYPES.has(t)) return true;
  // sticky / floating chrome (keep in inventory for phone/CTA, exclude from bodyWords)
  return /^(site[-_]?)?(header|footer|nav|navbar|top[-_]?bar|site[-_]?nav|sticky|sticky[-_]?bar|sticky[-_]?cta|floating[-_]?cta|floating[-_]?bar|mobile[-_]?bar)$/.test(
    t,
  );
}

/**
 * Visible text with spaces between sibling nodes / line breaks so
 * `<br>` and adjacent inline tags do not glue words ("RepairThat").
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').AnyNode | null | undefined} el
 */
export function spacedVisibleText($, el) {
  if (el == null) return "";
  /** @type {string[]} */
  const parts = [];
  $(el)
    .contents()
    .each((_, node) => {
      if (node.type === "text") {
        parts.push(node.data ?? "");
        return;
      }
      if (node.type !== "tag") return;
      const n = (node.name || "").toLowerCase();
      if (["script", "style", "noscript"].includes(n)) return;
      if (n === "br" || n === "wbr") {
        parts.push(" ");
        return;
      }
      const inner = spacedVisibleText($, node);
      if (inner.replace(/\s/g, "").length > 0) parts.push(inner);
    });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Insert spaces into camelCase / PascalCase glues left in model headings.
 * @param {string} s
 */
export function unglueHeadingWords(s) {
  return String(s || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Per-section UI elements (canonical inventory vocab). */
const ELEMENT_VOCAB = new Set([
  "cta_call",
  "cta_form",
  "cta_quote",
  "cards",
  "list",
  "accordion",
  "image",
  "map",
]);

/** Aliases → canonical element ids. */
const ELEMENT_ALIASES = {
  call: "cta_call",
  call_button: "cta_call",
  phone: "cta_call",
  form: "cta_form",
  quote: "cta_quote",
  quote_button: "cta_quote",
  images: "image",
  img: "image",
  gallery: "image",
};

/** Page + section trust signal types. */
const TRUST_VOCAB = new Set([
  "licensed_insured",
  "years_in_business",
  "guarantee",
  "certifications",
  "financing",
  "reviews_badge",
]);

const TRUST_ALIASES = {
  licensed: "licensed_insured",
  insured: "licensed_insured",
  licensed_and_insured: "licensed_insured",
  years: "years_in_business",
  years_experience: "years_in_business",
  review: "reviews_badge",
  reviews: "reviews_badge",
  review_badge: "reviews_badge",
  review_badges: "reviews_badge",
  certification: "certifications",
  finance: "financing",
};

const PHONE_PLACEMENT_VOCAB = new Set(["header", "hero", "sticky", "footer", "body"]);

const PHONE_PLACEMENT_ALIASES = {
  sticky_bar: "sticky",
  stickybar: "sticky",
  "in-body": "body",
  in_body: "body",
  main: "body",
  content: "body",
};

/**
 * @param {unknown} value
 * @param {Set<string>} vocab
 * @param {Record<string, string>} [aliases]
 */
function canonicalizeToken(value, vocab, aliases = {}) {
  let t = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!t) return null;
  if (aliases[t]) t = aliases[t];
  return vocab.has(t) ? t : null;
}

/**
 * @param {unknown} list
 * @param {Set<string>} vocab
 * @param {Record<string, string>} [aliases]
 */
function canonicalizeTokenList(list, vocab, aliases = {}) {
  if (!Array.isArray(list)) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const t = canonicalizeToken(item, vocab, aliases);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * @param {string} text
 */
export function countWords(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return 0;
  return t.split(" ").filter(Boolean).length;
}

/**
 * Heuristic: SPA/framework markers or large body growth after settle → js.
 * @param {string} html
 * @param {{ earlyWordCount?: number, settledWordCount?: number }} [opts]
 * @returns {'static'|'js'}
 */
export function inferRenderMode(html, opts = {}) {
  const h = String(html || "").toLowerCase();
  const markers = [
    "__next_data__",
    "data-reactroot",
    "ng-version",
    "data-v-",
    "webpackJsonp",
    "window.__NUXT__",
    "astro-island",
    "data-svelte",
  ];
  if (markers.some((m) => h.includes(m.toLowerCase()))) return "js";
  const early = opts.earlyWordCount ?? 0;
  const settled = opts.settledWordCount ?? early;
  if (early > 0 && settled > early * 1.35 && settled - early > 80) return "js";
  // Divi / classic WP still often static HTML after load
  return "static";
}

/**
 * Scan DOM for tel:/mailto/forms and sticky phone placement hints.
 * @param {import('cheerio').CheerioAPI} $
 */
export function scanPageSignals($) {
  /** @type {Set<string>} */
  const phonePlacement = new Set();
  let call = 0;
  let form = 0;
  let quote = 0;
  let email = 0;

  $("a[href^='tel:']").each((_, el) => {
    call += 1;
    const $el = $(el);
    const inHeader = $el.closest("header, .et-l--header, #main-header, .site-header, [role='banner']").length > 0;
    const inFooter = $el.closest("footer, .et-l--footer, #main-footer, .site-footer, [role='contentinfo']").length > 0;
    const styleAttr = String($el.attr("style") || "");
    const sticky =
      $el.closest(".sticky, [class*='sticky'], [class*='fixed']").length > 0 ||
      /position\s*:\s*fixed/i.test(styleAttr);
    if (inHeader) phonePlacement.add("header");
    else if (inFooter) phonePlacement.add("footer");
    else if (sticky) phonePlacement.add("sticky");
    else phonePlacement.add("body");
  });

  $("a[href^='mailto:']").each(() => {
    email += 1;
  });

  $("form").each((_, el) => {
    form += 1;
    const t = $(el).text().toLowerCase();
    if (/\bquote\b|\bestimat/.test(t)) quote += 1;
  });

  $("a, button").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (!t) return;
    if (/\b(get|free|request).{0,20}\bquote\b|\bestimate\b/.test(t)) quote += 1;
    if (/\b(call|phone|dial)\b/.test(t) && !$(el).attr("href")?.startsWith("tel:")) {
      /* text CTA without tel — still a call intent */
      call += 1;
    }
  });

  return {
    phonePlacement: [...phonePlacement],
    ctaCount: { call, form, quote, email },
  };
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {{ text: string, truncated: boolean }}
 */
export function truncateSectionText(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!Number.isFinite(max) || max <= 0 || t.length <= max) {
    return { text: t, truncated: false };
  }
  // Prefer cutting on a word boundary near the limit.
  let cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(max * 0.7)) cut = cut.slice(0, lastSpace);
  return { text: `${cut.trim()}…`, truncated: true };
}

/**
 * DOM-order outline of major bands for the LLM, with (capped) full section text.
 * @param {import('cheerio').CheerioAPI} $
 * @param {{
 *   maxSections?: number,
 *   sectionTextMax?: number,
 *   outlineTextMax?: number,
 * }} [opts]
 */
export function buildSectionOutline($, opts = {}) {
  const maxSections =
    typeof opts.maxSections === "number" && opts.maxSections > 0 ? opts.maxSections : 40;
  const sectionTextMax =
    typeof opts.sectionTextMax === "number" && opts.sectionTextMax > 0
      ? opts.sectionTextMax
      : DEFAULT_SECTION_TEXT_MAX;
  const outlineTextMax =
    typeof opts.outlineTextMax === "number" && opts.outlineTextMax > 0
      ? opts.outlineTextMax
      : DEFAULT_OUTLINE_TEXT_MAX;

  /** @type {{ index: number, tag: string, id: string|null, classes: string, heading: string|null, headingLevel: string|null, text: string, textTruncated: boolean, wordCount: number }[]} */
  const rows = [];
  const roots = $("body > *, main > *, #page-container > *, #et-main-area > *, .et_builder_inner_content > *");
  const seen = new Set();

  const candidates =
    roots.length > 2
      ? roots
      : $("section, header, footer, .et_pb_section, [role='banner'], [role='contentinfo'], main");

  candidates.each((_, el) => {
    if (rows.length >= maxSections) return false;
    const $el = $(el);
    const tag = (el.tagName || el.name || "").toLowerCase();
    if (["script", "style", "noscript", "link", "meta"].includes(tag)) return;
    const key = $el.toString().slice(0, 120);
    if (seen.has(key)) return;
    seen.add(key);

    const fullText = spacedVisibleText($, el);
    const wc = countWords(fullText);
    if (wc < 3 && !/header|footer|banner|contentinfo|sticky/i.test(tag + ($el.attr("class") || ""))) {
      // keep thin visual dividers only if class hints section
      const cls = $el.attr("class") || "";
      if (!/et_pb_section|section|hero|banner|sticky/i.test(cls)) return;
    }

    let heading = null;
    let headingLevel = null;
    const h = $el.find("h1,h2,h3,h4").first();
    if (h.length) {
      heading =
        unglueHeadingWords(spacedVisibleText($, h.get(0))).slice(0, 160) || null;
      headingLevel = (h.get(0)?.tagName || h.get(0)?.name || "").toLowerCase() || null;
    }

    const { text, truncated } = truncateSectionText(fullText, sectionTextMax);

    rows.push({
      index: rows.length + 1,
      tag,
      id: $el.attr("id") || null,
      classes: String($el.attr("class") || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
        .join(" "),
      heading,
      headingLevel,
      text,
      textTruncated: truncated,
      wordCount: wc,
    });
  });

  // Global outline budget: shrink per-band text proportionally if needed.
  let total = rows.reduce((n, r) => n + r.text.length, 0);
  if (total > outlineTextMax && rows.length > 0) {
    const scale = outlineTextMax / total;
    for (const r of rows) {
      const cap = Math.max(200, Math.floor(r.text.length * scale));
      const next = truncateSectionText(r.text.replace(/…$/, ""), cap);
      if (next.truncated || r.textTruncated) {
        r.text = next.text;
        r.textTruncated = true;
      }
    }
  }

  return rows;
}

/**
 * True when a band has real review/testimonial evidence (not just "why choose us" copy).
 * @param {{ heading?: string, elements?: string[], trustSignals?: string[] }} section
 */
export function hasSocialProofEvidence(section) {
  const trust = section.trustSignals || [];
  if (trust.includes("reviews_badge")) return true;
  const heading = String(section.heading || "").toLowerCase();
  if (
    /\b(reviews?|testimonials?|ratings?|stars?|clients? say|customers? say|what (our )?(clients?|customers?|homeowners?) (say|think)|loved by)\b/.test(
      heading,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Differentiator / "why choose us" content (not review social proof).
 * @param {{ heading?: string, wordCount?: number, elements?: string[] }} section
 */
export function looksLikeWhyUs(section) {
  const heading = String(section.heading || "").toLowerCase();
  if (
    /\bwhy\b|\bchoose (us|our)\b|\bwhy (choose|hire|pick|select|us)\b|\bdifference\b|\breasons? (to|why|you)\b|\bwhat sets\b|\bwhy (we|our)\b/.test(
      heading,
    )
  ) {
    return true;
  }
  const els = section.elements || [];
  const wc = Number(section.wordCount) || 0;
  // Long list/feature band without review framing → differentiator
  if (wc >= 80 && (els.includes("list") || els.includes("cards"))) return true;
  return false;
}

/**
 * Reclassify mislabeled social-proof / testimonials:
 * - real review evidence → keep
 * - why-choose / long differentiator lists → why_us
 * - otherwise → generic (e.g. thin social-icon strips)
 * @param {{ type: string, heading: string, wordCount: number, elements: string[], trustSignals: string[] }} section
 */
export function coerceSectionType(section) {
  let type = section.type;
  if (type === "social-proof" || type === "testimonials") {
    if (hasSocialProofEvidence(section)) return type;
    if (looksLikeWhyUs(section)) return "why_us";
    return "generic";
  }
  // Thin bands mislabeled why_us (e.g. social-icon strip) → generic
  if (type === "why_us" && !looksLikeWhyUs(section)) {
    return "generic";
  }
  return type;
}

/**
 * Page-level CTA counts = sum of per-section element tags (header/footer included as sections).
 * Presence tags are counted once per section they appear in (schema is type-set, not multiplicity).
 * @param {{ elements?: string[] }[]} sections
 */
export function ctaCountFromSections(sections) {
  let call = 0;
  let form = 0;
  let quote = 0;
  for (const s of sections || []) {
    const els = Array.isArray(s.elements) ? s.elements : [];
    if (els.includes("cta_call")) call += 1;
    if (els.includes("cta_form")) form += 1;
    if (els.includes("cta_quote")) quote += 1;
  }
  return { call, form, quote };
}

/**
 * Sum word counts for non-chrome sections (excludes header/footer).
 * @param {{ type: string, wordCount?: number }[]} sections
 */
export function bodyWordsFromSections(sections) {
  let n = 0;
  for (const s of sections || []) {
    if (isChromeSectionType(s.type)) continue;
    const w = Number(s.wordCount) || 0;
    if (w > 0) n += w;
  }
  return n;
}

/**
 * @param {unknown} raw
 * @param {{ url: string, totalWords: number, renderMode: 'static'|'js', signals: ReturnType<typeof scanPageSignals>, errors?: string[] }} ctx
 */
export function normalizeInventory(raw, ctx) {
  /** @type {string[]} */
  const errors = [...(ctx.errors || [])];
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};

  const sectionsIn = Array.isArray(src.sections) ? src.sections : [];
  /** @type {object[]} */
  const sections = [];
  for (let i = 0; i < sectionsIn.length; i++) {
    const s = sectionsIn[i];
    if (!s || typeof s !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (s);
    // Prefer freeform `type`; accept `name` as alias if model used that key.
    const type = normalizeSectionType(
      row.type != null && String(row.type).trim() ? row.type : row.name,
    );

    const elements = canonicalizeTokenList(row.elements, ELEMENT_VOCAB, ELEMENT_ALIASES);
    const trustSignals = canonicalizeTokenList(row.trustSignals, TRUST_VOCAB, TRUST_ALIASES);

    let headingLevel = row.headingLevel != null ? String(row.headingLevel).toLowerCase() : null;
    if (headingLevel && !/^h[1-6]$/.test(headingLevel)) headingLevel = null;

    const headingRaw =
      row.heading == null
        ? ""
        : unglueHeadingWords(String(row.heading)).slice(0, 200);

    /** @type {{ position: number, type: string, heading: string, headingLevel: string|null, wordCount: number, elements: string[], trustSignals: string[] }} */
    const section = {
      position: typeof row.position === "number" && row.position > 0 ? row.position : i + 1,
      type,
      heading: headingRaw,
      headingLevel,
      wordCount:
        typeof row.wordCount === "number" && Number.isFinite(row.wordCount)
          ? Math.max(0, Math.round(row.wordCount))
          : 0,
      elements,
      trustSignals,
    };
    section.type = coerceSectionType(section);
    sections.push(section);
  }

  // Ensure DOM order positions 1..n
  sections.sort((a, b) => a.position - b.position);
  sections.forEach((s, i) => {
    s.position = i + 1;
  });

  // Page trust = union of section trusts (consistent with per-section annotations).
  const pageTrust = canonicalizeTokenList(
    sections.flatMap((s) => s.trustSignals),
    TRUST_VOCAB,
    TRUST_ALIASES,
  );

  let confidence =
    typeof src.confidence === "number" && Number.isFinite(src.confidence) ? src.confidence : 0.7;
  confidence = Math.min(1, Math.max(0, confidence));

  const modelPhone = canonicalizeTokenList(
    src.phonePlacement,
    PHONE_PLACEMENT_VOCAB,
    PHONE_PLACEMENT_ALIASES,
  );
  const signalPhone = canonicalizeTokenList(
    ctx.signals.phonePlacement,
    PHONE_PLACEMENT_VOCAB,
    PHONE_PLACEMENT_ALIASES,
  );
  const phonePlacement = [...new Set([...signalPhone, ...modelPhone])];

  // CTA counts must match section-level element tags (includes header/footer sections).
  const ctaCount = ctaCountFromSections(sections);

  // totalWords = sum of every section wordCount (including chrome).
  // bodyWords = same sum excluding header/footer/sticky chrome.
  const totalWords = sections.reduce((n, s) => n + (Number(s.wordCount) || 0), 0);
  const bodyWords = bodyWordsFromSections(sections);

  const renderMode =
    src.renderMode === "js" || src.renderMode === "static"
      ? src.renderMode
      : ctx.renderMode;

  if (Array.isArray(src.errors)) {
    for (const e of src.errors) {
      if (e != null && String(e).trim()) errors.push(String(e).trim());
    }
  }

  return {
    url: ctx.url.replace(/\/$/, ""),
    fetched: true,
    renderMode,
    totalWords,
    bodyWords,
    sections,
    phonePlacement,
    ctaCount,
    trustSignals: pageTrust,
    confidence,
    errors,
  };
}

export function inventorySystemPrompt() {
  const typeList = SECTION_TYPE_REFERENCE.join(", ");
  return `You are a homepage structure analyst for local-service / marketing sites.

Given (1) a DOM-order outline of major page bands — each with its visible text content (may end with … if truncated) — and (2) optionally a desktop screenshot, return ONE JSON object only (no markdown fences) matching this schema:

{
  "url": "https://example.com",
  "fetched": true,
  "renderMode": "static" | "js",
  "totalWords": 1240,
  "bodyWords": 1100,
  "sections": [
    {
      "position": 1,
      "type": "hero",
      "heading": "Primary visible heading for this band",
      "headingLevel": "h1",
      "wordCount": 45,
      "elements": ["cta_call", "cta_form"],
      "trustSignals": ["licensed_insured"]
    }
  ],
  "phonePlacement": ["header", "hero", "sticky"],
  "ctaCount": { "call": 5, "form": 2, "quote": 1 },
  "trustSignals": ["licensed_insured", "years_in_business", "reviews_badge"],
  "confidence": 0.94,
  "errors": []
}

Suggested section names (examples — NOT a closed list):
${typeList}

Rules:
- sections MUST be in visual top-to-bottom order (position 1 = top).
- READ each band's \`text\` field fully (it is the section content, capped). Set \`type\` to a short descriptive snake_case name based on what the content is doing.
- Prefer a suggested name above when it clearly fits. If none fit well, invent the best descriptive name (e.g. emergency_service_banner, financing_options, service_area_list, drainfield_problems). Do NOT force a bad match onto the suggested list. Do NOT use CMS class names (no et-pb-section).
- social-proof / testimonials ONLY when there is real review/testimonial evidence in the text (review badges, ratings, quoted customers). Differentiator / "why choose us" / reasons-to-hire list copy with NO reviews → why_us (or a clearer freeform name like why_choose_us).
- heading = main visible heading text from the band, or "" if none; headingLevel = "h1"|"h2"|"h3"|"h4"|"h5"|"h6" or null.
- wordCount = visible text words in that band only (use the outline wordCount when provided).
- elements (per section): only cta_call, cta_form, cta_quote, cards, list, accordion, image, map. Infer from the band text/structure; mark cta_form only if an actual form exists in that band.
- trustSignals (per section and page): only licensed_insured, years_in_business, guarantee, certifications, financing, reviews_badge. Infer from the band text.
- phonePlacement: only header, hero, sticky, footer, body (body = in-content; sticky = sticky/fixed bar).
- ctaCount MUST equal how many sections include cta_call / cta_form / cta_quote (header and footer count). Do not invent page-level CTAs missing from sections.
- totalWords: MUST equal the sum of every section wordCount (including header/footer/sticky). bodyWords: sum of wordCount excluding chrome (header, footer, sticky/floating bars).
- Include header and footer when present.
- Merge nested wrappers that are one visual band; do not invent sections with no content.
- Prefer the provided outline order; use the screenshot to merge/split when HTML is noisy (e.g. Divi).
- JSON object only.`.trim();
}

/** Defaults chosen after quality bakeoff (Gemini 3 Flash primary, GLM-4.6V fallback). */
export const DEFAULT_INVENTORY_MODEL = "google/gemini-3-flash-preview";
export const DEFAULT_INVENTORY_RETRY_MODEL = "z-ai/glm-4.6v";

/**
 * Soft quality gate — if primary output looks thin/broken, escalate to retry model.
 * @param {ReturnType<typeof normalizeInventory>} inventory
 */
export function inventoryNeedsRetry(inventory) {
  if (!inventory?.fetched) return true;
  const sections = inventory.sections || [];
  if (sections.length < 4) return true;
  if ((inventory.confidence ?? 0) < 0.55) return true;
  if ((inventory.errors || []).some((e) => /LLM failed|JSON/i.test(String(e)))) return true;
  const mid = sections.filter((s) => !isChromeSectionType(s.type));
  const named = mid.filter((s) => s.heading && String(s.heading).trim()).length;
  if (mid.length >= 3 && named < Math.ceil(mid.length * 0.5)) return true;
  return false;
}
