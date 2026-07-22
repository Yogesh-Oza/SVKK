import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/app-error.js";
import { assertOrStripCommissionFields } from "./policy-commission-rbac.js";

describe("assertOrStripCommissionFields", () => {
  it("allows non-null commission when permission is granted", () => {
    const year = { commissionAmount: 100, vkkCommission: 50 };
    assertOrStripCommissionFields(year, true);
    expect(year).toEqual({ commissionAmount: 100, vkkCommission: 50 });
  });

  it("strips null commission keys when permission is missing (edit save must not 403)", () => {
    const year: {
      commissionAmount?: number | null;
      vkkCommission?: number | null;
      grossPremium?: number;
    } = {
      commissionAmount: null,
      vkkCommission: null,
      grossPremium: 1000,
    };
    assertOrStripCommissionFields(year, false);
    expect(year).toEqual({ grossPremium: 1000 });
    expect("commissionAmount" in year).toBe(false);
    expect("vkkCommission" in year).toBe(false);
  });

  it("rejects non-null commission when permission is missing", () => {
    const year = { commissionAmount: 100, vkkCommission: null };
    expect(() => assertOrStripCommissionFields(year, false)).toThrow(AppError);
    try {
      assertOrStripCommissionFields(year, false);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("FORBIDDEN");
      expect((e as AppError).statusCode).toBe(403);
    }
  });

  it("no-ops when year is undefined", () => {
    expect(() => assertOrStripCommissionFields(undefined, false)).not.toThrow();
  });
});
