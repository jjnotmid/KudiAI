import type { Turn } from "@/lib/agent/llm";

/** Non-secret BMONI identifiers for a session. The owner private key is NEVER
 * stored — it is derived on demand (see src/lib/bmoni/owner.ts). */
export interface BmoniAccount {
  readonly bmoniUserId: string;
  readonly smartWalletId: string;
  readonly walletAddress: string;
  /** Phone the BMONI account was created with — shown to the user for funding. */
  readonly phoneNumber?: string;
  /** Whether the Nigerian rail (KYC) was activated. */
  readonly kycActive?: boolean;
}

/** A pending value-moving confirmation awaiting the user's PIN. */
export interface PendingConfirmRecord {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: number;
}

/** Audit/analytics event for the admin dashboard. */
export interface KudiEvent {
  readonly kind: string;
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly detail?: Record<string, unknown>;
  readonly flagged?: boolean;
}

/**
 * Persistence boundary. `memory` (default) works with no credentials and is used
 * in tests; `supabase` swaps in for durable, cross-instance state. No card PAN,
 * CVV, secret, token or private key is ever stored here (§8).
 */
export interface Store {
  readonly name: "memory" | "supabase";
  /** BMONI user + smart-wallet ids for a session (null until onboarded). */
  getBmoniAccount(sessionId: string): Promise<BmoniAccount | null>;
  saveBmoniAccount(sessionId: string, account: BmoniAccount): Promise<void>;
  /** Hashed transaction PIN (`salt:hash`); null until the user sets one. */
  getPinHash(sessionId: string): Promise<string | null>;
  setPinHash(sessionId: string, pinHash: string): Promise<void>;
  /** Append an audit/analytics event (feeds the admin dashboard). Best-effort. */
  recordEvent(sessionId: string, event: KudiEvent): Promise<void>;
  /** Sum of completed outbound amounts (transfers + savings) in minor units, for
   * a session — used to reflect spend against the live wallet balance. */
  sumSpent(sessionId: string): Promise<number>;
  /** Recent events for a session (for spending analysis). */
  listEvents(sessionId: string): Promise<KudiEvent[]>;
  /** Conversational flow state (signup step, PIN gate, etc.). Null = no state.
   * Persisted so the bot can run stateless on serverless (webhook). */
  getFlow(sessionId: string): Promise<unknown | null>;
  setFlow(sessionId: string, state: unknown | null): Promise<void>;
  /** Pending value-moving confirmations, keyed by a short ref. */
  putPending(ref: string, data: PendingConfirmRecord): Promise<void>;
  getPending(ref: string): Promise<PendingConfirmRecord | null>;
  deletePending(ref: string): Promise<void>;
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
