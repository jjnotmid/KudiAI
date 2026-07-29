import { fromMajor } from "@/lib/money/types";
import type { Balance, Beneficiary } from "./types";

/**
 * Seed data for the demo. Typed, deterministic, the single source of truth for
 * the starting wallet and the beneficiary list. `demo:reset` restores exactly
 * this state. No PII beyond first names of fictional beneficiaries.
 */

export function seedBalances(): Balance[] {
  return [
    { currency: "NGN", available: fromMajor(250_000, "NGN") }, // ₦250,000.00
    { currency: "USD", available: fromMajor(120, "USD") }, //     $120.00
  ];
}

export const SEED_BENEFICIARIES: readonly Beneficiary[] = [
  {
    id: "ben_chidi",
    name: "Chidi",
    aliases: ["my brother", "brother", "chidi", "my broda", "broda"],
    currency: "NGN",
  },
  {
    id: "ben_ngozi",
    name: "Ngozi",
    aliases: ["my sister", "sister", "ngozi", "my sis", "sis"],
    currency: "NGN",
  },
  {
    id: "ben_emeka",
    name: "Emeka",
    aliases: ["emeka", "my friend", "my guy", "my padi"],
    currency: "NGN",
  },
  {
    id: "ben_mama",
    name: "Mama",
    aliases: ["mama", "my mama", "my mother", "mummy"],
    currency: "NGN",
  },
];

export function seedBeneficiaries(): Beneficiary[] {
  return SEED_BENEFICIARIES.map((b) => ({ ...b, aliases: [...b.aliases] }));
}
