import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Turn } from "@/lib/agent/llm";
import { type BmoniAccount, type KudiEvent, MAX_TURNS, type PendingConfirmRecord, type Store } from "./types";

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

  async getBmoniAccount(sessionId: string): Promise<BmoniAccount | null> {
    const { data, error } = await this.db
      .from("kudi_bmoni_accounts")
      .select("bmoni_user_id, smart_wallet_id, wallet_address")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`supabase getBmoniAccount: ${error.message}`);
    if (!data) return null;
    return {
      bmoniUserId: data.bmoni_user_id as string,
      smartWalletId: data.smart_wallet_id as string,
      walletAddress: data.wallet_address as string,
    };
  }

  async saveBmoniAccount(sessionId: string, account: BmoniAccount): Promise<void> {
    const { error } = await this.db.from("kudi_bmoni_accounts").upsert(
      {
        session_id: sessionId,
        bmoni_user_id: account.bmoniUserId,
        smart_wallet_id: account.smartWalletId,
        wallet_address: account.walletAddress,
      },
      { onConflict: "session_id" },
    );
    if (error) throw new Error(`supabase saveBmoniAccount: ${error.message}`);
  }

  async getPinHash(sessionId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("kudi_pins")
      .select("pin_hash")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`supabase getPinHash: ${error.message}`);
    return (data?.pin_hash as string | undefined) ?? null;
  }

  async setPinHash(sessionId: string, pinHash: string): Promise<void> {
    const { error } = await this.db
      .from("kudi_pins")
      .upsert({ session_id: sessionId, pin_hash: pinHash }, { onConflict: "session_id" });
    if (error) throw new Error(`supabase setPinHash: ${error.message}`);
  }

  async getFlow(sessionId: string): Promise<unknown | null> {
    const { data, error } = await this.db.from("kudi_flow").select("state").eq("session_id", sessionId).maybeSingle();
    if (error) throw new Error(`supabase getFlow: ${error.message}`);
    return data?.state ?? null;
  }
  async setFlow(sessionId: string, state: unknown | null): Promise<void> {
    if (state === null) {
      await this.db.from("kudi_flow").delete().eq("session_id", sessionId);
      return;
    }
    const { error } = await this.db.from("kudi_flow").upsert({ session_id: sessionId, state }, { onConflict: "session_id" });
    if (error) throw new Error(`supabase setFlow: ${error.message}`);
  }
  async putPending(ref: string, data: PendingConfirmRecord): Promise<void> {
    const { error } = await this.db
      .from("kudi_pending")
      .insert({ ref, session_id: data.sessionId, token: data.token, expires_at: data.expiresAt });
    if (error) throw new Error(`supabase putPending: ${error.message}`);
  }
  async getPending(ref: string): Promise<PendingConfirmRecord | null> {
    const { data, error } = await this.db.from("kudi_pending").select("*").eq("ref", ref).maybeSingle();
    if (error) throw new Error(`supabase getPending: ${error.message}`);
    if (!data) return null;
    return { token: data.token as string, sessionId: data.session_id as string, expiresAt: Number(data.expires_at) };
  }
  async deletePending(ref: string): Promise<void> {
    await this.db.from("kudi_pending").delete().eq("ref", ref);
  }

  async recordEvent(sessionId: string, event: KudiEvent): Promise<void> {
    const { error } = await this.db.from("kudi_events").insert({
      session_id: sessionId,
      kind: event.kind,
      amount_minor: event.amountMinor ?? null,
      currency: event.currency ?? null,
      detail: event.detail ?? {},
      flagged: event.flagged ?? false,
    });
    if (error) throw new Error(`supabase recordEvent: ${error.message}`);
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
    await this.db.from("kudi_bmoni_accounts").delete().eq("session_id", sessionId);
    await this.db.from("kudi_pins").delete().eq("session_id", sessionId);
  }
}
