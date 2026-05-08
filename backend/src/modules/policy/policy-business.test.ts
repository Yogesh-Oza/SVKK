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
      numberOfPersons: 1,
    });
    expect(out.taxAmount).toBe(1800);
    expect(out.svkkPremium).toBe(11800);
    expect(out.commission).toBe(1500);
    expect(out.vkkCommission).toBe(750);
    expect(out.policyHolderPremium).toBe(6000);
    expect(out.contribution).toBe(9000);
    expect(out.excessShortAmount).toBe(200);
    expect(out.differenceAmountPaidByHolder).toBe(9000);
  });

  it("computes full premium flow for category B with 3 persons", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 9000,
      category: "B",
      premiumOneOrTwoLakh: 12000,
      numberOfPersons: 3,
    });
    expect(out.taxAmount).toBe(1800);
    expect(out.svkkPremium).toBe(11800);
    expect(out.commission).toBe(1500);
    expect(out.vkkCommission).toBe(750);
    expect(out.policyHolderPremium).toBe(4500);
    expect(out.contribution).toBe(7500);
    expect(out.excessShortAmount).toBe(-2800);
    expect(out.differenceAmountPaidByHolder).toBe(7500);
  });

  it("computes category C premium per-person", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 9000,
      category: "C",
      premiumOneOrTwoLakh: 12000,
      numberOfPersons: 5,
    });
    expect(out.policyHolderPremium).toBe(15000);
  });

  it("rounds off policy holder premium for category B", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 7736.5,
      category: "B",
      premiumOneOrTwoLakh: 12000,
      numberOfPersons: 3,
    });
    expect(out.policyHolderPremium).toBe(3868);
  });

  it("computes full premium flow for category A with 3 persons", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 9000,
      category: "A",
      premiumOneOrTwoLakh: 12000,
      numberOfPersons: 3,
    });
    expect(out.taxAmount).toBe(1800);
    expect(out.svkkPremium).toBe(11800);
    expect(out.commission).toBe(1500);
    expect(out.vkkCommission).toBe(750);
    expect(out.policyHolderPremium).toBe(9000);
    expect(out.contribution).toBe(3000);
    expect(out.excessShortAmount).toBe(-2800);
    expect(out.differenceAmountPaidByHolder).toBe(12000);
  });

  it("computes full premium flow for category C with 3 persons", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 9000,
      category: "C",
      premiumOneOrTwoLakh: 12000,
      numberOfPersons: 3,
    });
    expect(out.taxAmount).toBe(1800);
    expect(out.svkkPremium).toBe(11800);
    expect(out.commission).toBe(1500);
    expect(out.vkkCommission).toBe(750);
    expect(out.policyHolderPremium).toBe(9000);
    expect(out.contribution).toBe(3000);
    expect(out.excessShortAmount).toBe(-2800);
    expect(out.differenceAmountPaidByHolder).toBe(12000);
  });

  it("computes full premium flow for category D with 3 persons (same as A)", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 9000,
      category: "D",
      premiumOneOrTwoLakh: 12000,
      numberOfPersons: 3,
    });
    expect(out.taxAmount).toBe(1800);
    expect(out.svkkPremium).toBe(11800);
    expect(out.commission).toBe(1500);
    expect(out.vkkCommission).toBe(750);
    expect(out.policyHolderPremium).toBe(9000);
    expect(out.contribution).toBe(3000);
    expect(out.excessShortAmount).toBe(-2800);
    expect(out.differenceAmountPaidByHolder).toBe(12000);
  });
});
