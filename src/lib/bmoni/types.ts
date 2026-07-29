import type { Currency, Money } from "@/lib/money/types";

/**
 * The money provider boundary (§4.1). One interface, two implementations
 * (SimProvider now, BmoniLiveProvider once credentials exist). Both pass the
 * same contract test suite.
 *
 * RULE: never throw across this boundary. Every method returns a Result.
 */

export interface Err {
  readonly ok: false;
  readonly error: ProviderError;
}

export type Result<T> = { readonly ok: true; readonly data: T } | Err;

export interface ProviderError {
  /** Stable machine code, e.g. "insufficient_funds", "unknown_beneficiary". */
  readonly code: ProviderErrorCode;
  /** Already-friendly, already-localisable message safe to show a user. */
  readonly userMessage: string;
  /** Whether the caller may retry the same request. */
  readonly retryable: boolean;
}

export type ProviderErrorCode =
  | "insufficient_funds"
  | "unknown_beneficiary"
  | "invalid_amount"
  | "unsupported_currency"
  | "provider_unavailable"
  | "rate_limited"
  | "not_implemented"
  | "unknown";

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(
  code: ProviderErrorCode,
  userMessage: string,
  retryable = false,
): Err {
  return { ok: false, error: { code, userMessage, retryable } };
}

/** Per-request context. `sessionId` scopes the demo wallet + ledger. */
export interface Ctx {
  readonly sessionId: string;
  /** Force a provider error 1-in-4 for exercising error paths (?chaos=1). */
  readonly chaos?: boolean;
}

// ── Domain types ────────────────────────────────────────────────────────

export interface Balance {
  readonly currency: Currency;
  readonly available: Money;
}

export interface VirtualCard {
  readonly id: string;
  readonly label: string;
  readonly currency: Currency;
  /** Full PAN — returned ONCE by the provider, never persisted (§8). */
  readonly pan: string;
  readonly last4: string;
  readonly expMonth: number;
  readonly expYear: number;
  readonly cvv: string;
  readonly brand: "visa" | "mastercard";
}

export interface Beneficiary {
  readonly id: string;
  readonly name: string;
  /** Relationship words the agent can resolve, e.g. ["my brother", "brother"]. */
  readonly aliases: readonly string[];
  readonly currency: Currency;
}

export interface CreateCardInput {
  readonly currency: Currency;
  readonly label: string;
}

export interface TransferInput {
  readonly amount: Money;
  readonly beneficiaryId: string;
  /** Client-supplied key so a retry can never double-send (§7.3). */
  readonly idempotencyKey: string;
}

export interface VerifyBankAccountInput {
  readonly accountNumber: string;
  readonly bankName: string;
}

export interface VerifiedBankAccount {
  readonly accountHolderName: string;
  readonly bankName: string;
  readonly bankCode?: string;
}

export interface TransferReceipt {
  readonly id: string;
  readonly amount: Money;
  readonly beneficiaryId: string;
  readonly beneficiaryName: string;
  readonly balanceAfter: Money;
  readonly createdAt: string;
}

export interface ConvertInput {
  readonly amount: Money;
  readonly to: Currency;
  readonly idempotencyKey: string;
}

export interface ConversionReceipt {
  readonly id: string;
  readonly from: Money;
  readonly to: Money;
  /** Rate as minor-to-minor, expressed for display (e.g. "₦1,650 = $1"). */
  readonly rateDisplay: string;
  readonly createdAt: string;
}

export type SavingsCadence = "once" | "daily" | "weekly";

export interface SavingsInput {
  readonly amount: Money;
  readonly cadence: SavingsCadence;
  readonly idempotencyKey: string;
}

export interface SavingsReceipt {
  readonly id: string;
  readonly amount: Money;
  readonly cadence: SavingsCadence;
  readonly savedNow: Money;
  /** True only when recurrence is genuinely active. Always false in this build. */
  readonly recurring: boolean;
  readonly createdAt: string;
}

export interface MoneyProvider {
  readonly name: "sim" | "live";
  getBalances(ctx: Ctx): Promise<Result<Balance[]>>;
  listBeneficiaries(ctx: Ctx): Promise<Result<Beneficiary[]>>;
  createVirtualCard(ctx: Ctx, input: CreateCardInput): Promise<Result<VirtualCard>>;
  verifyBankAccount(ctx: Ctx, input: VerifyBankAccountInput): Promise<Result<VerifiedBankAccount>>;
  transfer(ctx: Ctx, input: TransferInput): Promise<Result<TransferReceipt>>;
  convert(ctx: Ctx, input: ConvertInput): Promise<Result<ConversionReceipt>>;
  saveToSavings(ctx: Ctx, input: SavingsInput): Promise<Result<SavingsReceipt>>;
}
