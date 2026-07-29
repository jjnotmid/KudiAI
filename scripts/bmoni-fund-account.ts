/**
 * Create a real BMONI sandbox account (CNGN + USDB wallets) and print the phone
 * number to give BMONI for manual funding, plus a live balance readout.
 * Re-run any time to check whether the funds have landed.
 *
 *   npx tsx scripts/bmoni-fund-account.ts            # create a new account
 *   npx tsx scripts/bmoni-fund-account.ts <userId>   # re-check an existing one
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}
const BASE = process.env.BMONI_BASE_URL ?? "https://embedded-dev.bmoni.com";
const KEY = process.env.BMONI_API_KEY ?? "";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = await res.text();
  }
  return { status: res.status, json };
}

async function makeWallet(userId: string, currency: "CNGN" | "USDB") {
  const owner = privateKeyToAccount(generatePrivateKey());
  const ch = (await call("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency, userOwnerAddress: owner.address })).json as { challengeId?: string; message?: string };
  if (!ch.message) return null;
  const sig = await owner.signMessage({ message: ch.message });
  const w = (await call("POST", `/v1/users/${userId}/smart-wallets/create-managed`, { currency, userOwnerAddress: owner.address, ownerProofChallengeId: ch.challengeId, ownerProofSignature: sig })).json as { id?: string; walletAddress?: string };
  return w;
}

async function showBalances(userId: string) {
  const b = (await call("GET", `/v1/users/${userId}/smart-wallets/account/balances`)).json as { balances?: { currency: string; balance: string }[] };
  console.log("\nBalances:");
  for (const row of b.balances ?? []) console.log(`  ${row.currency}: ${row.balance}`);
}

async function main() {
  const existing = process.argv[2];
  if (existing) {
    console.log("Re-checking userId:", existing);
    await showBalances(existing);
    return;
  }

  const rid = Math.floor(Math.random() * 1e7);
  const phone = `+23481${String(rid).padStart(7, "0")}`;
  const email = `kudi.demo.${rid}@kudi.example.com`;
  const user = (await call("POST", "/v1/users", { firstName: "Kudi Demo", email, phoneNumber: phone })).json as { user?: { bmoniUserId?: string } };
  const userId = user.user?.bmoniUserId;
  if (!userId) {
    console.log("Failed to create user:", JSON.stringify(user));
    return;
  }
  const ngn = await makeWallet(userId, "CNGN");
  const usd = await makeWallet(userId, "USDB");

  console.log("\n════════ GIVE THIS TO BMONI FOR FUNDING ════════");
  console.log("Phone number:", phone);
  console.log("═════════════════════════════════════════════════");
  console.log("userId:", userId);
  console.log("CNGN wallet:", ngn?.walletAddress);
  console.log("USDB wallet:", usd?.walletAddress);
  await showBalances(userId);
  console.log("\nAfter BMONI funds it, re-check with:");
  console.log(`  npx tsx scripts/bmoni-fund-account.ts ${userId}`);
}

main().catch((e) => console.error("ERR", e));
