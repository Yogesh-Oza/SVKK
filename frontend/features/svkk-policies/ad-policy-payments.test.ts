import { describe, expect, it } from "vitest";
import { getAdPolicyInitialValues } from "./ad-policy-form-values";
import { clonePaymentDetailsForCarryForward } from "./ad-policy-payments";

describe("clonePaymentDetailsForCarryForward", () => {
  it("copies flat bank fields and all payment transaction rows", () => {
    const carried = getAdPolicyInitialValues();
    carried.paymentMode = "CHEQUE";
    carried.bank = "SBI";
    carried.policyChequeNo = "CH-999";
    carried.paymentTransactions = [
      {
        ...carried.paymentTransactions[0],
        mode: "CHEQUE",
        transactionNumber: "CH-999",
        bankName: "SBI",
        amountReceived: "5000",
      },
      {
        ...carried.paymentTransactions[0],
        mode: "UPI",
        mobileNumber: "9876543210",
        transactionNumber: "UTR-1",
        amountReceived: "1000",
      },
    ];

    const out = clonePaymentDetailsForCarryForward(carried);

    expect(out.paymentMode).toBe("CHEQUE");
    expect(out.bank).toBe("SBI");
    expect(out.policyChequeNo).toBe("CH-999");
    expect(out.paymentTransactions).toHaveLength(2);
    expect(out.paymentTransactions[0].bankName).toBe("SBI");
    expect(out.paymentTransactions[1].mode).toBe("UPI");
    expect(out.paymentTransactions[1].amountReceived).toBe("1000");

    carried.paymentTransactions[0].bankName = "MUTATED";
    expect(out.paymentTransactions[0].bankName).toBe("SBI");
  });

  it("returns one empty transaction when source has none", () => {
    const carried = getAdPolicyInitialValues();
    carried.paymentTransactions = [];
    const out = clonePaymentDetailsForCarryForward(carried);
    expect(out.paymentTransactions).toHaveLength(1);
    expect(out.paymentTransactions[0].mode).toBe("CHEQUE");
  });
});
