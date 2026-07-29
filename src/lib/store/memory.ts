import type { Turn } from "@/lib/agent/llm";
import { MAX_TURNS, type Store } from "./types";

/** In-memory Store. Process-local; fine for dev, tests and a polling demo. */
export class MemoryStore implements Store {
  readonly name = "memory" as const;
  private readonly turns = new Map<string, Turn[]>();
  private readonly nonces = new Map<string, Set<string>>();

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
