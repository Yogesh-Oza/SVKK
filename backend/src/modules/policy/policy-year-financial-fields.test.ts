import { describe, expect, it } from "vitest";
import { yearValueKeys } from "./policy.schemas.js";
import { policyYearFinancialPatchData } from "./policy-year-financial-fields.js";

const FINANCIAL_YEAR_KEYS = yearValueKeys.filter(
  (k) =>
    ![
      "policyStart",
      "policyEnd",
      "sumInsured",
      "expectedNetPremium",
      "paymentMode",
      "paymentType",
      "amountReceived",
      "bankName",
      "bankAccountLast4",
      "utrRef",
      "yearRemarks",
    ].includes(k),
);

describe("policyYearFinancialPatchData", () => {
  it("persists tax and commission fields that were previously dropped on PATCH", () => {
    const patch = policyYearFinancialPatchData({
      taxPercent: 10,
      taxAmount: 10,
      vkkCommission: 10,
      gaamMahajanContribution: 20,
      svkkPremium: 7475,
      netPremium: 7475,
    });
    expect(patch.taxPercent).toBe(10);
    expect(patch.taxAmount).toBe(10);
    expect(patch.vkkCommission).toBe(10);
    expect(patch.gaamMahajanContribution).toBe(20);
    expect(patch.svkkPremium).toBe(7475);
    expect(patch.netPremium).toBe(7475);
  });

  it("covers every financial key listed in yearValueKeys", () => {
    const sample = Object.fromEntries(
      FINANCIAL_YEAR_KEYS.map((k) => [k, k === "holderJoiningYear" ? "2020" : 1]),
    ) as Record<string, unknown>;

    const patch = policyYearFinancialPatchData(sample as Parameters<typeof policyYearFinancialPatchData>[0]);

    for (const key of FINANCIAL_YEAR_KEYS) {
      expect(patch).toHaveProperty(key);
    }
  });
});
