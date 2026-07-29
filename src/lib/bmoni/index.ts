import { getEnv, type Env } from "@/lib/env";
import { BmoniLiveProvider } from "./live";
import { SimProvider } from "./sim";
import type { MoneyProvider } from "./types";

let cached: MoneyProvider | null = null;

/**
 * Select the money provider from env. Default `sim`. If `live` is requested but
 * credentials are missing, fall back to `sim` with a warning — the app must
 * never crash on a missing key (§0.4).
 */
export function shouldUseLiveProvider(env: Pick<Env, "MONEY_PROVIDER" | "BMONI_BASE_URL" | "BMONI_API_KEY"> = getEnv()): boolean {
  // Honour MONEY_PROVIDER explicitly: `live` only when creds exist, else `sim`.
  // (Predictable for the demo; flip MONEY_PROVIDER=live to go real.)
  return env.MONEY_PROVIDER === "live" && Boolean(env.BMONI_BASE_URL && env.BMONI_API_KEY);
}

export function getMoneyProvider(): MoneyProvider {
  if (cached) return cached;
  const env = getEnv();
  if (shouldUseLiveProvider(env) && env.BMONI_BASE_URL && env.BMONI_API_KEY) {
    cached = new BmoniLiveProvider(env.BMONI_BASE_URL, env.BMONI_API_KEY);
  } else {
    if (env.MONEY_PROVIDER === "live") {
      console.warn("[bmoni] MONEY_PROVIDER=live but BMONI creds missing — using sim.");
    }
    cached = new SimProvider({ latency: true });
  }
  return cached;
}

export function getLiveMoneyProvider(): MoneyProvider | null {
  const env = getEnv();
  if (!env.BMONI_BASE_URL || !env.BMONI_API_KEY) return null;
  return new BmoniLiveProvider(env.BMONI_BASE_URL, env.BMONI_API_KEY);
}

export * from "./types";
