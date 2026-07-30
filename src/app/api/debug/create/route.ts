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
  const t = Date.now();
  try {
    const res = await fetch("https://embedded-dev.bmoni.com/v1/users", {
      method: "POST",
      headers: { "x-api-key": process.env.BMONI_API_KEY ?? "", "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Ping", email: `ping.${Date.now()}@example.com`, phoneNumber: `+2348${String(Date.now()).slice(-9)}` }),
    });
    return NextResponse.json({ ok: true, ms: Date.now() - t, status: res.status, body: (await res.text()).slice(0, 200) });
  } catch (e) {
    const err = e as { message?: string; cause?: unknown };
    const cause = err.cause as { code?: string; message?: string; errno?: number } | undefined;
    return NextResponse.json({
      ok: false,
      ms: Date.now() - t,
      error: String(err.message ?? e),
      causeCode: cause?.code ?? null,
      causeMsg: cause?.message ?? String(cause ?? "").slice(0, 200),
    });
  }
}
