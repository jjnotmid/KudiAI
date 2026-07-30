/**
 * KYC document-field discovery + full USD onboarding probe (BMONI sandbox).
 * Run: npx tsx scripts/usd-kyc-probe.ts
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* env already present */
}
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BMONI_BASE_URL!;
const KEY = process.env.BMONI_API_KEY!;

function makeJpeg(): Buffer {
  const base = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Af//Z",
    "base64",
  );
  const payload = Buffer.alloc(6000, 0x20);
  const len = payload.length + 2;
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, (len >> 8) & 0xff, len & 0xff]), payload]);
  return Buffer.concat([base.subarray(0, 2), com, base.subarray(2)]);
}
const JPEG = makeJpeg();

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

async function upload(userId: string, kind: string, field: string, fields: Record<string, string>) {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(JPEG)], { type: "image/jpeg" }), `${field}.jpg`);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE}/v1/users/${userId}/kyc/documents/${kind}`, {
    method: "POST", headers: { "x-api-key": KEY }, body: form,
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* */ }
  return { status: res.status, json };
}

function show(label: string, r: { status: number; json: unknown }) {
  console.log(`\n=== ${label} → HTTP ${r.status} ===`);
  console.log(JSON.stringify(r.json, null, 2)?.slice(0, 1200));
}

async function tryFields(userId: string, kind: string, fields: string[], extra: Record<string, string>) {
  for (const field of fields) {
    const r = await upload(userId, kind, field, extra);
    const msg = JSON.stringify(r.json)?.slice(0, 180);
    const unexpected = /Unexpected field/i.test(msg ?? "");
    console.log(`  ${kind} field="${field}" → ${r.status} ${msg}`);
    if (r.status >= 200 && r.status < 300) return { field, ok: true, json: r.json };
    if (!unexpected) return { field, ok: false, json: r.json }; // right field, wrong body → keep for inspection
  }
  return null;
}

async function main() {
  const stamp = String(Date.now());
  const userId = ((await req("POST", "/v1/users", {
    firstName: "Ada", email: `probe.${stamp}@kudi.test`, phoneNumber: `+2348${stamp.slice(-9)}`,
  })).json as any)?.user?.bmoniUserId;
  console.log("userId:", userId);

  const owner = privateKeyToAccount(generatePrivateKey());
  const chal = await req("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "CNGN", userOwnerAddress: owner.address });
  const signature = await owner.signMessage({ message: (chal.json as any)?.message });
  const smartWalletId = ((await req("POST", `/v1/users/${userId}/smart-wallets/create-managed`, {
    currency: "CNGN", userOwnerAddress: owner.address,
    ownerProofChallengeId: (chal.json as any)?.challengeId, ownerProofSignature: signature,
  })).json as any)?.id;
  console.log("smartWalletId:", smartWalletId);

  const occ = await req("GET", `/v1/users/${userId}/kyc/occupations?search=engineer`);
  const occupationCode = (occ.json as any)?.[0]?.socCode ?? "172070";

  show("PATCH /kyc (profile)", await req("PATCH", `/v1/users/${userId}/kyc`, {
    personalInfo: { firstName: "Ada", lastName: "Obi", dateOfBirth: "1996-04-12", nationality: "NGA", gender: "female" },
    address: { streetLine1: "12 Marina Road", city: "Lagos", state: "Lagos", postalCode: "101001", countryCode: "NGA" },
    employment: { employmentStatus: "employed", employerName: "Kudi", occupation: "Engineer", occupationCode: String(occupationCode), monthlySalary: "500000" },
    sourceOfFunds: "salary", accountPurpose: "personal", estimatedMonthlyVolume: 4999,
    identificationNumbers: [{ type: "bvn", number: "22222222222", issuingCountryCode: "NGA" }],
  }));

  console.log("\n--- biometric ---");
  await tryFields(userId, "biometric", ["selfie"], { type: "selfie" });

  console.log("\n--- identification (field == type?) ---");
  const idExtra = { type: "national_id", documentType: "national_id", documentNumber: "22222222222", issuingCountryCode: "NGA", country: "NGA" };
  const idHit = await tryFields(userId, "identification",
    ["national_id", "passport", "driving_license", "voter_id", "nationalId", "identity_document", "identityDocument", "identification_front", "front"], idExtra);
  console.log("  identification result:", idHit);

  console.log("\n--- proof-of-address (field == type?) ---");
  const poaExtra = { type: "utility_bill", documentType: "utility_bill", issuingCountryCode: "NGA", country: "NGA" };
  const poaHit = await tryFields(userId, "proof-of-address",
    ["utility_bill", "proof_of_address", "proofOfAddress", "bank_statement", "utilityBill", "address_proof", "document", "proof-of-address"], poaExtra);
  console.log("  proof-of-address result:", poaHit);

  show("GET /kyc/readiness", await req("GET", `/v1/users/${userId}/kyc/readiness`));
  show("POST /kyc/activate", await req("POST", `/v1/users/${userId}/kyc/activate`, { sumsubLevelName: "id-and-liveness" }));
  show("GET /onboarding/status", await req("GET", `/v1/users/${userId}/onboarding/status`));
  show("POST /onboarding/start-usa", await req("POST", `/v1/users/${userId}/onboarding/start-usa`, { smartWalletId }));
  show("GET /vba/usd", await req("GET", `/v1/users/${userId}/vba/usd`));
}

main().catch((e) => console.error(e));
