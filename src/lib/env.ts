import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Central, server-only env access. Every secret is read HERE and nowhere else.
 *
 * Guard: importing this on the client is a bug — it would risk bundling a secret.
 * The runtime check throws loudly if that ever happens.
 */
if (typeof window !== "undefined") {
  throw new Error("src/lib/env.ts is server-only and must never reach the browser.");
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  GEMINI_API_KEY: z.string().default(""),
  GROQ_API_KEY: z.string().default(""),
  LLM_PROVIDER: z.enum(["gemini", "groq", "claude"]).default("gemini"),

  MONEY_PROVIDER: z.enum(["sim", "live"]).default("sim"),
  BMONI_BASE_URL: z.string().default(""),
  BMONI_API_KEY: z.string().default(""),

  CHANNEL: z.enum(["telegram", "sim"]).default("sim"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),

  STORE: z.enum(["memory", "supabase"]).default("memory"),
  SUPABASE_URL: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),

  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),

  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM: z.string().default("onboarding@resend.dev"),

  SESSION_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof schema> & { SESSION_SECRET: string };

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.parse(process.env);

  let secret = parsed.SESSION_SECRET;
  if (!secret) {
    if (parsed.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is required in production. Generate one: openssl rand -hex 32",
      );
    }
    secret = randomBytes(32).toString("hex");
    console.warn(
      "[env] SESSION_SECRET missing — generated an ephemeral dev secret. " +
        "Confirmation tokens will not survive a restart. Set SESSION_SECRET in .env.local.",
    );
  }

  cached = { ...parsed, SESSION_SECRET: secret };
  return cached;
}
