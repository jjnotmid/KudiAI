import { type Currency, fromMajor, type Money } from "./types";

/**
 * parseAmount — turn a natural-language amount into exact Money, or null.
 *
 * HARD RULE (§7.6): if the text is ambiguous or has no amount, return null.
 * NEVER default to a number. The agent must ask when this returns null.
 *
 * Handles: 5k / 5K / 50k, ₦5,000, "5000 naira", "$20", English words
 * ("five thousand"), and Pidgin ("five k").
 *
 * Currency is inferred from the text (₦/naira → NGN, $/dollar → USD); if none is
 * present the caller's `defaultCurrency` is used (defaults to NGN).
 */
export function parseAmount(text: string, defaultCurrency: Currency = "NGN"): Money | null {
  if (typeof text !== "string") return null;
  const raw = text.trim().toLowerCase();
  if (raw.length === 0) return null;

  const currency = detectCurrency(raw) ?? defaultCurrency;

  // 1. Numeric with optional k/thousand suffix, commas, decimals, symbols.
  //    Grab the first standalone number token.
  const numeric = parseNumeric(raw);
  if (numeric !== null) return fromMajor(numeric, currency);

  // 2. Word-based amounts (English / Pidgin).
  const words = parseEnglishWords(raw);
  if (words !== null && words > 0) return fromMajor(words, currency);

  return null;
}

function detectCurrency(text: string): Currency | null {
  if (/[$]|dollar|dollars|usd|dola/.test(text)) return "USD";
  if (/[₦]|naira|ngn|kudi/.test(text)) return "NGN";
  return null;
}

/** Parse the first numeric amount, honouring `k`/`thousand`/`m`/`million` scale. */
function parseNumeric(text: string): number | null {
  // e.g. "5k", "5,000", "₦5,000.50", "50 k", "2m"
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|million|bn|billion)?/);
  if (!match) return null;
  const numStr = match[1];
  if (numStr === undefined) return null;
  const base = Number.parseFloat(numStr.replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;

  const scaleWord = match[2];
  const scale =
    scaleWord === undefined
      ? 1
      : /^k|thousand$/.test(scaleWord)
        ? 1_000
        : /^m|million$/.test(scaleWord)
          ? 1_000_000
          : /^bn|billion$/.test(scaleWord)
            ? 1_000_000_000
            : 1;
  return base * scale;
}

// ── English / Pidgin number words ──────────────────────────────────────
const EN_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const EN_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};
const EN_SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000,
  // Pidgin: "k" spoken as a word.
  k: 1_000,
};

function parseEnglishWords(text: string): number | null {
  const tokens = text.split(/[\s-]+/).filter((t) => t in EN_UNITS || t in EN_TENS || t in EN_SCALES || t === "and");
  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const tok of tokens) {
    if (tok === "and") continue;
    if (tok in EN_UNITS) {
      current += EN_UNITS[tok] ?? 0;
      sawNumber = true;
    } else if (tok in EN_TENS) {
      current += EN_TENS[tok] ?? 0;
      sawNumber = true;
    } else if (tok in EN_SCALES) {
      const scale = EN_SCALES[tok] ?? 1;
      sawNumber = true;
      if (scale === 100) {
        current = (current === 0 ? 1 : current) * 100;
      } else {
        current = (current === 0 ? 1 : current) * scale;
        total += current;
        current = 0;
      }
    }
  }
  if (!sawNumber) return null;
  return total + current;
}
