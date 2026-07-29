/** Probe BMONI KYC to see if the sandbox offers facial/liveness (Sumsub) with a verificationUrl. */
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
function show(l: string, v: { status: number; json: unknown }) {
  console.log(`\n=== ${l} [${v.status}] ===`);
  console.log(JSON.stringify(v.json, null, 2)?.slice(0, 900));
}

async function main() {
  const rid = Math.floor(Math.random() * 1e8);
  const user = (await call("POST", "/v1/users", { firstName: "Kyc", email: `kyc.${rid}@example.com`, phoneNumber: `+2348${String(rid).padStart(9, "0")}` })).json as { user?: { bmoniUserId?: string } };
  const userId = user.user?.bmoniUserId;
  console.log("userId:", userId);
  if (!userId) return;

  const owner = privateKeyToAccount(generatePrivateKey());
  const ch = (await call("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "CNGN", userOwnerAddress: owner.address })).json as { challengeId?: string; message?: string };
  if (ch.message) {
    const sig = await owner.signMessage({ message: ch.message });
    await call("POST", `/v1/users/${userId}/smart-wallets/create-managed`, { currency: "CNGN", userOwnerAddress: owner.address, ownerProofChallengeId: ch.challengeId, ownerProofSignature: sig });
  }

  show("GET kyc/options", await call("GET", `/v1/users/${userId}/kyc/options`));
  show("GET kyc/readiness", await call("GET", `/v1/users/${userId}/kyc/readiness`));
  show("POST kyc/activate {id-and-liveness}", await call("POST", `/v1/users/${userId}/kyc/activate`, { sumsubLevelName: "id-and-liveness" }));
  show("POST kyc/activate {idv-and-phone-verification}", await call("POST", `/v1/users/${userId}/kyc/activate`, { sumsubLevelName: "idv-and-phone-verification" }));
  show("POST kyc/activate {no body}", await call("POST", `/v1/users/${userId}/kyc/activate`, {}));
  show("GET onboarding/status", await call("GET", `/v1/users/${userId}/onboarding/status`));
  show("GET bvn-lookup/22222222222", await call("GET", `/v1/users/${userId}/kyc/bvn-lookup/22222222222`));
}
main().catch((e) => console.error("ERR", e));
