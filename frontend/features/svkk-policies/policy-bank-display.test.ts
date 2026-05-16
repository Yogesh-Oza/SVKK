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
