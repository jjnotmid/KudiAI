/** Luhn (mod-10) helpers for generating and validating test card numbers. */

export function luhnCheckDigit(partial: string): number {
  // `partial` is the number WITHOUT the final check digit.
  let sum = 0;
  let double = true; // rightmost of `partial` gets doubled
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = partial.charCodeAt(i) - 48;
    if (d < 0 || d > 9) throw new Error("luhn: non-digit input");
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function withLuhn(partial: string): string {
  return partial + String(luhnCheckDigit(partial));
}

export function isLuhnValid(pan: string): boolean {
  const digits = pan.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
