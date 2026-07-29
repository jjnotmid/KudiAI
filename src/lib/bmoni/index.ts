import { getEnv } from "@/lib/env";
import { BmoniLiveProvider } from "./live";
import { SimProvider } from "./sim";
import type { MoneyProvider } from "./types";

let cached: MoneyProvider | null = null;

/**
 * Select the money provider from env. Default `sim`. If `live` is requested but
 * credentials are missing, fall back to `sim` with a warning — the app must
 * never crash on a missing key (§0.4).
 */
export function getMoneyProvider(): MoneyProvider {
  if (cached) return cached;
  const env = getEnv();
  if (env.MONEY_PROVIDER === "live" && env.BMONI_BASE_URL && env.BMONI_API_KEY) {
    cached = new BmoniLiveProvider(env.BMONI_BASE_URL, env.BMONI_API_KEY);
  } else {
    if (env.MONEY_PROVIDER === "live") {
      console.warn("[bmoni] MONEY_PROVIDER=live but BMONI creds missing — using sim.");
    }
    cached = new SimProvider({ latency: true });
  }
  return cached;
}

export * from "./types";
