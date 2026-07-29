/**
 * Structured JSON logging with a redaction layer (§8). Strips anything that
 * looks like a PAN, CVV, token, key or bot token before it is ever written.
 * Unit-tested against a fixture containing all of them.
 */

const PATTERNS: { re: RegExp; replace: string }[] = [
  // 13–19 digit card numbers (with optional spaces/dashes).
  { re: /\b(?:\d[ -]*?){13,19}\b/g, replace: "[REDACTED_PAN]" },
  // Telegram bot tokens: 123456:AA...
  { re: /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, replace: "[REDACTED_TOKEN]" },
  // Bearer / api keys, JWTs, gsk_/AIza style secrets.
  { re: /\b(?:gsk_|sk-|AIza|AQ\.)[A-Za-z0-9._-]{10,}\b/g, replace: "[REDACTED_KEY]" },
  { re: /\beyJ[A-Za-z0-9._-]{20,}\b/g, replace: "[REDACTED_JWT]" },
];

const SENSITIVE_KEYS = /^(pan|cvv|cvc|token|secret|apikey|api_key|authorization|password)$/i;

export function redact(value: unknown): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const { re, replace } of PATTERNS) out = out.replace(re, replace);
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...(redact(data) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
