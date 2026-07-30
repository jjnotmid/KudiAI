import { NextResponse } from "next/server";
import { createBmoniAccount } from "@/lib/bmoni/onboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** TEMP diagnostic — remove before final. */
export async function GET(): Promise<Response> {
  const stamp = Date.now();
  const t = Date.now();
  let create: unknown;
  try {
    const acct = await createBmoniAccount(`diag-${stamp}`, {
      fullName: "Diag User",
      email: `diag.${stamp}@example.com`,
      phone: `+2347${String(stamp).slice(-9)}`,
    });
    create = { ok: true, ms: Date.now() - t, wallet: acct.walletAddress };
  } catch (e) {
    const c = (e as { cause?: { code?: string; message?: string } }).cause;
    create = { ok: false, ms: Date.now() - t, error: String((e as Error).message), causeCode: c?.code ?? null, causeMsg: c?.message ?? null };
  }
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
    baseUrlRaw: JSON.stringify(process.env.BMONI_BASE_URL ?? ""),
    store: process.env.STORE ?? "",
    create,
  });
}
