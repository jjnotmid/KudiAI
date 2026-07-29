/** Probe BMONI verify-nigerian-account to see if the sandbox returns a real name. */
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

async function main() {
  const rid = Math.floor(Math.random() * 1e8);
  const user = await call("POST", "/v1/users", {
    firstName: "VProbe",
    email: `v.${rid}@example.com`,
    phoneNumber: `+23480${String(rid).padStart(8, "0").slice(0, 8)}`,
  });
  const userId = (user.json as { user?: { bmoniUserId?: string } })?.user?.bmoniUserId;
  console.log("userId:", userId);
  if (!userId) return;

  // Provision wallet (verify may require it)
  const owner = privateKeyToAccount(generatePrivateKey());
  const ch = (await call("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "CNGN", userOwnerAddress: owner.address })).json as { challengeId?: string; message?: string };
  if (ch.message) {
    const sig = await owner.signMessage({ message: ch.message });
    await call("POST", `/v1/users/${userId}/smart-wallets/create-managed`, { currency: "CNGN", userOwnerAddress: owner.address, ownerProofChallengeId: ch.challengeId, ownerProofSignature: sig });
  }

  const banks = (await call("GET", `/v1/users/${userId}/bank-accounts/nigerian-banks`)).json as { banks?: { bankName: string; bankCode: string }[] };
  const access = banks.banks?.find((b) => /access bank/i.test(b.bankName));
  console.log("Access Bank code:", access?.bankCode);

  // Try several sample account numbers
  for (const acct of ["0123456789", "0000000000", "1234567890", "0690000031"]) {
    const r = await call("POST", `/v1/users/${userId}/bank-accounts/verify-nigerian-account`, {
      accountNumber: acct,
      bankCode: access?.bankCode ?? "000014",
    });
    console.log(`verify ${acct}:`, r.status, JSON.stringify(r.json));
  }
}

main().catch((e) => console.error("PROBE ERR", e));
