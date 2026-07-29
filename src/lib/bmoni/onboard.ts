import { randomInt } from "node:crypto";
import { getEnv } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { BmoniAccount } from "@/lib/store/types";
import { log } from "@/lib/log";
import { BmoniClient } from "./client";
import { deriveOwnerAccount } from "./owner";

const SANDBOX_BVN = "22222222222";

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

  // KYC — activate the Nigerian rail with the sandbox BVN. Best-effort.
  let kycActive = false;
  try {
    await client.startNigeriaKyc(user.bmoniUserId, {
      bvn: SANDBOX_BVN,
      ngnWalletAddress: wallet.walletAddress,
      ngnWalletIndex: 0,
    });
    kycActive = true;
  } catch (e) {
    log("warn", "bmoni.kyc_pending", { sessionId, detail: String(e).slice(0, 160) });
  }

  const account: BmoniAccount = {
    bmoniUserId: user.bmoniUserId,
    smartWalletId: wallet.id,
    walletAddress: wallet.walletAddress,
    phoneNumber,
    kycActive,
  };
  await store.saveBmoniAccount(sessionId, account);
  log("info", "bmoni.onboarded", { sessionId, walletAddress: account.walletAddress, kycActive });
  return account;
}
