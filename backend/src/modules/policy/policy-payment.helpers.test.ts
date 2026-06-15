import { describe, expect, it } from "vitest";
import { normalizeTxnNumber } from "./policy-payment.helpers.js";

describe("policy-payment.helpers", () => {
  it("normalizes blank transaction numbers to undefined", () => {
    expect(normalizeTxnNumber("")).toBeUndefined();
    expect(normalizeTxnNumber("  ")).toBeUndefined();
    expect(normalizeTxnNumber(" UTR1 ")).toBe("UTR1");
  });
});
