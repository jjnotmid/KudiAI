import { describe, expect, it } from "vitest";
import { shouldUseLiveProvider } from "../index";

describe("shouldUseLiveProvider", () => {
  it("uses the live provider when BMONI credentials are present", () => {
    expect(
      shouldUseLiveProvider({
        MONEY_PROVIDER: "sim",
        BMONI_BASE_URL: "https://embedded-dev.bmoni.com",
        BMONI_API_KEY: "test-key",
      }),
    ).toBe(true);
  });

  it("falls back to the simulator when credentials are missing", () => {
    expect(
      shouldUseLiveProvider({
        MONEY_PROVIDER: "sim",
        BMONI_BASE_URL: "",
        BMONI_API_KEY: "",
      }),
    ).toBe(false);
  });
});
