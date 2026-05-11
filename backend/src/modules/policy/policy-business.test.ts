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

  // Category B Holder Premium formula: 50% of (1L/2L) base premium.
  // Difference Amount = Net - (1L/2L) + Holder Premium.
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
    expect(out.policyHolderPremium).toBe(7500);
    expect(out.contribution).toBe(7500);
    expect(out.excessShortAmount).toBe(200);
    expect(out.differenceAmountPaidByHolder).toBe(4500);
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
    expect(out.policyHolderPremium).toBe(6000);
    expect(out.contribution).toBe(6000);
    expect(out.excessShortAmount).toBe(-2800);
    expect(out.differenceAmountPaidByHolder).toBe(3000);
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

  // basePremium = 7737 → 7737 * 0.5 = 3868.5 → Math.round(3868.5) = 3869
  it("rounds off policy holder premium for category B", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 7736.5,
      category: "B",
      premiumOneOrTwoLakh: 7737,
      numberOfPersons: 3,
    });
    expect(out.policyHolderPremium).toBe(3869);
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
    expect(out.differenceAmountPaidByHolder).toBe(6000);
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
    expect(out.differenceAmountPaidByHolder).toBe(6000);
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
    expect(out.differenceAmountPaidByHolder).toBe(6000);
  });

  it("category B holder premium is decoupled from net premium (changing net does not change holder premium)", () => {
    const baseInput = {
      grossPremium: 10000,
      taxPercent: 18,
      category: "B",
      premiumOneOrTwoLakh: 20000,
      numberOfPersons: 2,
    };
    const lowNet = computePremiumDetails({ ...baseInput, netPremium: 5000 });
    const highNet = computePremiumDetails({ ...baseInput, netPremium: 25000 });
    expect(lowNet.policyHolderPremium).toBe(10000);
    expect(highNet.policyHolderPremium).toBe(10000);
    expect(lowNet.differenceAmountPaidByHolder).toBe(5000 - 20000 + 10000);
    expect(highNet.differenceAmountPaidByHolder).toBe(25000 - 20000 + 10000);
  });

  it("category B handles zero base premium gracefully", () => {
    const out = computePremiumDetails({
      grossPremium: 10000,
      taxPercent: 18,
      netPremium: 8000,
      category: "B",
      premiumOneOrTwoLakh: 0,
      numberOfPersons: 1,
    });
    expect(out.policyHolderPremium).toBe(0);
    expect(out.contribution).toBe(0);
    expect(out.differenceAmountPaidByHolder).toBe(8000);
  });

  it("defaults to 1 person when numberOfPersons is missing or invalid", () => {
    const out = computePremiumDetails({
      grossPremium: 5000,
      taxPercent: 18,
      netPremium: 5900,
      category: "C",
      premiumOneOrTwoLakh: 10000,
    });
    expect(out.policyHolderPremium).toBe(3000);
  });
});
