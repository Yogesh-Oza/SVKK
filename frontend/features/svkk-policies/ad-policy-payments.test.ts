import { describe, expect, it } from "vitest";
import { getAdPolicyInitialValues } from "./ad-policy-form-values";
import {
  clonePaymentDetailsForCarryForward,
  mapPaymentTransactionsToApi,
} from "./ad-policy-payments";

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

describe("mapPaymentTransactionsToApi", () => {
  it("maps every row with an amount and skips empty rows", () => {
    const values = getAdPolicyInitialValues();
    values.paymentTransactions = [
      {
        ...values.paymentTransactions[0],
        mode: "CHEQUE",
        transactionNumber: "CHQ-100",
        bankName: "HDFC",
        amountReceived: "8000",
        transactionDate: "2026-01-15",
        transactionStatus: "CLEARED",
        returnCharges: "150",
        otherCharges: "50",
      },
      {
        ...values.paymentTransactions[0],
        mode: "UPI",
        mobileNumber: "9876543210",
        transactionNumber: "UTR-200",
        amountReceived: "2,000",
        transactionStatus: "PENDING",
        returnCharges: "",
        otherCharges: "25",
      },
      {
        ...values.paymentTransactions[0],
        mode: "CASH",
        amountReceived: "",
      },
    ];

    const api = mapPaymentTransactionsToApi(values);
    expect(api).toHaveLength(2);
    expect(api[0]).toMatchObject({
      method: "CHQ",
      amount: 8000,
      transactionNumber: "CHQ-100",
      bankName: "HDFC",
      status: "CLEARED",
      returnCharges: 150,
      otherCharges: 50,
    });
    expect(api[1]).toMatchObject({
      method: "UPI",
      amount: 2000,
      accountNumber: "9876543210",
      returnCharges: null,
      otherCharges: 25,
    });
  });
});
