import type { Beneficiary } from "./types";

export type ResolveResult =
  | { readonly kind: "match"; readonly beneficiary: Beneficiary }
  | { readonly kind: "ambiguous"; readonly candidates: readonly Beneficiary[] }
  | { readonly kind: "unknown" };

/**
 * Resolve a spoken/typed recipient reference against the beneficiary list.
 *
 * RULE (§7 FR10): a name not on the list must NOT be guessed. Returns "unknown"
 * so the agent asks. If more than one beneficiary matches, returns "ambiguous"
 * so the agent asks which. Only an unambiguous single match sends money.
 */
export function resolveBeneficiary(
  query: string,
  list: readonly Beneficiary[],
): ResolveResult {
  const q = normalise(query);
  if (q.length === 0) return { kind: "unknown" };

  // Exact id.
  const byId = list.find((b) => b.id === query);
  if (byId) return { kind: "match", beneficiary: byId };

  const matches = list.filter((b) => {
    if (normalise(b.name) === q) return true;
    return b.aliases.some((a) => {
      const na = normalise(a);
      return na === q || q === na || q.includes(na) || na.includes(q);
    });
  });

  if (matches.length === 1) {
    const only = matches[0];
    if (only) return { kind: "match", beneficiary: only };
  }
  if (matches.length > 1) return { kind: "ambiguous", candidates: matches };
  return { kind: "unknown" };
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
