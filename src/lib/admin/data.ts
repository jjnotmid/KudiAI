import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

/**
 * Read-only admin queries against Supabase (service role). Every query is
 * wrapped so a missing table / unconfigured Supabase degrades to an empty
 * result instead of crashing the dashboard.
 */

function client(): SupabaseClient | null {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AdminEvent {
  id: number;
  session_id: string;
  kind: string;
  amount_minor: number | null;
  currency: string | null;
  detail: Record<string, unknown>;
  flagged: boolean;
  created_at: string;
}
export interface AdminUser {
  session_id: string;
  bmoni_user_id: string;
  wallet_address: string;
  created_at: string;
}
export interface AdminKpis {
  users: number;
  events: number;
  transfers: number;
  transferVolumeMinor: number;
  flagged: number;
  configured: boolean;
}

export async function getKpis(): Promise<AdminKpis> {
  const db = client();
  const empty: AdminKpis = { users: 0, events: 0, transfers: 0, transferVolumeMinor: 0, flagged: 0, configured: Boolean(db) };
  if (!db) return empty;
  try {
    const [users, events, flagged, transfers] = await Promise.all([
      db.from("kudi_bmoni_accounts").select("session_id", { count: "exact", head: true }),
      db.from("kudi_events").select("id", { count: "exact", head: true }),
      db.from("kudi_events").select("id", { count: "exact", head: true }).eq("flagged", true),
      db.from("kudi_events").select("amount_minor").eq("kind", "transfer"),
    ]);
    const volume = (transfers.data ?? []).reduce((s, r) => s + (Number(r.amount_minor) || 0), 0);
    return {
      users: users.count ?? 0,
      events: events.count ?? 0,
      transfers: (transfers.data ?? []).length,
      transferVolumeMinor: volume,
      flagged: flagged.count ?? 0,
      configured: true,
    };
  } catch {
    return empty;
  }
}

export async function getRecentEvents(limit = 40): Promise<AdminEvent[]> {
  const db = client();
  if (!db) return [];
  try {
    const { data } = await db.from("kudi_events").select("*").order("created_at", { ascending: false }).limit(limit);
    return (data ?? []) as AdminEvent[];
  } catch {
    return [];
  }
}

export async function getFlaggedEvents(limit = 40): Promise<AdminEvent[]> {
  const db = client();
  if (!db) return [];
  try {
    const { data } = await db
      .from("kudi_events")
      .select("*")
      .eq("flagged", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as AdminEvent[];
  } catch {
    return [];
  }
}

export async function getUsers(limit = 50): Promise<AdminUser[]> {
  const db = client();
  if (!db) return [];
  try {
    const { data } = await db
      .from("kudi_bmoni_accounts")
      .select("session_id, bmoni_user_id, wallet_address, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as AdminUser[];
  } catch {
    return [];
  }
}
