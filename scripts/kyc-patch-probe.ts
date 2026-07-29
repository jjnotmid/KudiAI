/** Probe PATCH /kyc profile submission and re-check readiness. */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
try { process.loadEnvFile(".env.local"); } catch { /* ignore */ }
const BASE = process.env.BMONI_BASE_URL ?? "https://embedded-dev.bmoni.com";
const KEY = process.env.BMONI_API_KEY ?? "";
async function call(m: string, p: string, b?: unknown) {
  const res = await fetch(`${BASE}${p}`, { method: m, headers: { "x-api-key": KEY, "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
  let j: unknown; try { j = await res.json(); } catch { j = await res.text(); }
  return { status: res.status, json: j };
}
function show(l: string, v: { status: number; json: unknown }) { console.log(`\n=== ${l} [${v.status}] ===`); console.log(JSON.stringify(v.json, null, 2)?.slice(0, 700)); }
async function main() {
  const rid = Math.floor(Math.random() * 1e8);
  const user = (await call("POST", "/v1/users", { firstName: "Kyc", email: `kp.${rid}@example.com`, phoneNumber: `+2348${String(rid).padStart(9, "0")}` })).json as { user?: { bmoniUserId?: string } };
  const userId = user.user?.bmoniUserId; console.log("userId:", userId); if (!userId) return;
  const owner = privateKeyToAccount(generatePrivateKey());
  const ch = (await call("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "CNGN", userOwnerAddress: owner.address })).json as { challengeId?: string; message?: string };
  if (ch.message) { const sig = await owner.signMessage({ message: ch.message }); await call("POST", `/v1/users/${userId}/smart-wallets/create-managed`, { currency: "CNGN", userOwnerAddress: owner.address, ownerProofChallengeId: ch.challengeId, ownerProofSignature: sig }); }

  const profile = {
    personalInfo: { firstName: "Ada", lastName: "Okafor", dateOfBirth: "1990-05-14", nationality: "NGA" },
    address: { streetLine1: "12 Balogun St", city: "Lagos", state: "Lagos", postalCode: "100001", countryCode: "NGA" },
    employment: { employmentStatus: "employed", occupationCode: "119199" },
    sourceOfFunds: "salary",
    identificationNumbers: [{ type: "bvn", number: "22222222222", issuingCountryCode: "NGA" }],
  };
  show("PATCH /kyc profile", await call("PATCH", `/v1/users/${userId}/kyc`, profile));
  show("GET readiness after profile", await call("GET", `/v1/users/${userId}/kyc/readiness`));
}
main().catch((e) => console.error("ERR", e));
// occupations probe
(async () => {
  try { process.loadEnvFile(".env.local"); } catch {}
  const B = process.env.BMONI_BASE_URL ?? "https://embedded-dev.bmoni.com";
  const K = process.env.BMONI_API_KEY ?? "";
  const u = await (await fetch(`${B}/v1/users`, { method:"POST", headers:{"x-api-key":K,"content-type":"application/json"}, body: JSON.stringify({firstName:"Occ",email:`occ.${Date.now()}@example.com`,phoneNumber:`+23481${String(Date.now()).slice(-8)}`})})).json();
  const uid = u.user?.bmoniUserId;
  const r = await (await fetch(`${B}/v1/users/${uid}/kyc/occupations?search=trader`, { headers:{"x-api-key":K}})).json();
  console.log("OCCUPATIONS(trader):", JSON.stringify(r).slice(0,500));
})();
