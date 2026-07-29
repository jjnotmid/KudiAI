import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
try { process.loadEnvFile(".env.local"); } catch { /* */ }
const BASE = process.env.BMONI_BASE_URL ?? "https://embedded-dev.bmoni.com";
const KEY = process.env.BMONI_API_KEY ?? "";
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
async function json(m: string, p: string, b?: unknown) {
  const r = await fetch(`${BASE}${p}`, { method: m, headers: { "x-api-key": KEY, "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}
async function upload(userId: string, kind: string, field: string, extra: Record<string, string>) {
  const form = new FormData();
  form.append(field, new Blob([PNG as BlobPart], { type: "image/png" }), "img.png");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${BASE}/v1/users/${userId}/kyc/documents/${kind}`, { method: "POST", headers: { "x-api-key": KEY }, body: form });
  console.log(`${kind}[${field}] ${JSON.stringify(extra)} =>`, res.status, (await res.text()).slice(0, 140));
}
async function main() {
  const rid = Math.floor(Math.random() * 1e8);
  const u = await json("POST", "/v1/users", { firstName: "Up", email: `up.${rid}@example.com`, phoneNumber: `+2348${String(rid).padStart(9, "0")}` });
  const userId = (u.user as { bmoniUserId?: string } | undefined)?.bmoniUserId as string;
  const owner = privateKeyToAccount(generatePrivateKey());
  const ch = (await json("POST", `/v1/users/${userId}/smart-wallets/owner-proof-challenges`, { currency: "CNGN", userOwnerAddress: owner.address })) as { challengeId?: string; message?: string };
  if (ch.message) { const sig = await owner.signMessage({ message: ch.message }); await json("POST", `/v1/users/${userId}/smart-wallets/create-managed`, { currency: "CNGN", userOwnerAddress: owner.address, ownerProofChallengeId: ch.challengeId, ownerProofSignature: sig }); }

  // biometric: file field "selfie" + a type
  await upload(userId, "biometric", "selfie", { type: "selfie" });
  // identification: try type-named file fields
  for (const field of ["national_id", "passport", "drivers_license", "voter_id", "front", "frontImage", "idFront", "identityDocument"]) {
    await upload(userId, "identification", field, { type: "national_id", documentNumber: "12345678901", issuingCountry: "NG", issuingCountryCode: "NGA" });
  }
}
main().catch((e) => console.error(e));
