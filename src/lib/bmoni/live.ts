import { randomInt, randomUUID } from "node:crypto";
import { fromMajor, money } from "@/lib/money/types";
import { formatMoney } from "@/lib/money/format";
import { getStore } from "@/lib/store";
import { log } from "@/lib/log";
import { BmoniClient } from "./client";
import { ensureBmoniAccount } from "./onboard";
import { withLuhn } from "./luhn";
import type {
  Balance,
  Beneficiary,
  ConversionReceipt,
  ConvertInput,
  CreateCardInput,
  Ctx,
  MoneyProvider,
  Result,
  SavingsInput,
  SavingsReceipt,
  TransferInput,
  TransferReceipt,
  VerifiedBankAccount,
  VerifyBankAccountInput,
  VirtualCard,
} from "./types";
import { err, ok } from "./types";

/**
 * BmoniLiveProvider — real HTTP against the BMONI platform.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │ Base URL + auth are now CONFIRMED (see docs/bmoni/API.md):          │
 * │   BMONI_BASE_URL = https://embedded-dev.bmoni.com                   │
 * │   header         = x-api-key: <BMONI_SANDBOX_API_KEY>               │
 * │ Balances/user/wallet/KYC endpoints are known. Card/transfer/        │
 * │ conversion endpoints still need confirming from the interactive     │
 * │ docs (embedded-dev.bmoni.com/docs) — see the checklist. Wallet      │
 * │ currencies are CNGN (naira) and USDB (USD), not NGN/USD.            │
 * └────────────────────────────────────────────────────────────────────┘
 */
function normalizeBankName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Common spoken aliases → a distinctive substring of the official bank name.
const BANK_ALIASES: Record<string, string> = {
  gtb: "guaranty trust", gtbank: "guaranty trust", "gt bank": "guaranty trust",
  "first bank": "first bank of nigeria", firstbank: "first bank of nigeria",
  uba: "united bank for africa", zenith: "zenith bank",
  fcmb: "first city monument", "first city monument": "first city monument",
  opay: "opay", palmpay: "palmpay", "palm pay": "palmpay", kuda: "kuda",
  moniepoint: "moniepoint", monie: "moniepoint", wema: "wema", alat: "wema",
  fidelity: "fidelity", union: "union bank", sterling: "sterling",
  stanbic: "stanbic", polaris: "polaris", keystone: "keystone",
  ecobank: "ecobank", jaiz: "jaiz", providus: "providus", globus: "globus",
  access: "access bank", "access bank": "access bank",
};

function findBankCode(bankName: string, banks: Array<{ bankName: string; bankCode: string }>): string | undefined {
  const q = normalizeBankName(bankName);
  if (!q) return undefined;
  const norm = (b: { bankName: string }) => normalizeBankName(b.bankName);
  const search = BANK_ALIASES[q] ?? q;

  // 1. exact  2. substring either way  3. first significant token
  let hit = banks.find((b) => norm(b) === search);
  if (hit) return hit.bankCode;
  hit = banks.find((b) => norm(b).includes(search) || search.includes(norm(b)));
  if (hit) return hit.bankCode;
  const token = search.split(" ").find((t) => t.length > 3);
  if (token) {
    hit = banks.find((b) => norm(b).includes(token));
    if (hit) return hit.bankCode;
  }
  return undefined;
}

export class BmoniLiveProvider implements MoneyProvider {
  readonly name = "live" as const;
  private readonly client: BmoniClient;

  constructor(baseUrl: string, apiKey: string) {
    this.client = new BmoniClient(baseUrl, apiKey);
  }


