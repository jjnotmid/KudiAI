import { getEnv } from "@/lib/env";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let cached: Store | null = null;

/**
 * Select the Store from env. `supabase` requires URL + service_role key; if
 * either is missing we fall back to `memory` with a warning — never crash.
 */
export function getStore(): Store {
  if (cached) return cached;
  const env = getEnv();
  if (env.STORE === "supabase" && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    cached = new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    if (env.STORE === "supabase") {
      console.warn("[store] STORE=supabase but Supabase creds missing — using memory.");
    }
    cached = new MemoryStore();
  }
  return cached;
}

export type { Store } from "./types";
