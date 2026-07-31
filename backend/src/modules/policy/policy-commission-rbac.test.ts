import { describe, expect, it } from "vitest";
import {
  assertOrStripCommissionFields,
  fillCommissionFromGross,
} from "./policy-commission-rbac.js";

describe("fillCommissionFromGross", () => {
  it("fills commission and VKK commission from gross", () => {
    const year: { grossPremium: number; commissionAmount?: number; vkkCommission?: number } = {
      grossPremium: 15803,
    };
    fillCommissionFromGross(year);
    expect(year.commissionAmount).toBe(2370);
    expect(year.vkkCommission).toBe(1185);
  });

  it("does not overwrite existing commission values", () => {
    const year = { grossPremium: 10000, commissionAmount: 999, vkkCommission: 111 };
    fillCommissionFromGross(year);
    expect(year).toEqual({ grossPremium: 10000, commissionAmount: 999, vkkCommission: 111 });
  });

  it("does not overwrite explicit null (intentional clear)", () => {
    const year = {
      grossPremium: 10000,
      commissionAmount: null as number | null,
      vkkCommission: null as number | null,
    };
    fillCommissionFromGross(year);
    expect(year.commissionAmount).toBeNull();
    expect(year.vkkCommission).toBeNull();
  });

  it("fills only missing VKK commission from existing commission", () => {
    const year: { grossPremium: number; commissionAmount: number; vkkCommission?: number } = {
      grossPremium: 10000,
      commissionAmount: 1500,
    };
    fillCommissionFromGross(year);
    expect(year.vkkCommission).toBe(750);
  });

  it("no-ops without gross", () => {
    const year: { commissionAmount?: number } = {};
    fillCommissionFromGross(year);
    expect(year.commissionAmount).toBeUndefined();
  });
});

describe("assertOrStripCommissionFields", () => {
  it("allows non-null commission when permission is granted", () => {
    const year = { commissionAmount: 100, vkkCommission: 50 };
    assertOrStripCommissionFields(year, true);
    expect(year).toEqual({ commissionAmount: 100, vkkCommission: 50 });
  });

  it("strips null commission keys when permission is missing (edit save must not wipe)", () => {
    const year: {
      commissionAmount?: number | null;
      vkkCommission?: number | null;
      taxAmount?: number;
    } = {
      commissionAmount: null,
      vkkCommission: null,
      taxAmount: 100,
    };
    assertOrStripCommissionFields(year, false);
    expect(year).toEqual({ taxAmount: 100 });
    expect("commissionAmount" in year).toBe(false);
    expect("vkkCommission" in year).toBe(false);
  });

  it("accepts calculated commission without permission (business logic always runs)", () => {
    const year = { commissionAmount: 2370, vkkCommission: 1185 };
    assertOrStripCommissionFields(year, false);
    expect(year).toEqual({ commissionAmount: 2370, vkkCommission: 1185 });
  });

  it("fills commission from gross when missing without permission", () => {
    const year: {
      grossPremium: number;
      commissionAmount?: number | null;
      vkkCommission?: number | null;
    } = { grossPremium: 15803 };
    assertOrStripCommissionFields(year, false);
    expect(year.commissionAmount).toBe(2370);
    expect(year.vkkCommission).toBe(1185);
  });

  it("fills commission from gross after stripping nulls without permission", () => {
    const year: {
      grossPremium: number;
      commissionAmount?: number | null;
      vkkCommission?: number | null;
    } = {
      grossPremium: 10000,
      commissionAmount: null,
      vkkCommission: null,
    };
    assertOrStripCommissionFields(year, false);
    expect(year.commissionAmount).toBe(1500);
    expect(year.vkkCommission).toBe(750);
  });

  it("no-ops when year is undefined", () => {
    expect(() => assertOrStripCommissionFields(undefined, false)).not.toThrow();
  });
});
