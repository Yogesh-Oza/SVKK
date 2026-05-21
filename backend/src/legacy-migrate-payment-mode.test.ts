import { describe, expect, it } from "vitest";
import {
  paymentModeToPayMethod,
  PAYMENT_MODE_FALLBACK,
} from "../scripts/legacy-migrate/config/dropdown-mappings.js";
import { inferLegacyPaymentModeHint } from "../scripts/legacy-migrate/transform.js";
import type { LegacyPolicyRow } from "../scripts/legacy-migrate/types.js";

function row(partial: Partial<LegacyPolicyRow>): LegacyPolicyRow {
  return { ref_no: "REF1", ...partial } as LegacyPolicyRow;
}

describe("inferLegacyPaymentModeHint", () => {
  it("defaults to CHEQUE for typical legacy cheque rows", () => {
    expect(
      inferLegacyPaymentModeHint(
        row({ policy_cheque_no: "CH- 128108", bank: "State Bank of India" }),
      ),
    ).toBe("CHEQUE");
  });

  it("detects cash from cheque text", () => {
    expect(inferLegacyPaymentModeHint(row({ policy_cheque_no: "CASH payment" }))).toBe("CASH");
  });

  it("detects online/neft from cheque text", () => {
    expect(inferLegacyPaymentModeHint(row({ policy_cheque_no: "NEFT12345" }))).toBe("ONLINE");
  });
});

describe("paymentModeToPayMethod", () => {
  it("uses CHQ for CHEQUE and unknown modes", () => {
    expect(PAYMENT_MODE_FALLBACK).toBe("CHEQUE");
    expect(paymentModeToPayMethod("CHEQUE")).toBe("CHQ");
    expect(paymentModeToPayMethod(undefined)).toBe("CHQ");
  });
});
