import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { Currency } from "@/lib/money/types";

/**
 * The confirmation gate (§7.3). A value-moving action can only execute if it
 * carries a token that the SERVER signed for that exact payload. The LLM is
 * never trusted to "remember the user said yes" — consent is proven by a
 * cryptographic token bound to (session, action, amount, currency, recipient),
 * single-use, and expiring in 90 seconds.
 */

export const CONFIRM_TTL_MS = 90_000;

export type ConfirmAction = "transfer" | "convert";

export interface ConfirmPayload {
  readonly v: 1;
  readonly sessionId: string;
  readonly action: ConfirmAction;
  readonly amountMinor: number;
  readonly currency: Currency;
  /** Present for transfers. */
  readonly beneficiaryId?: string;
  /** Present for conversions (target currency). */
  readonly to?: Currency;
  readonly nonce: string;
  readonly expiresAt: number;
}

export type ConfirmExpectation = Omit<ConfirmPayload, "v" | "nonce" | "expiresAt">;

export type VerifyResult =
  | { readonly ok: true; readonly payload: ConfirmPayload }
  | { readonly ok: false; readonly reason: "malformed" | "bad_signature" | "expired" | "mismatch" };

const enc = (s: string): string => Buffer.from(s, "utf8").toString("base64url");
const dec = (s: string): string => Buffer.from(s, "base64url").toString("utf8");

function sign(payloadJson: string): string {
  const secret = getEnv().SESSION_SECRET;
  return createHmac("sha256", secret).update(payloadJson).digest("base64url");
}

/**
 * Decode a token's payload WITHOUT verifying it. Used only to recover the
 * fields needed to build the expectation for verifyConfirmation — the signature
 * check in verifyConfirmation is what actually establishes trust.
 */
export function peekConfirmation(token: string): ConfirmPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  try {
    return JSON.parse(dec(token.slice(0, dot))) as ConfirmPayload;
  } catch {
    return null;
  }
}

/** Mint a token for an action the user is about to confirm. */
export function createConfirmation(
  expectation: ConfirmExpectation,
  now: number = Date.now(),
): { token: string; payload: ConfirmPayload } {
  const payload: ConfirmPayload = {
    v: 1,
    ...expectation,
    nonce: randomUUID(),
    expiresAt: now + CONFIRM_TTL_MS,
  };
  const json = JSON.stringify(payload);
  const token = `${enc(json)}.${sign(json)}`;
  return { token, payload };
}

/**
 * Verify a token against what the caller is ACTUALLY about to do. Signature,
 * expiry, and byte-for-byte payload match are all checked. Single-use (replay)
 * is enforced separately by the caller consuming `payload.nonce` in the store.
 */
export function verifyConfirmation(
  token: string,
  expected: ConfirmExpectation,
  now: number = Date.now(),
): VerifyResult {
  const dot = token.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let json: string;
  let payload: ConfirmPayload;
  try {
    json = dec(body);
    payload = JSON.parse(json) as ConfirmPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Signature — timing-safe compare over the exact bytes we would sign.
  const expectedMac = sign(json);
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  if (typeof payload.expiresAt !== "number" || now > payload.expiresAt) {
    return { ok: false, reason: "expired" };
  }

  // Byte-for-byte match of every consent-bearing field.
  if (
    payload.v !== 1 ||
    payload.sessionId !== expected.sessionId ||
    payload.action !== expected.action ||
    payload.amountMinor !== expected.amountMinor ||
    payload.currency !== expected.currency ||
    payload.beneficiaryId !== expected.beneficiaryId ||
    payload.to !== expected.to
  ) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true, payload };
}
