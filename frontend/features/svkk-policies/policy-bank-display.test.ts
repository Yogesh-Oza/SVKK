import { describe, expect, it } from "vitest";
import { resolvePolicyBankInfo } from "./policy-bank-display";

describe("resolvePolicyBankInfo", () => {
  it("uses payment-level bank fields when no cheque row exists", () => {
    const info = resolvePolicyBankInfo({
      bankName: "Year Bank",
      payments: [
        {
          method: "CHQ",
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
    expect(info.number).toBe("CHQ123");
    expect(info.bankName).toBe("HDFC");
    expect(info.accountNo).toBe("1234567890");
    expect(info.ifsc).toBe("HDFC0001234");
  });

  it("prefers cheque row over payment fields", () => {
    const info = resolvePolicyBankInfo({
      payments: [
        {
          bankName: "Ignored",
          cheque: {
            number: "99",
            bankName: "SBI",
            accountNo: "1111",
          },
        },
      ],
    });
    expect(info.number).toBe("99");
    expect(info.bankName).toBe("SBI");
    expect(info.accountNo).toBe("1111");
  });
});
