import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
try { process.loadEnvFile(".env.local"); } catch { /* */ }
async function main() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME!, key = process.env.CLOUDINARY_API_KEY!, secret = process.env.CLOUDINARY_API_SECRET!;
  const b64 = readFileSync("public/brand/kudi-wordmark-t.png").toString("base64");
  const ts = Math.floor(Date.now() / 1000);
  const publicId = "kudi-logo";
  const sig = createHash("sha1").update(`public_id=${publicId}&timestamp=${ts}${secret}`).digest("hex");
  const form = new FormData();
  form.append("file", `data:image/png;base64,${b64}`);
  form.append("api_key", key); form.append("timestamp", String(ts));
  form.append("public_id", publicId); form.append("signature", sig);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
  const j = await res.json() as { secure_url?: string; error?: unknown };
  console.log(res.status, j.secure_url ?? JSON.stringify(j).slice(0,200));
}
main().catch(e => console.error(e));
