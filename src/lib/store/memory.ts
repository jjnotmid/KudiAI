import type { Turn } from "@/lib/agent/llm";
import { type BmoniAccount, type KudiEvent, MAX_TURNS, type Store } from "./types";

/** In-memory Store. Process-local; fine for dev, tests and a polling demo. */
export class MemoryStore implements Store {
  readonly name = "memory" as const;
  private readonly turns = new Map<string, Turn[]>();
  private readonly nonces = new Map<string, Set<string>>();
  private readonly bmoni = new Map<string, BmoniAccount>();
  private readonly pins = new Map<string, string>();

  async getBmoniAccount(sessionId: string): Promise<BmoniAccount | null> {
    return this.bmoni.get(sessionId) ?? null;
  }

  async saveBmoniAccount(sessionId: string, account: BmoniAccount): Promise<void> {
    this.bmoni.set(sessionId, account);
  }

  async getPinHash(sessionId: string): Promise<string | null> {
    return this.pins.get(sessionId) ?? null;
  }

  async setPinHash(sessionId: string, pinHash: string): Promise<void> {
    this.pins.set(sessionId, pinHash);
  }

  private readonly events: (KudiEvent & { sessionId: string; at: number })[] = [];
  async recordEvent(sessionId: string, event: KudiEvent): Promise<void> {
    this.events.push({ ...event, sessionId, at: Date.now() });
    if (this.events.length > 1000) this.events.shift();
  }

  async loadTurns(sessionId: string): Promise<Turn[]> {
    return [...(this.turns.get(sessionId) ?? [])];
  }

  async saveTurns(sessionId: string, turns: readonly Turn[]): Promise<void> {
    this.turns.set(sessionId, turns.slice(-MAX_TURNS));
  }

  async consumeNonce(sessionId: string, nonce: string): Promise<boolean> {
    let set = this.nonces.get(sessionId);
    if (!set) {
      set = new Set();
      this.nonces.set(sessionId, set);
    }
    if (set.has(nonce)) return false;
    set.add(nonce);
    return true;
  }

  async reset(sessionId: string): Promise<void> {
    this.turns.delete(sessionId);
    this.nonces.delete(sessionId);
  }
}
