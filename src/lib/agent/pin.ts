import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Transaction PIN hashing. PINs are 4 digits, hashed with scrypt + a per-PIN
 * salt. Stored as `salt:hash` (hex). The plaintext PIN is never stored or logged.
 */

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

export interface PinSetupResolution {
  readonly done: boolean;
  readonly pendingPin?: string;
  readonly prompt: string;
}

export function resolvePinSetup(input: string, pendingPin?: string): PinSetupResolution {
  const pin = input.trim();

  if (!isValidPinFormat(pin)) {
    return {
      done: false,
      pendingPin,
      prompt: "Set a 4-digit PIN, like 1234. I go ask you to confirm it after.",
    };
  }

  if (pendingPin === undefined) {
    return {
      done: false,
      pendingPin: pin,
      prompt: "Confirm your PIN by sending it again.",
    };
  }

  if (pendingPin === pin) {
    return {
      done: true,
      prompt: "PIN set. ✅ Now, wetin you wan do?",
    };
  }

  return {
    done: false,
    pendingPin: undefined,
    prompt: "The PINs no match. Send your PIN again so I go confirm it.",
  };
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin.trim(), salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(pin.trim(), Buffer.from(saltHex, "hex"), 32);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