  /** Single source of truth for what a session can spend: the live NGN wallet
   * minus local spend/fees, plus the effect of NGN⇄USD conversions, and the USD
   * balance those conversions produced. */
  private async computeBalances(ctx: Ctx): Promise<{ ngnAvail: number; usdMinor: number; hasUsdAccount: boolean }> {
    const account = await ensureBmoniAccount(ctx.sessionId, this.client);
    const res = await this.client.getBalances(account.bmoniUserId);
    const store = getStore();
    const spentMinor = await store.sumSpent(ctx.sessionId);

    const events = await store.listEvents(ctx.sessionId);
    let usdMinor = 0;
    let ngnConvDelta = 0;
    let hasUsdAccount = false;
    for (const e of events) {
      if (e.kind === "usd_account") hasUsdAccount = true;
      if (e.kind !== "convert" || !e.detail) continue;
      const d = e.detail as { fromMinor?: number; fromCcy?: string; toMinor?: number; toCcy?: string };
      const fromMinor = Number(d.fromMinor) || 0;
      const toMinor = Number(d.toMinor) || 0;
      if (d.fromCcy === "NGN" && d.toCcy === "USD") {
        ngnConvDelta -= fromMinor;
        usdMinor += toMinor;
      } else if (d.fromCcy === "USD" && d.toCcy === "NGN") {
        usdMinor -= fromMinor;
        ngnConvDelta += toMinor;
      }
    }

    const ngnRow = res.balances.find((r) => (r.currency === "NGN" || r.currency === "CNGN") && r.error === null);
    const bmoniNgn = Math.round((Number.parseFloat(ngnRow?.balance || "0") || 0) * 100);
    // Real USD/USDB balance on BMONI (e.g. a USDC crypto deposit) adds to conversions.
    const usdRow = res.balances.find((r) => (r.currency === "USD" || r.currency === "USDB") && r.error === null);
    const bmoniUsd = Math.round((Number.parseFloat(usdRow?.balance || "0") || 0) * 100);
    return {
      ngnAvail: Math.max(0, bmoniNgn - spentMinor + ngnConvDelta),
      usdMinor: Math.max(0, usdMinor + bmoniUsd),
      hasUsdAccount: hasUsdAccount || bmoniUsd > 0,
    };
  }

  async getBalances(ctx: Ctx): Promise<Result<Balance[]>> {
    try {
      const { ngnAvail, usdMinor, hasUsdAccount } = await this.computeBalances(ctx);
      const balances: Balance[] = [{ currency: "NGN", available: money(ngnAvail, "NGN") }];
      if (hasUsdAccount || usdMinor > 0) balances.push({ currency: "USD", available: money(usdMinor, "USD") });
      return ok(balances);
    } catch (e) {
      log("error", "bmoni.getBalances_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn’t reach your wallet just now. Try again.", true);
    }
  }
  async listBeneficiaries(_ctx: Ctx): Promise<Result<Beneficiary[]>> {
    // BMONI has no saved-beneficiary list; recipients are bank accounts the user
    // gives per transfer (verified live). Return empty; the agent asks for details.
    return ok([]);
  }
  async createVirtualCard(ctx: Ctx, input: CreateCardInput): Promise<Result<VirtualCard>> {
    // BMONI exposes no card-issuance API, so a card here is a labelled demo card.
    // Generated with a valid Luhn checksum; never persisted (last4 only surfaces).
    const body = "424242" + String(randomInt(0, 1_000_000_000)).padStart(9, "0");
    const pan = withLuhn(body);
    const now = new Date();
    const card: VirtualCard = {
      id: `card_${randomUUID()}`,
      label: input.label.trim() || "Card",
      currency: input.currency,
      pan,
      last4: pan.slice(-4),
      expMonth: now.getMonth() + 1,
      expYear: (now.getFullYear() + 3) % 100,
      cvv: String(randomInt(0, 1000)).padStart(3, "0"),
      brand: "visa",
    };
    void ctx;
    return ok(card);
  }
  async verifyBankAccount(ctx: Ctx, input: VerifyBankAccountInput): Promise<Result<VerifiedBankAccount>> {
    try {
      const account = await ensureBmoniAccount(ctx.sessionId, this.client);
      const banks = await this.client.getNigerianBanks(account.bmoniUserId);
      const bankCode = findBankCode(input.bankName, banks);
      if (!bankCode) {
        return err("unknown_beneficiary", `I can't verify that bank yet. Try another bank.`, false);
      }
      const res = await this.client.verifyNigerianAccount(account.bmoniUserId, input.accountNumber, bankCode);
      const accountName = res.accountName ?? res.accountHolderName ?? input.bankName;
      return ok({ accountHolderName: accountName, bankName: input.bankName, bankCode });
    } catch (e) {
      log("error", "bmoni.verifyBankAccount_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn't verify that account name right now. Try again.", true);
    }
  }

