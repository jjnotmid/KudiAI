import { randomInt, randomUUID } from "node:crypto";
import { fromMajor } from "@/lib/money/types";
import { formatMoney } from "@/lib/money/format";
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

  private notReady<T>(msg = "That isn’t available on the live connection yet."): Result<T> {
    return err("not_implemented", msg, false);
  }

  async getBalances(ctx: Ctx): Promise<Result<Balance[]>> {
    try {
      const account = await ensureBmoniAccount(ctx.sessionId, this.client);
      const res = await this.client.getBalances(account.bmoniUserId);
      const balances: Balance[] = res.balances
        .filter((r) => r.error === null)
        .map((r) => {
          const currency = r.currency === "USD" || r.currency === "USDB" ? "USD" : "NGN";
          // NOTE(unit): BMONI returns `balance` as a string. Until we see a
          // funded wallet we assume a human-readable major amount (e.g. "1000").
          // If it turns out to be minor units, switch to money(parseInt, currency).
          const major = Number.parseFloat(r.balance || "0");
          return { currency, available: fromMajor(Number.isFinite(major) ? major : 0, currency) };
        });
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
      const account = await ensureBmoniAccount(ctx.sessionId, this.client);
      const res = await this.client.getBalances(account.bmoniUserId);
      const ngn = res.balances.find((r) => r.currency === "NGN" || r.currency === "CNGN");
      const availMinor = Math.round(Number.parseFloat(ngn?.balance || "0") * 100);
      if (availMinor < input.amount.minor) {
        const bal = fromMajor(availMinor / 100, "NGN");
        return err(
          "insufficient_funds",
          `You no get enough. Your balance na ${formatMoney(bal)}. Fund your wallet first (I show you the account phone during setup).`,
        );
      }
      // Wallet is funded → the real NGN offramp (verify → register → offramp →
      // EIP-712 sign) is the remaining live step.
      return this.notReady("Your wallet get money — the send/offramp step dey come. Verification and balance are already live.");
    } catch (e) {
      log("error", "bmoni.transfer_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn't reach your wallet just now. Try again.", true);
    }
  }
  async convert(ctx: Ctx, input: ConvertInput): Promise<Result<ConversionReceipt>> {
    try {
      const account = await ensureBmoniAccount(ctx.sessionId, this.client);
      const sourceCurrency = input.amount.currency === "USD" ? "USDB" : "CNGN";
      const targetCurrency = sourceCurrency === "CNGN" ? "USDB" : "CNGN";
      const sourceAmount = (input.amount.minor / 100).toFixed(2);
      const res = await this.client.convertCurrency(account.bmoniUserId, account.smartWalletId, {
        sourceCurrency,
        sourceAmount,
        targetCurrency,
      });
      const targetMinor = Math.round(Number.parseFloat(String(res.targetAmount ?? "0")) * 100);
      const toMoney = fromMajor(targetMinor / 100, input.to);
      return ok({
        id: `conv_${Date.now()}`,
        from: input.amount,
        to: toMoney,
        rateDisplay: res.exchangeRate ? `${res.exchangeRate}` : "Live exchange quote",
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      log("error", "bmoni.convert_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn’t complete the conversion right now. Try again.", true);
    }
  }
  async saveToSavings(ctx: Ctx, input: SavingsInput): Promise<Result<SavingsReceipt>> {
    try {
      const account = await ensureBmoniAccount(ctx.sessionId, this.client);
      const sourceCurrency = input.amount.currency === "USD" ? "USDB" : "CNGN";
      const targetCurrency = sourceCurrency === "CNGN" ? "USDB" : "CNGN";
      const sourceAmount = (input.amount.minor / 100).toFixed(2);
      const res = await this.client.convertCurrency(account.bmoniUserId, account.smartWalletId, {
        sourceCurrency,
        sourceAmount,
        targetCurrency,
      });
      const targetMinor = Math.round(Number.parseFloat(String(res.targetAmount ?? "0")) * 100);
      const savedCurrency = targetCurrency === "USDB" ? "USD" : "NGN";
      const savedNow = fromMajor(targetMinor / 100, savedCurrency);
      return ok({
        id: `save_${Date.now()}`,
        amount: input.amount,
        cadence: input.cadence,
        savedNow,
        recurring: false,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      log("error", "bmoni.saveToSavings_failed", { sessionId: ctx.sessionId, detail: String(e) });
      return err("provider_unavailable", "I couldn’t save that amount right now. Try again.", true);
    }
  }
}
