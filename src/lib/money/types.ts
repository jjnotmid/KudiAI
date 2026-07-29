/**
 * Money is ALWAYS represented as an integer number of minor units (kobo for NGN,
 * cents for USD) plus an ISO-4217 currency code. Never a float. Never a Number
 * with a decimal point. All arithmetic happens on `minor`.
 *
 * This is the single most important invariant in the codebase (§4.1 of the brief).
 */

export const CURRENCIES = ["NGN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Money {
  /** Integer minor units. NGN → kobo, USD → cents. Never fractional. */
  readonly minor: number;
  readonly currency: Currency;
}

/** Minor units per major unit for each supported currency. */
const MINOR_PER_MAJOR: Record<Currency, number> = {
  NGN: 100,
  USD: 100,
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/** Construct Money from an integer minor amount, guarding the invariant. */
export function money(minor: number, currency: Currency): Money {
  if (!Number.isInteger(minor)) {
    throw new Error(`money() requires integer minor units, got ${minor}`);
  }
  return { minor, currency };
}

/** Construct Money from a major amount (e.g. 5000 naira → 500000 kobo). */
export function fromMajor(major: number, currency: Currency): Money {
  const minor = Math.round(major * MINOR_PER_MAJOR[currency]);
  return money(minor, currency);
}

export function minorPerMajor(currency: Currency): number {
  return MINOR_PER_MAJOR[currency];
}

/** Add two Money values of the same currency. */
export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

/** Subtract b from a. Both must share a currency. */
export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function gte(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.minor >= b.minor;
}

export function isPositive(a: Money): boolean {
  return a.minor > 0;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
