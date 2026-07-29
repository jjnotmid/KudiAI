/**
 * Thin real HTTP client for the BMONI Embedded API. Every shape here was
 * confirmed against the live sandbox (see docs/bmoni/API.md and
 * scripts/bmoni-probe.ts). Auth is the `x-api-key` header. Currencies are
 * stablecoin codes: CNGN (naira), USDB (USD).
 */

export type BmoniStableCurrency = "CNGN" | "USDB";

export interface BmoniUser {
  bmoniUserId: string;
  id: string;
}
export interface OwnerProofChallenge {
  challengeId: string;
  groupId: string;
  message: string;
  expiresAt: string;
}
export interface BmoniWallet {
  id: string; // smartWalletId
  currency: string; // "NGN" (display)
  walletAddress: string;
  isActive: boolean;
}
export interface BmoniBalanceRow {
  smartWalletId: string;
  currency: string;
  balance: string;
  error: string | null;
}
export interface BmoniBalances {
  smartAccountAddress: string;
  balances: BmoniBalanceRow[];
}
export interface NigerianBank {
  bankName: string;
  bankCode: string;
}

export interface NigerianAccountVerification {
  accountNumber: string;
  accountName?: string;
  accountHolderName?: string;
  bankName?: string;
  bankCode?: string;
}

export class BmoniHttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`bmoni ${status}: ${JSON.stringify(payload)?.slice(0, 300)}`);
  }
}

export class BmoniClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }
    if (!res.ok) throw new BmoniHttpError(res.status, json);
    return json as T;
  }

  private async reqWithBodyVariants<T>(method: string, path: string, candidates: readonly unknown[]): Promise<T> {
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return await this.req<T>(method, path, candidate);
      } catch (error) {
        lastError = error;
        if (!(error instanceof BmoniHttpError) || ![400, 404, 422].includes(error.status)) {
          throw error;
        }
      }
    }
    throw lastError ?? new BmoniHttpError(500, { message: "no_body_variant_succeeded" });
  }

  async createUser(input: { firstName: string; email: string; phoneNumber: string }): Promise<BmoniUser> {
    const r = await this.req<{ user: BmoniUser }>("POST", "/v1/users", input);
    return r.user;
  }

  async ownerProofChallenge(
    userId: string,
    currency: BmoniStableCurrency,
    ownerAddress: string,
  ): Promise<OwnerProofChallenge> {
    return this.req("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, {
      currency,
      userOwnerAddress: ownerAddress,
    });
  }

  async createManagedWallet(
    userId: string,
    currency: BmoniStableCurrency,
    ownerAddress: string,
    ownerProofChallengeId: string,
    ownerProofSignature: string,
  ): Promise<BmoniWallet> {
    return this.req("POST", `/v1/users/${userId}/smart-wallets/create-managed`, {
      currency,
      userOwnerAddress: ownerAddress,
      ownerProofChallengeId,
      ownerProofSignature,
    });
  }

  /** Look up BVN holder details (used to confirm identity during KYC). */
  async bvnLookup(userId: string, bvn: string): Promise<Record<string, unknown>> {
    return this.req("GET", `/v1/users/${userId}/kyc/bvn-lookup/${bvn}`);
  }

  /** Submit the KYC profile (personalInfo/address/employment/identificationNumbers). */
  async submitKycProfile(userId: string, profile: unknown): Promise<unknown> {
    return this.req("PATCH", `/v1/users/${userId}/kyc`, profile);
  }

  async kycReadiness(userId: string): Promise<{ ready: boolean; missing: string[] }> {
    return this.req("GET", `/v1/users/${userId}/kyc/readiness`);
  }

  async kycActivate(userId: string, sumsubLevelName?: string): Promise<unknown> {
    return this.req("POST", `/v1/users/${userId}/kyc/activate`, sumsubLevelName ? { sumsubLevelName } : {});
  }

  /** Upload a KYC document (multipart). `fileField` is the multipart field name
   * BMONI expects for that endpoint (e.g. biometric → "selfie"). */
  async uploadKycDocument(
    userId: string,
    kind: "identification" | "proof-of-address" | "biometric",
    fileField: string,
    file: { bytes: Uint8Array; filename: string; mime: string },
    fields: Record<string, string> = {},
  ): Promise<unknown> {
    const form = new FormData();
    form.append(fileField, new Blob([file.bytes as BlobPart], { type: file.mime }), file.filename);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch(`${this.baseUrl}/v1/users/${userId}/kyc/documents/${kind}`, {
      method: "POST",
      headers: { "x-api-key": this.apiKey },
      body: form,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* */
    }
    if (!res.ok) throw new BmoniHttpError(res.status, json);
    return json;
  }

  /** Activate the Nigerian rail (KYC) with the BVN. Best-effort. */
  async startNigeriaKyc(
    userId: string,
    input: { bvn: string; ngnWalletAddress: string; ngnWalletIndex: number },
  ): Promise<unknown> {
    return this.reqWithBodyVariants("POST", `/v1/users/${userId}/onboarding/start-nigeria`, [
      { bvn: input.bvn, ngnWalletAddress: input.ngnWalletAddress, ngnWalletIndex: input.ngnWalletIndex },
      { bvn: input.bvn },
    ]);
  }

  async onboardingStatus(userId: string): Promise<unknown> {
    return this.req("GET", `/v1/users/${userId}/onboarding/status`);
  }

  async getBalances(userId: string): Promise<BmoniBalances> {
    return this.req("GET", `/v1/users/${userId}/smart-wallets/account/balances`);
  }

  async getNigerianBanks(userId: string): Promise<NigerianBank[]> {
    const r = await this.req<{ banks: NigerianBank[] }>(
      "GET",
      `/v1/users/${userId}/bank-accounts/nigerian-banks`,
    );
    return r.banks ?? [];
  }

  async convertCurrency(
    userId: string,
    smartWalletId: string,
    input: { sourceCurrency: string; sourceAmount: string; targetCurrency: string },
  ): Promise<{ quoteId?: string; sourceAmount?: string; targetAmount?: string; exchangeRate?: string }> {
    const amountNumber = Number.parseFloat(input.sourceAmount);
    const candidates = [
      {
        from: this.normalizeCurrency(input.sourceCurrency),
        to: this.normalizeCurrency(input.targetCurrency),
        amount: Number.isFinite(amountNumber) ? amountNumber : 0.01,
      },
      {
        from: this.normalizeCurrency(input.sourceCurrency),
        to: this.normalizeCurrency(input.targetCurrency),
        amount: Number.isFinite(amountNumber) ? amountNumber : 0.01,
        sourceWalletId: smartWalletId,
      },
    ];
    return this.reqWithBodyVariants("POST", `/v1/users/${userId}/exchange/convert`, candidates);
  }

  private normalizeCurrency(currency: string): string {
    if (currency === "CNGN") return "NGN";
    if (currency === "USDB") return "USD";
    return currency;
  }

  async verifyNigerianAccount(
    userId: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<NigerianAccountVerification> {
    return this.req("POST", `/v1/users/${userId}/bank-accounts/verify-nigerian-account`, {
      accountNumber,
      bankCode,
    });
  }

  async registerNigerianWithdrawalAccount(
    userId: string,
    input: { accountNumber: string; bankCode: string; bankName: string; accountHolderName: string },
  ): Promise<{ id: string }> {
    return this.req("POST", `/v1/users/${userId}/bank-accounts/withdrawal-accounts/nigeria`, input);
  }
}
