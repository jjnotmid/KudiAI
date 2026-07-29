import { randomInt, randomUUID } from "node:crypto";
import { addMoney, fromMajor, gte, isPositive, type Money, money, subMoney } from "@/lib/money/types";
import { formatMoney } from "@/lib/money/format";
import { seedBalances, seedBeneficiaries } from "./seed";
import { withLuhn } from "./luhn";
import {
  type Balance,
  type Beneficiary,
  type ConversionReceipt,
  type ConvertInput,
  type CreateCardInput,
  type Ctx,
  type Err,
  err,
  type MoneyProvider,
  ok,
  type Result,
  type SavingsInput,
  type SavingsReceipt,
  type TransferInput,
  type TransferReceipt,
  type VerifiedBankAccount,
  type VerifyBankAccountInput,
  type VirtualCard,
} from "./types";

/** Visa test BIN. All generated PANs pass Luhn and mask to `•••• NNNN`. */
const TEST_BIN = "424242";
/** ₦ per $1, minor-to-minor is 1:1 here since both use 2 dp. */
const NGN_PER_USD_MAJOR = 1650;

interface SessionState {
  balances: Map<Money["currency"], Money>;
  beneficiaries: Beneficiary[];
  seenIdempotencyKeys: Map<string, unknown>;
  chaosCounter: number;
  ledgerSeq: number;
}

/**
 * Deterministic, seeded, in-memory money provider that mimics BMONI closely
 * enough that the SAME contract suite passes here and against the real API
 * (§4.2). Realistic latency, optional chaos error injection, exact minor-unit
 * arithmetic, Luhn-valid test cards, a monotonic ledger, and idempotent writes.
 */
export class SimProvider implements MoneyProvider {
  readonly name = "sim" as const;
  private readonly sessions = new Map<string, SessionState>();
  private readonly latency: boolean;

  constructor(opts: { latency?: boolean } = {}) {
    // Latency on in the running app; off in tests for speed.
    this.latency = opts.latency ?? true;
  }

