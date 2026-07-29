import { randomInt } from "node:crypto";
import { getEnv } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { BmoniAccount } from "@/lib/store/types";
import { log } from "@/lib/log";
import { BmoniClient } from "./client";
import { deriveOwnerAccount } from "./owner";

export const SANDBOX_BVN = "22222222222";

/** Build a client from env (used when the caller doesn't already have one). */
function clientFromEnv(): BmoniClient {
  const env = getEnv();
  return new BmoniClient(env.BMONI_BASE_URL, env.BMONI_API_KEY);
}

/** Convenience for the dispatcher: onboard a session with its own client. */
export function provisionAccount(sessionId: string): Promise<BmoniAccount> {
  return ensureBmoniAccount(sessionId, clientFromEnv());
}

/**
 * Ensure the session has a BMONI user + CNGN smart wallet + activated NGN rail
 * (KYC), creating them once and caching the (non-secret) ids in the Store.
 * Idempotent. The owner key is derived, never stored.
 */
export async function ensureBmoniAccount(sessionId: string, client: BmoniClient): Promise<BmoniAccount> {
  const store = getStore();
  const existing = await store.getBmoniAccount(sessionId);
  if (existing) return existing;

  const owner = deriveOwnerAccount(sessionId);

  // Random contact details so re-onboarding never collides (409). The owner key
  // stays deterministic per session; only the BMONI-facing email/phone are new.
  const rid = randomInt(0, 1_000_000_000);
  const email = `kudi.${rid.toString(36)}${randomInt(0, 1_000_000)}@kudi.example.com`;
  const phoneNumber = `+2348${String(rid).padStart(9, "0")}`;

  const user = await client.createUser({ firstName: "Kudi User", email, phoneNumber });

  // CNGN (naira) smart wallet.
  const challenge = await client.ownerProofChallenge(user.bmoniUserId, "CNGN", owner.address);
  const signature = await owner.signMessage({ message: challenge.message });
  const wallet = await client.createManagedWallet(
    user.bmoniUserId,
    "CNGN",
    owner.address,
    challenge.challengeId,
    signature,
  );

  const account: BmoniAccount = {
    bmoniUserId: user.bmoniUserId,
    smartWalletId: wallet.id,
    walletAddress: wallet.walletAddress,
    phoneNumber,
    kycActive: false, // KYC is an interactive step (see activateKyc)
  };
  await store.saveBmoniAccount(sessionId, account);
  log("info", "bmoni.onboarded", { sessionId, walletAddress: account.walletAddress });
  return account;
}

// ── Interactive KYC (real BMONI: profile → documents → activate) ─────────
async function acct(sessionId: string): Promise<BmoniAccount> {
  const a = await getStore().getBmoniAccount(sessionId);
  if (!a) throw new Error("no BMONI account for session");
  return a;
}

/** Submit the KYC profile from the details the user gave, with sensible defaults. */
export async function submitKycProfile(
  sessionId: string,
  input: { fullName: string; dob: string; bvn: string },
  client: BmoniClient = clientFromEnv(),
): Promise<void> {
  const account = await acct(sessionId);
  const parts = input.fullName.trim().split(/\s+/);
  const firstName = parts[0] || "Kudi";
  const lastName = parts.slice(1).join(" ") || firstName;
  await client.submitKycProfile(account.bmoniUserId, {
    personalInfo: { firstName, lastName, dateOfBirth: input.dob, nationality: "NGA" },
    address: { streetLine1: "1 Kudi Street", city: "Lagos", state: "Lagos", postalCode: "100001", countryCode: "NGA" },
    employment: { employmentStatus: "employed", occupationCode: "119199" },
    sourceOfFunds: "business",
    identificationNumbers: [{ type: "bvn", number: input.bvn, issuingCountryCode: "NGA" }],
  });
}

/** The facial step — upload the user's selfie as the biometric document.
 * Confirmed multipart shape: field name "selfie", type "selfie". */
export async function uploadKycSelfie(sessionId: string, bytes: Uint8Array, mime: string, client: BmoniClient = clientFromEnv()): Promise<void> {
  const account = await acct(sessionId);
  await client.uploadKycDocument(
    account.bmoniUserId,
    "biometric",
    "selfie",
    { bytes, filename: "selfie.jpg", mime: mime || "image/jpeg" },
    { type: "selfie" },
  );
}

/** Finalise KYC: activate the profile. Returns whether it activated. */
export async function finalizeKyc(sessionId: string, client: BmoniClient = clientFromEnv()): Promise<{ activated: boolean; missing?: string[] }> {
  const account = await acct(sessionId);
  let missing: string[] | undefined;
  try {
    const rd = await client.kycReadiness(account.bmoniUserId);
    if (!rd.ready) missing = rd.missing;
  } catch { /* ignore */ }
  let activated = false;
  try {
    const r = (await client.kycActivate(account.bmoniUserId, "id-and-liveness")) as { activated?: boolean; status?: string };
    activated = Boolean(r?.activated) || r?.status === "active" || r?.status === "pending";
  } catch (e) {
    log("warn", "bmoni.kyc_activate_failed", { sessionId, detail: String(e).slice(0, 160) });
  }
  await getStore().saveBmoniAccount(sessionId, { ...account, kycActive: activated });
  return { activated, missing };
}
