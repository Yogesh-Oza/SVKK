import { describe, expect, it } from "vitest";
import { resolvePolicyBankInfo, resolvePolicyPaymentDisplays } from "./policy-bank-display";

describe("resolvePolicyPaymentDisplays", () => {
  it("shows cheque fields for CHQ payments", () => {
    const rows = resolvePolicyPaymentDisplays({
      payments: [
        {
          method: "CHQ",
          amount: 8000,
          transactionNumber: "CHQ123",
          bankName: "HDFC",
          accountNumber: "1234567890",
          branchName: "Main",
          nameAsPerCheque: "Test User",
          ifscCode: "HDFC0001234",
          notOver: "5000",
          transactionDate: "2026-01-15T00:00:00.000Z",
          status: "PENDING",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].modeLabel).toBe("Cheque");
    expect(rows[0].fields.some((f) => f.label === "Policy cheque no" && f.value === "CHQ123")).toBe(true);
    expect(rows[0].fields.some((f) => f.label === "Bank name" && f.value === "HDFC")).toBe(true);
  });

  it("shows UPI fields for UPI payments", () => {
    const rows = resolvePolicyPaymentDisplays({
      payments: [
        {
          method: "UPI",
          amount: 2000,
          transactionNumber: "UTR999",
          accountNumber: "9876543210",
          transactionDate: "2026-02-01T00:00:00.000Z",
          status: "COMPLETED",
        },
      ],
    });
    expect(rows[0].modeLabel).toBe("UPI");
    expect(rows[0].fields.some((f) => f.label === "Transaction / UTR no" && f.value === "UTR999")).toBe(
      true,
    );
    expect(rows[0].fields.some((f) => f.label === "Mobile no" && f.value === "9876543210")).toBe(true);
  });

  it("returns one row per payment", () => {
    const rows = resolvePolicyPaymentDisplays({
      payments: [
        { method: "CHQ", amount: 5000, transactionNumber: "A", bankName: "SBI" },
        { method: "UPI", amount: 3000, transactionNumber: "UPI1", accountNumber: "111" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].index).toBe(1);
    expect(rows[1].index).toBe(2);
  });

  it("shows return and other charges for every payment mode", () => {
    const rows = resolvePolicyPaymentDisplays({
      payments: [
        {
          method: "CHQ",
          amount: 5000,
          transactionNumber: "CHQ-1",
          bankName: "SBI",
          returnCharges: 150,
          otherCharges: 50,
          status: "PENDING",
        },
        {
          method: "UPI",
          amount: 2000,
          transactionNumber: "UTR-1",
          accountNumber: "9876543210",
          returnCharges: 25,
          otherCharges: 10,
          status: "COMPLETED",
        },
        {
          method: "CASH",
          amount: 1000,
          transactionDate: "2026-03-01T00:00:00.000Z",
          returnCharges: 0,
          otherCharges: 5,
          status: "COMPLETED",
        },
      ],
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].fields.find((f) => f.label === "Return charges")?.value).toBe("150");
    expect(rows[0].fields.find((f) => f.label === "Other charges")?.value).toBe("50");
    expect(rows[1].fields.find((f) => f.label === "Return charges")?.value).toBe("25");
    expect(rows[1].fields.find((f) => f.label === "Other charges")?.value).toBe("10");
    expect(rows[2].fields.find((f) => f.label === "Other charges")?.value).toBe("5");
    expect(rows[2].fields.some((f) => f.label === "Transaction status" && f.value === "CLEARED")).toBe(true);
  });

  it("does not map return charges from not-over field", () => {
    const rows = resolvePolicyPaymentDisplays({
      payments: [
        {
          method: "UPI",
          amount: 1000,
          notOver: "9999",
          returnCharges: 100,
        },
      ],
    });
    expect(rows[0].fields.find((f) => f.label === "Return charges")?.value).toBe("100");
    expect(rows[0].fields.some((f) => f.label === "Return charges" && f.value === "9999")).toBe(false);
  });
});

describe("resolvePolicyBankInfo", () => {
  it("uses first payment for legacy summary", () => {
    const info = resolvePolicyBankInfo({
      payments: [
        {
          method: "CHQ",
          transactionNumber: "CHQ123",
          bankName: "HDFC",
        },
      ],
    });
    expect(info.number).toBe("CHQ123");
    expect(info.bankName).toBe("HDFC");
  });
});
