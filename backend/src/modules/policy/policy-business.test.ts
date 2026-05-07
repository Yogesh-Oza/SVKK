import { describe, expect, it } from "vitest";
import { ageOnDate, computePremiumDetails } from "./policy-business.js";

describe("policy-business", () => {
  it("computes age using anchor date with floor", () => {
    const age = ageOnDate(new Date("1990-06-15"), new Date("2025-05-14"));
    expect(age).toBe(34);
  });

  it("returns null age when expiry is before dob", () => {
    const age = ageOnDate(new Date("2025-01-01"), new Date("2024-12-31"));
    expect(age).toBeNull();
  });

  it("computes premium details for category B", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 12000,
      category: "B",
      premiumOneOrTwoLakh: 15000,
    });
    expect(out.taxAmount).toBe(1800);
    expect(out.svkkPremium).toBe(11800);
    expect(out.commission).toBe(1500);
    expect(out.vkkCommission).toBe(750);
    expect(out.policyHolderPremium).toBe(6000);
    expect(out.contribution).toBe(9000);
  });
});
