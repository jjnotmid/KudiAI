import type { Turn } from "@/lib/agent/llm";

/**
 * Persistence boundary. `memory` (default) works with no credentials and is used
 * in tests; `supabase` swaps in for durable, cross-instance state. No card PAN,
 * CVV, secret or token is ever stored here (§8).
 */
export interface Store {
  readonly name: "memory" | "supabase";
  /** Conversation history for a session (most-recent-last), already capped. */
  loadTurns(sessionId: string): Promise<Turn[]>;
  saveTurns(sessionId: string, turns: readonly Turn[]): Promise<void>;
  /**
   * Single-use guard for confirmation-token nonces. Returns true the FIRST time
   * a nonce is seen, false on every replay. This is what makes a confirmation
   * token non-replayable (§7.3).
   */
  consumeNonce(sessionId: string, nonce: string): Promise<boolean>;
  /** Restore a session to empty (demo:reset). */
  reset(sessionId: string): Promise<void>;
}

/** Keep the LLM context bounded — last N turns. */
export const MAX_TURNS = 24;
