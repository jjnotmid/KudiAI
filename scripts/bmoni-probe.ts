/**
 * Live BMONI sandbox probe — walks the real NGN flow step by step and prints
 * exact request/response shapes so we can build the live provider against
 * confirmed behaviour (not guesses). Safe: sandbox only, test funds.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}

const BASE = process.env.BMONI_BASE_URL ?? "https://embedded-dev.bmoni.com";
const KEY = process.env.BMONI_API_KEY ?? "";

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
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

function show(label: string, v: unknown): void {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(v, null, 2));
}

async function main(): Promise<void> {
  console.log("BASE:", BASE, "KEY set:", KEY.length > 0);

  // 1) Create user
  const rid = Math.floor(Math.random() * 1e8);
  const user = await call("POST", "/v1/users", {
    firstName: "KudiProbe",
    email: `kudi.probe.${rid}@example.com`,
    phoneNumber: `+23480${String(rid).padStart(8, "0").slice(0, 8)}`,
  });
  show("POST /v1/users", user);
  const userId =
    (user.json as { user?: { bmoniUserId?: string } })?.user?.bmoniUserId ??
    (user.json as { bmoniUserId?: string })?.bmoniUserId;
  if (!userId) {
    console.log("No userId — stopping.");
    return;
  }
  console.log("userId:", userId);

  // 2) Owner keypair (we hold the owner key; BMONI manages the smart wallet).
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  console.log("owner address:", account.address);

  // 3) Owner-proof challenge (CNGN = NGN wallet)
  const challenge = await call("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, {
    currency: "CNGN",
    userOwnerAddress: account.address,
  });
  show("POST owner-proof-challenges", challenge);
  const ch = challenge.json as { challengeId?: string; groupId?: string; message?: string };
  if (!ch.message) {
    console.log("No message — inspect the shape above and stop.");
    return;
  }

  // 4) Sign the challenge message (personal_sign / EIP-191).
  const signature = await account.signMessage({ message: ch.message });
  console.log("\nsigned challenge with personal_sign. sig:", signature.slice(0, 20) + "…");

  // 5) Create managed smart wallet (try a few field-name variants for the sig).
  const wallet = await call("POST", `/v1/users/${userId}/smart-wallets/create-managed`, {
    currency: "CNGN",
    userOwnerAddress: account.address,
    ownerProofChallengeId: ch.challengeId,
    ownerProofSignature: signature,
  });
  show("POST create-managed", wallet);
  const sw = wallet.json as { smartWalletId?: string; address?: string };
  console.log("smartWalletId:", sw.smartWalletId, "address:", sw.address);

  // 6) Balances
  const balances = await call("GET", `/v1/users/${userId}/smart-wallets/account/balances`);
  show("GET account/balances", balances);

  // 7) Nigerian banks (for later transfer)
  const banks = await call("GET", `/v1/users/${userId}/bank-accounts/nigerian-banks`);
  show("GET nigerian-banks (first 3)", Array.isArray(banks.json) ? banks.json.slice(0, 3) : banks.json);

  console.log("\n--- probe done ---");
  console.log("Save this owner key strategy: we generated a random EOA. In the real");
  console.log("provider, derive it deterministically from a master seed + user index.");
}

main().catch((e) => {
  console.error("PROBE ERROR:", e);
  process.exit(1);
});
