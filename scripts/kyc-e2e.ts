/** End-to-end KYC against the real sandbox: account → profile → selfie → activate. */
import { readFileSync } from "node:fs";
import { finalizeKyc, provisionAccount, submitKycProfile, uploadKycSelfie } from "@/lib/bmoni/onboard";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ignore */
}

// A real image (the logo) — comfortably above the biometric min size.
const IMG = new Uint8Array(readFileSync("public/brand/kudi-mark.png"));

async function main() {
  const sid = `kyc-e2e-${Math.floor(Math.random() * 1e6)}`;
  console.log("provisioning account…");
  const acct = await provisionAccount(sid);
  console.log("userId:", acct.bmoniUserId);

  console.log("submitting profile…");
  await submitKycProfile(sid, { fullName: "Ada Okafor", dob: "1995-06-20", bvn: "22222222222" });

  console.log(`uploading selfie (${IMG.byteLength} bytes)…`);
  try {
    await uploadKycSelfie(sid, IMG, "image/png");
    console.log("  selfie OK");
  } catch (e) {
    console.log("  selfie FAILED:", String(e).slice(0, 220));
  }

  console.log("finalising KYC…");
  const r = await finalizeKyc(sid);
  console.log("RESULT:", JSON.stringify(r));
}

main().catch((e) => console.error("E2E ERR", e));
