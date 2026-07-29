import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Minimal admin session: an HMAC token over a fixed string, signed with
 * SESSION_SECRET. Set as an httpOnly cookie after a correct password. Enough to
 * gate the dashboard for a demo without a full auth system.
 */
export const ADMIN_COOKIE = "kudi_admin";

export function adminToken(): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update("kudi-admin-v1").digest("base64url");
}

export function isValidAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = adminToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(password: string): boolean {
  const expected = getEnv().ADMIN_PASSWORD;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
