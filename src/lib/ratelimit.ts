/**
 * In-memory token-bucket rate limiter (§8). Per session: 20 messages/min and
 * 5 writes/min. Process-local — fine for a polling demo; a durable limiter is a
 * later hardening task for multi-instance webhook deploys.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const LIMITS = {
  message: { capacity: 20, refillPerMs: 20 / 60_000 },
  write: { capacity: 5, refillPerMs: 5 / 60_000 },
} as const;

export type LimitKind = keyof typeof LIMITS;

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  sessionId: string,
  kind: LimitKind,
  now: number = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  const cfg = LIMITS[kind];
  const key = `${kind}:${sessionId}`;
  const b = buckets.get(key) ?? { tokens: cfg.capacity, updatedAt: now };
  const elapsed = Math.max(0, now - b.updatedAt);
  b.tokens = Math.min(cfg.capacity, b.tokens + elapsed * cfg.refillPerMs);
  b.updatedAt = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(key, b);
    return { allowed: true, retryAfterMs: 0 };
  }
  buckets.set(key, b);
  const retryAfterMs = Math.ceil((1 - b.tokens) / cfg.refillPerMs);
  return { allowed: false, retryAfterMs };
}
