import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic — reports which env vars are present (booleans only, no
 * secret values) plus the deployed git commit. Remove before final submission.
 */
export async function GET(): Promise<Response> {
  const env = getEnv();
  const has = (v: string) => Boolean(v && v.length > 0);
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
    store: env.STORE,
    moneyProvider: env.MONEY_PROVIDER,
    llmProvider: env.LLM_PROVIDER,
    present: {
      BMONI_BASE_URL: has(env.BMONI_BASE_URL),
      BMONI_API_KEY: has(env.BMONI_API_KEY),
      SESSION_SECRET: has(env.SESSION_SECRET),
      SUPABASE_URL: has(env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: has(env.SUPABASE_SERVICE_ROLE_KEY),
      GROQ_API_KEY: has(env.GROQ_API_KEY),
      TELEGRAM_BOT_TOKEN: has(env.TELEGRAM_BOT_TOKEN),
      TELEGRAM_WEBHOOK_SECRET: has(env.TELEGRAM_WEBHOOK_SECRET),
      RESEND_API_KEY: has(env.RESEND_API_KEY),
    },
  });
}
