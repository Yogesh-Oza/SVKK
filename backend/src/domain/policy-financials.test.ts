import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { PaymentStatus } from "@prisma/client";
import { reconcilePolicyYear } from "./policy-financials.js";

describe("reconcilePolicyYear", () => {
  it("returns PARTIAL when completed sum is below expected", () => {
    const r = reconcilePolicyYear({
      expectedNetPremium: new Decimal(1000),
      payments: [
        { amount: new Decimal(400), status: PaymentStatus.COMPLETED, deletedAt: null },
      ],
    });
    expect(r.paymentState).toBe("PARTIAL");
    expect(r.paid).toBe(400);
  });

  it("returns MET within tolerance", () => {
    const r = reconcilePolicyYear({
      expectedNetPremium: new Decimal(100),
      payments: [
        { amount: new Decimal(100.005), status: PaymentStatus.COMPLETED, deletedAt: null },
      ],
    });
    expect(r.paymentState).toBe("MET");
  });

  it("ignores deleted and non-COMPLETED payments", () => {
    const r = reconcilePolicyYear({
      expectedNetPremium: new Decimal(100),
      payments: [
        { amount: new Decimal(200), status: PaymentStatus.PENDING, deletedAt: null },
        { amount: new Decimal(100), status: PaymentStatus.COMPLETED, deletedAt: new Date() },
        { amount: new Decimal(100), status: PaymentStatus.COMPLETED, deletedAt: null },
      ],
    });
    expect(r.paid).toBe(100);
    expect(r.paymentState).toBe("MET");
  });

  it("returns OVER when paid exceeds expected", () => {
    const r = reconcilePolicyYear({
      expectedNetPremium: new Decimal(100),
      payments: [
        { amount: new Decimal(200), status: PaymentStatus.COMPLETED, deletedAt: null },
      ],
    });
    expect(r.paymentState).toBe("OVER");
  });
});
