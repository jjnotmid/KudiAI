import { describe, expect, it } from "vitest";
import { findBank, parseTransferDraft } from "../banks";

describe("findBank", () => {
  it("matches major banks and microfinance brands", () => {
    expect(findBank("UBA")).toMatchObject({ displayName: "UBA" });
    expect(findBank("first bank")).toMatchObject({ displayName: "First Bank" });
    expect(findBank("accion microfinance")).toMatchObject({ displayName: "Accion Microfinance Bank" });
  });
});

describe("parseTransferDraft", () => {
  it("extracts amount, account number, bank and recipient from a spoken request", () => {
    const draft = parseTransferDraft("send 5k to account 0123456789 for Chidi at UBA");

    expect(draft.amountMinor).toBe(500_000);
    expect(draft.accountNumber).toBe("0123456789");
    expect(draft.bank?.displayName).toBe("UBA");
    expect(draft.recipientName).toBe("Chidi");
  });

  it("accepts a plain recipient name without extra keywords", () => {
    const draft = parseTransferDraft("Chidi");

    expect(draft.recipientName).toBe("Chidi");
  });

  it("captures a plain account number message", () => {
    const draft = parseTransferDraft("account number 0123456789");

    expect(draft.accountNumber).toBe("0123456789");
  });
});
