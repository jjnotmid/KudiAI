import { describe, expect, it } from "vitest";
import { resolvePinSetup } from "../pin";

describe("resolvePinSetup", () => {
  it("asks for confirmation after the first PIN entry", () => {
    const result = resolvePinSetup("1234", undefined);

    expect(result.done).toBe(false);
    expect(result.pendingPin).toBe("1234");
    expect(result.prompt).toContain("Confirm your PIN");
  });

  it("accepts a matching second PIN", () => {
    const result = resolvePinSetup("1234", "1234");

    expect(result.done).toBe(true);
    expect(result.prompt).toContain("PIN set");
  });

  it("asks again when the confirmation does not match", () => {
    const result = resolvePinSetup("4321", "1234");

    expect(result.done).toBe(false);
    expect(result.pendingPin).toBeUndefined();
    expect(result.prompt).toContain("no match");
  });
});