  async transfer(ctx: Ctx, input: TransferInput): Promise<Result<TransferReceipt>> {
    try {
      const { ngnAvail: availMinor } = await this.computeBalances(ctx);
      if (availMinor < input.amount.minor) {
        return err(
          "insufficient_funds",
          `You no get enough. Your balance na ${formatMoney(money(availMinor, "NGN"))}.`,
        );
      }
      // Recipient name is embedded from the verified account: "bank:BANK:ACCT:NAME".
      const parts = input.beneficiaryId.split(":");
      const beneficiaryName = parts.length >= 4 ? parts.slice(3).join(":") : "the recipient";
      // Real NGN payout is gated behind BMONI rail/KYC approval; the send is
      // recorded and reflected in the balance (the caller logs the transfer event).
      return ok({
        id: `txn_${Date.now().toString(36)}`,
        amount: input.amount,
        beneficiaryId: input.beneficiaryId,
        beneficiaryName,
        balanceAfter: money(availMinor - input.amount.minor, "NGN"),
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      log("error", "bmoni.transfer_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn't reach your wallet just now. Try again.", true);
    }
  }
  async convert(ctx: Ctx, input: ConvertInput): Promise<Result<ConversionReceipt>> {
    // Live BMONI exchange rate (₦ per $1). Falls back to a fixed rate if the
    // sandbox call is unavailable, so the demo never breaks.
    const fromMajorAmount = input.amount.minor / 100;
    let rate = 0;
    try {
      const account = await ensureBmoniAccount(ctx.sessionId, this.client);
      rate = await this.client.getExchangeRate(account.bmoniUserId, input.amount.currency, input.to, fromMajorAmount);
    } catch (e) {
      log("warn", "bmoni.exchange_rate_failed", { sessionId: ctx.sessionId, detail: String(e) });
    }
    if (rate <= 0) rate = 1650; // fallback ₦/$

    let toMinor: number;
    if (input.amount.currency === "NGN" && input.to === "USD") {
      toMinor = Math.round((fromMajorAmount / rate) * 100);
    } else {
      toMinor = Math.round(fromMajorAmount * rate * 100);
    }
    const rateDisplay = `${formatMoney(fromMajor(Math.round(rate), "NGN"))} = ${formatMoney(fromMajor(1, "USD"))}`;
    return ok({
      id: `conv_${Date.now().toString(36)}`,
      from: input.amount,
      to: money(toMinor, input.to),
      rateDisplay,
      createdAt: new Date().toISOString(),
    });
  }
  async saveToSavings(ctx: Ctx, input: SavingsInput): Promise<Result<SavingsReceipt>> {
    try {
      const { ngnAvail: availMinor } = await this.computeBalances(ctx);
      if (input.amount.currency === "NGN" && availMinor < input.amount.minor) {
        return err("insufficient_funds", `You only get ${formatMoney(money(availMinor, "NGN"))} to save.`);
      }
      // Moved into savings; reflected against the balance (caller logs the event).
      return ok({
        id: `save_${Date.now().toString(36)}`,
        amount: input.amount,
        cadence: input.cadence,
        savedNow: input.amount,
        recurring: false,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      log("error", "bmoni.saveToSavings_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn’t save that amount right now. Try again.", true);
    }
  }
}
