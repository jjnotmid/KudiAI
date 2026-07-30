/** Probe live BMONI deposit + exchange endpoints. npx tsx scripts/deposit-exchange-probe.ts */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* env present */
}
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BMONI_BASE_URL!;
const KEY = process.env.BMONI_API_KEY!;

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* */
  }
  return { status: res.status, json };
}
function show(l: string, r: { status: number; json: unknown }) {
  console.log(`\n=== ${l} → ${r.status} ===\n${JSON.stringify(r.json, null, 2)?.slice(0, 900)}`);
}

async function main() {
  const stamp = String(Date.now());
  const userId = ((await req("POST", "/v1/users", {
    firstName: "Dep",
    email: `dep.${stamp}@kudi.test`,
    phoneNumber: `+2348${stamp.slice(-9)}`,
  })).json as any)?.user?.bmoniUserId;
  const owner = privateKeyToAccount(generatePrivateKey());
  const chal = await req("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "CNGN", userOwnerAddress: owner.address });
  const signature = await owner.signMessage({ message: (chal.json as any)?.message });
  const smartWalletId = ((await req("POST", `/v1/users/${userId}/smart-wallets/create-managed`, {
    currency: "CNGN",
    userOwnerAddress: owner.address,
    ownerProofChallengeId: (chal.json as any)?.challengeId,
    ownerProofSignature: signature,
  })).json as any)?.id;
  console.log("userId", userId, "swid", smartWalletId);

  // Provision a USDB wallet too (deposit needs a USDB group wallet)
  const chal2 = await req("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "USDB", userOwnerAddress: owner.address });
  const sig2 = await owner.signMessage({ message: (chal2.json as any)?.message });
  const usdbWallet = await req("POST", `/v1/users/${userId}/smart-wallets/create-managed`, {
    currency: "USDB",
    userOwnerAddress: owner.address,
    ownerProofChallengeId: (chal2.json as any)?.challengeId,
    ownerProofSignature: sig2,
  });
  show("create-managed USDB", usdbWallet);
  const usdbSwid = (usdbWallet.json as any)?.id;

  show("POST deposit/wallet USDB {Base,USDC}", await req("POST", `/v1/users/${userId}/deposit/wallet`, { smartWalletId: usdbSwid, chain: "Base", currency: "USDC" }));

  // Exchange (convert) — correct shape { amount, from, to }
  show("POST exchange/convert {amount,from,to}", await req("POST", `/v1/users/${userId}/exchange/convert`, { amount: 10, from: "CNGN", to: "USDB" }));
  show("GET balances", await req("GET", `/v1/users/${userId}/smart-wallets/account/balances`));
}
main().catch((e) => console.error(e));
