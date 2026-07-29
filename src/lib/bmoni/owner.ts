import { createHmac } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { PrivateKeyAccount } from "viem";
import { getEnv } from "@/lib/env";

/**
 * Each Kudi user needs an on-chain "owner" keypair to prove ownership of their
 * BMONI managed smart wallet. We DERIVE it deterministically from SESSION_SECRET
 * + the session id, so the private key is NEVER stored anywhere — it is
 * regenerated on demand and is identical across restarts. Only non-secret ids
 * (bmoniUserId, smartWalletId) are persisted.
 */
export function deriveOwnerAccount(sessionId: string): PrivateKeyAccount {
  const secret = getEnv().SESSION_SECRET;
  const hex = createHmac("sha256", secret).update(`bmoni-owner:${sessionId}`).digest("hex");
  // 32 bytes → a valid secp256k1 private key (astronomically unlikely to be out of range).
  return privateKeyToAccount(`0x${hex}`);
}
