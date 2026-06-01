import { PayMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  payMethodFromModeString,
  primaryPayMethodFromPayments,
  sanitizePaymentReplaceRow,
  sanitizeYearPaymentSummary,
} from "./policy-payment-sanitize.js";

describe("sanitizePaymentReplaceRow", () => {
  it("strips bank and transaction fields for CASH", () => {
    const out = sanitizePaymentReplaceRow({
      amount: 500,
      method: PayMethod.CASH,
      transactionNumber: "CHQ-OLD",
      bankName: "SBI",
      accountNumber: "1234567890",
      ifscCode: "SBIN0001",
    });
    expect(out).toMatchObject({
      method: PayMethod.CASH,
      transactionNumber: null,
      bankName: null,
      accountNumber: null,
      ifscCode: null,
    });
  });

  it("keeps bank fields for CHQ", () => {
    const out = sanitizePaymentReplaceRow({
      amount: 500,
      method: PayMethod.CHQ,
      transactionNumber: "CHQ-1",
      bankName: "HDFC",
      accountNumber: "999",
    });
    expect(out.bankName).toBe("HDFC");
    expect(out.transactionNumber).toBe("CHQ-1");
  });

  it("clears bank fields for UPI but keeps accountNumber", () => {
    const out = sanitizePaymentReplaceRow({
      amount: 100,
      method: PayMethod.UPI,
      transactionNumber: "UTR-1",
      bankName: "Stale Bank",
      accountNumber: "9876543210",
      nameAsPerCheque: "Holder",
    });
    expect(out.bankName).toBeNull();
    expect(out.nameAsPerCheque).toBeNull();
    expect(out.accountNumber).toBe("9876543210");
    expect(out.transactionNumber).toBe("UTR-1");
  });
});

describe("sanitizeYearPaymentSummary", () => {
  it("nulls bank and utr for CASH", () => {
    expect(
      sanitizeYearPaymentSummary(PayMethod.CASH, {
        bankName: "SBI",
        bankAccountLast4: "7890",
        utrRef: "UTR-1",
      }),
    ).toEqual({
      bankName: null,
      bankAccountLast4: null,
      utrRef: null,
    });
  });

  it("clears utr for CHQ", () => {
    expect(
      sanitizeYearPaymentSummary(PayMethod.CHQ, {
        bankName: "SBI",
        utrRef: "UTR-1",
      }),
    ).toMatchObject({ bankName: "SBI", utrRef: null });
  });
});

describe("primaryPayMethodFromPayments", () => {
  it("uses the last row as newest in oldest-first API order", () => {
    expect(
      primaryPayMethodFromPayments([
        { amount: 1, method: PayMethod.CHQ },
        { amount: 2, method: PayMethod.CASH },
      ]),
    ).toBe(PayMethod.CASH);
  });
});

describe("payMethodFromModeString", () => {
  it("maps legacy mode strings", () => {
    expect(payMethodFromModeString("CHQ")).toBe(PayMethod.CHQ);
    expect(payMethodFromModeString("NEFT")).toBe(PayMethod.NEFT);
    expect(payMethodFromModeString("UPI")).toBe(PayMethod.UPI);
  });
});
