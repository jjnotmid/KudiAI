import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Turn } from "@/lib/agent/llm";
import { MAX_TURNS, type Store } from "./types";

/**
 * Supabase-backed Store. Uses the service_role key (server-only). Apply
 * src/lib/store/schema.sql in the Supabase SQL editor first, then set
 * STORE=supabase. Falls back is handled by the factory, not here.
 */
export class SupabaseStore implements Store {
  readonly name = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async loadTurns(sessionId: string): Promise<Turn[]> {
    const { data, error } = await this.db
      .from("kudi_turns")
      .select("turn")
      .eq("session_id", sessionId)
      .order("seq", { ascending: true })
      .limit(MAX_TURNS);
    if (error) throw new Error(`supabase loadTurns: ${error.message}`);
    return (data ?? []).map((r) => r.turn as Turn);
  }

  async saveTurns(sessionId: string, turns: readonly Turn[]): Promise<void> {
    const capped = turns.slice(-MAX_TURNS);
    // Simplest durable strategy: replace the session's history atomically.
    const del = await this.db.from("kudi_turns").delete().eq("session_id", sessionId);
    if (del.error) throw new Error(`supabase saveTurns(del): ${del.error.message}`);
    if (capped.length === 0) return;
    const rows = capped.map((turn, seq) => ({ session_id: sessionId, seq, turn }));
    const ins = await this.db.from("kudi_turns").insert(rows);
    if (ins.error) throw new Error(`supabase saveTurns(ins): ${ins.error.message}`);
  }

  async consumeNonce(sessionId: string, nonce: string): Promise<boolean> {
    // Unique constraint on (session_id, nonce) makes this atomic: a duplicate
    // insert fails → replay rejected.
    const { error } = await this.db
      .from("kudi_nonces")
      .insert({ session_id: sessionId, nonce });
    if (!error) return true;
    if (error.code === "23505") return false; // unique_violation → replay
    throw new Error(`supabase consumeNonce: ${error.message}`);
  }

  async reset(sessionId: string): Promise<void> {
    await this.db.from("kudi_turns").delete().eq("session_id", sessionId);
    await this.db.from("kudi_nonces").delete().eq("session_id", sessionId);
  }
}
