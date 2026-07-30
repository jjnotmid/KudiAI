import { NextResponse } from "next/server";
import { createBmoniAccount } from "@/lib/bmoni/onboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TEMPORARY diagnostic — runs createBmoniAccount ON Vercel and reports timing +
 * result or the exact error. Remove before final submission.
 */
export async function GET(): Promise<Response> {
  const stamp = Date.now();
  const sid = `debug-${stamp}`;
  const digits = String(stamp).slice(-9);
  const t = Date.now();
  try {
    const acct = await createBmoniAccount(sid, {
      fullName: "Debug User",
      email: `debug.${stamp}@example.com`,
      phone: `+2348${digits}`,
    });
    return NextResponse.json({ ok: true, ms: Date.now() - t, wallet: acct.walletAddress });
  } catch (e) {
    return NextResponse.json({ ok: false, ms: Date.now() - t, error: String(e).slice(0, 600) });
  }
}