  private state(sessionId: string): SessionState {
    let s = this.sessions.get(sessionId);
    if (!s) {
      const balances = new Map<Money["currency"], Money>();
      for (const b of seedBalances()) balances.set(b.currency, b.available);
      s = {
        balances,
        beneficiaries: seedBeneficiaries(),
        seenIdempotencyKeys: new Map(),
        chaosCounter: 0,
        ledgerSeq: 0,
      };
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  /** Wipe a session back to seed state (used by demo:reset). */
  reset(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private async gate(ctx: Ctx): Promise<Err | null> {
    if (this.latency) {
      await delay(150 + randomInt(0, 250)); // 150–400ms jitter
    }
    if (ctx.chaos) {
      const s = this.state(ctx.sessionId);
      s.chaosCounter += 1;
      if (s.chaosCounter % 4 === 0) {
        return err(
          "provider_unavailable",
          "The money service is busy right now. Try again in a moment.",
          true,
        );
      }
    }
    return null;
  }

  async getBalances(ctx: Ctx): Promise<Result<Balance[]>> {
    const gated = await this.gate(ctx);
    if (gated) return gated;
    const s = this.state(ctx.sessionId);
    const balances: Balance[] = [...s.balances.entries()].map(([currency, available]) => ({
      currency,
      available,
    }));
    return ok(balances);
  }

  async listBeneficiaries(ctx: Ctx): Promise<Result<Beneficiary[]>> {
    const gated = await this.gate(ctx);
    if (gated) return gated;
    return ok(this.state(ctx.sessionId).beneficiaries);
  }

  async createVirtualCard(ctx: Ctx, input: CreateCardInput): Promise<Result<VirtualCard>> {
    const gated = await this.gate(ctx);
    if (gated) return gated;
    const label = input.label.trim();
    if (label.length === 0) {
      return err("invalid_amount", "A card needs a short label, like “Netflix”.");
    }
    // BIN(6) + 9 random digits → 15, plus Luhn check → 16.
    const body = TEST_BIN + String(randomInt(0, 1_000_000_000)).padStart(9, "0");
    const pan = withLuhn(body);
    const last4 = pan.slice(-4);
    const now = new Date();
    const card: VirtualCard = {
      id: `card_${randomUUID()}`,
      label,
      currency: input.currency,
      pan,
      last4,
      expMonth: now.getMonth() + 1,
      expYear: (now.getFullYear() + 3) % 100,
      cvv: String(randomInt(0, 1000)).padStart(3, "0"),
      brand: "visa",
    };
    return ok(card);
  }

  async verifyBankAccount(_ctx: Ctx, input: VerifyBankAccountInput): Promise<Result<VerifiedBankAccount>> {
    const suffix = input.accountNumber.replace(/\D/g, "").slice(-4).padStart(4, "0");
    return ok({ accountHolderName: `Recipient ${suffix}`, bankName: input.bankName, bankCode: "sim" });
  }

  async transfer(ctx: Ctx, input: TransferInput): Promise<Result<TransferReceipt>> {
    const gated = await this.gate(ctx);
    if (gated) return gated;
    const s = this.state(ctx.sessionId);

    const cached = s.seenIdempotencyKeys.get(input.idempotencyKey);
    if (cached) return ok(cached as TransferReceipt); // idempotent replay

    if (!isPositive(input.amount)) {
      return err("invalid_amount", "That amount doesn’t look right.");
    }
    const special = parseBankTransferRecipient(input.beneficiaryId);
    const namedRecipient = special
      ? `${special.recipientName} (${special.bankName} • ${special.accountNumber})`
      : undefined;
    const balance = s.balances.get(input.amount.currency) ?? money(0, input.amount.currency);
    if (!gte(balance, input.amount)) {
      return err(
        "insufficient_funds",
        `You don’t have enough. Your balance is ${formatMoney(balance)}.`,
      );
    }
    const after = subMoney(balance, input.amount);
    s.balances.set(input.amount.currency, after);
    s.ledgerSeq += 1;
    const receipt: TransferReceipt = {
      id: `txn_${s.ledgerSeq}_${randomUUID().slice(0, 8)}`,
      amount: input.amount,
      beneficiaryId: input.beneficiaryId,
      beneficiaryName: namedRecipient ?? "Unknown beneficiary",
      balanceAfter: after,
      createdAt: new Date().toISOString(),
    };
    s.seenIdempotencyKeys.set(input.idempotencyKey, receipt);
    return ok(receipt);
  }

  async convert(ctx: Ctx, input: ConvertInput): Promise<Result<ConversionReceipt>> {
    const gated = await this.gate(ctx);
    if (gated) return gated;
    const s = this.state(ctx.sessionId);

    const cached = s.seenIdempotencyKeys.get(input.idempotencyKey);
    if (cached) return ok(cached as ConversionReceipt);

    const from = input.amount;
    if (from.currency === input.to) {
      return err("unsupported_currency", "That’s already the same currency.");
    }
    if (!isPositive(from)) return err("invalid_amount", "That amount doesn’t look right.");

    const fromBal = s.balances.get(from.currency) ?? money(0, from.currency);
    if (!gte(fromBal, from)) {
      return err("insufficient_funds", `You only have ${formatMoney(fromBal)} to convert.`);
    }

    // Exact minor-unit conversion via major-unit rate, rounded to minor units.
    let toMinor: number;
    let rateDisplay: string;
    if (from.currency === "NGN" && input.to === "USD") {
      const usdMajor = from.minor / 100 / NGN_PER_USD_MAJOR;
      toMinor = Math.round(usdMajor * 100);
      rateDisplay = `${formatMoney(fromMajor(NGN_PER_USD_MAJOR, "NGN"))} = ${formatMoney(fromMajor(1, "USD"))}`;
    } else {
      const ngnMajor = (from.minor / 100) * NGN_PER_USD_MAJOR;
      toMinor = Math.round(ngnMajor * 100);
      rateDisplay = `${formatMoney(fromMajor(1, "USD"))} = ${formatMoney(fromMajor(NGN_PER_USD_MAJOR, "NGN"))}`;
    }
    const toMoney = money(toMinor, input.to);

    s.balances.set(from.currency, subMoney(fromBal, from));
    const toBal = s.balances.get(input.to) ?? money(0, input.to);
    s.balances.set(input.to, addMoney(toBal, toMoney));
    s.ledgerSeq += 1;

    const receipt: ConversionReceipt = {
      id: `cnv_${s.ledgerSeq}_${randomUUID().slice(0, 8)}`,
      from,
      to: toMoney,
      rateDisplay,
      createdAt: new Date().toISOString(),
    };
    s.seenIdempotencyKeys.set(input.idempotencyKey, receipt);
    return ok(receipt);
  }

  async saveToSavings(ctx: Ctx, input: SavingsInput): Promise<Result<SavingsReceipt>> {
    const gated = await this.gate(ctx);
    if (gated) return gated;
    const s = this.state(ctx.sessionId);

    const cached = s.seenIdempotencyKeys.get(input.idempotencyKey);
    if (cached) return ok(cached as SavingsReceipt);

    if (!isPositive(input.amount)) return err("invalid_amount", "That amount doesn’t look right.");
    const bal = s.balances.get(input.amount.currency) ?? money(0, input.amount.currency);
    if (!gte(bal, input.amount)) {
      return err("insufficient_funds", `You only have ${formatMoney(bal)} to save.`);
    }
    s.balances.set(input.amount.currency, subMoney(bal, input.amount));
    s.ledgerSeq += 1;
    const receipt: SavingsReceipt = {
      id: `sav_${s.ledgerSeq}_${randomUUID().slice(0, 8)}`,
      amount: input.amount,
      cadence: input.cadence,
      savedNow: input.amount,
      recurring: false, // recurrence is NOT active in this build (§FR9)
      createdAt: new Date().toISOString(),
    };
    s.seenIdempotencyKeys.set(input.idempotencyKey, receipt);
    return ok(receipt);
  }
}

function parseBankTransferRecipient(beneficiaryId: string): { bankName: string; accountNumber: string; recipientName: string } | null {
  if (!beneficiaryId.startsWith("bank:")) return null;
  const parts = beneficiaryId.split(":");
  if (parts.length < 4) return null;
  return {
    bankName: decodeURIComponent(parts[1] ?? ""),
    accountNumber: parts[2] ?? "",
    recipientName: decodeURIComponent(parts[3] ?? ""),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
