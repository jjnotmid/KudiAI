import { type Money, minorPerMajor } from "./types";

const SYMBOL: Record<Money["currency"], string> = {
  NGN: "₦",
  USD: "$",
};

/**
 * Format Money for display. Uses grouping separators and always shows the
 * currency symbol. Locale controls digit grouping only — the value is exact,
 * derived from integer minor units, so it never drifts.
 */
export function formatMoney(m: Money, locale = "en-NG"): string {
  const perMajor = minorPerMajor(m.currency);
  const major = m.minor / perMajor;
  const fractionDigits = perMajor === 1 ? 0 : 2;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(major);
  return `${SYMBOL[m.currency]}${formatted}`;
}
