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
  VirtualCard,
} from "./types";
import { err } from "./types";

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
export class BmoniLiveProvider implements MoneyProvider {
  readonly name = "live" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  // AUTH — confirmed: x-api-key header (NOT Bearer). Note: base URL must not
  // include /v1; the endpoint paths already carry it.
  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
    };
  }

  private async call<T>(path: string, init: RequestInit): Promise<Result<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        return err(
          res.status === 429 ? "rate_limited" : "provider_unavailable",
          "The money service could not complete that just now.",
          res.status >= 500 || res.status === 429,
        );
      }
      // TODO(day-zero): parse through a Zod schema before returning — never
      // trust the wire shape. See src/lib/bmoni/schema.ts (to be written).
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return err("provider_unavailable", "Couldn’t reach the money service.", true);
    }
  }

  // TODO(day-zero) #2 — ENDPOINTS: replace the paths/bodies below with the real
  // BMONI routes once the checklist is filled in. Until then they return
  // not_implemented so the app degrades gracefully instead of faking success.
  private notReady<T>(): Result<T> {
    return err(
      "not_implemented",
      "The live BMONI connection isn’t configured yet.",
      false,
    );
  }

  async getBalances(_ctx: Ctx): Promise<Result<Balance[]>> {
    void this.call; // referenced once real endpoints are wired
    return this.notReady();
  }
  async listBeneficiaries(_ctx: Ctx): Promise<Result<Beneficiary[]>> {
    return this.notReady();
  }
  async createVirtualCard(_ctx: Ctx, _input: CreateCardInput): Promise<Result<VirtualCard>> {
    return this.notReady();
  }
  async transfer(_ctx: Ctx, _input: TransferInput): Promise<Result<TransferReceipt>> {
    return this.notReady();
  }
  async convert(_ctx: Ctx, _input: ConvertInput): Promise<Result<ConversionReceipt>> {
    return this.notReady();
  }
  async saveToSavings(_ctx: Ctx, _input: SavingsInput): Promise<Result<SavingsReceipt>> {
    return this.notReady();
  }
}
