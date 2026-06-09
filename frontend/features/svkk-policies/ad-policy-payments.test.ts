import { describe, expect, it } from "vitest";
import { getAdPolicyInitialValues } from "./ad-policy-form-values";
import {
  applyPrimaryPaymentModeToBody,
  clonePaymentDetailsForCarryForward,
  mapPaymentTransactionsToApi,
  mapTransactionModeToPayMethod,
  sanitizeByMode,
  sanitizePaymentTransactionForMode,
  sortPaymentRowsNewestFirst,
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

describe("mapTransactionModeToPayMethod", () => {
  it("maps Online to NEFT and keeps UPI separate", () => {
    expect(mapTransactionModeToPayMethod("ONLINE")).toBe("NEFT");
    expect(mapTransactionModeToPayMethod("UPI")).toBe("UPI");
    expect(mapTransactionModeToPayMethod("CHEQUE")).toBe("CHQ");
    expect(mapTransactionModeToPayMethod("CASH")).toBe("CASH");
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
    // Form is newest-first; API persists oldest-first for createdAt ordering.
    expect(api[0]).toMatchObject({
      method: "UPI",
      amount: 2000,
      accountNumber: "9876543210",
      returnCharges: null,
      otherCharges: 25,
    });
    expect(api[1]).toMatchObject({
      method: "CHQ",
      amount: 8000,
      transactionNumber: "CHQ-100",
      bankName: "HDFC",
      status: "CLEARED",
      returnCharges: 150,
      otherCharges: 50,
    });
  });

  it("stores Online bank transfer as NEFT, not UPI", () => {
    const values = getAdPolicyInitialValues();
    values.paymentTransactions = [
      {
        ...values.paymentTransactions[0],
        mode: "ONLINE",
        transactionNumber: "NEFT-REF-1",
        bankName: "HDFC",
        accountNumber: "1234567890",
        amountReceived: "4000",
        transactionStatus: "DISHONOURED",
        dishonourReason: "test",
      },
    ];

    const api = mapPaymentTransactionsToApi(values);
    expect(api).toHaveLength(1);
    expect(api[0]).toMatchObject({
      method: "NEFT",
      transactionNumber: "NEFT-REF-1",
      accountNumber: "1234567890",
      status: "DISHONOURED",
    });
  });
});

describe("sanitizePaymentTransactionForMode", () => {
  it("clears bank fields when mode changes from CHEQUE to CASH", () => {
    const row = sanitizePaymentTransactionForMode({
      mode: "CASH",
      mobileNumber: "",
      transactionNumber: "CHQ-999",
      bankName: "SBI",
      branch: "Main",
      accountNumber: "1234567890",
      nameAsPerCheque: "Holder",
      ifscCode: "SBIN0001",
      notOver: "10000",
      transactionDate: "2026-01-01",
      transactionStatus: "CLEARED",
      dishonourReason: "n/a",
      returnCharges: "",
      otherCharges: "",
      amountReceived: "5000",
    });
    expect(row.bankName).toBe("");
    expect(row.transactionNumber).toBe("");
    expect(row.accountNumber).toBe("");
  });
});

describe("mapPaymentTransactionsToApi ONLINE notOver", () => {
  it("persists notOver for Online (NEFT) payments", () => {
    const values = getAdPolicyInitialValues();
    values.paymentTransactions = [
      {
        ...values.paymentTransactions[0],
        mode: "ONLINE",
        transactionNumber: "NEFT-002709242629",
        bankName: "TJSB bank",
        branch: "Thane-400601",
        accountNumber: "AC-002110100055478",
        ifscCode: "TJSB0000002",
        notOver: "8000",
        transactionDate: "08-06-2026",
        transactionStatus: "CLEARED",
        amountReceived: "6000",
      },
    ];

    const api = mapPaymentTransactionsToApi(values);
    expect(api).toHaveLength(1);
    expect(api[0]).toMatchObject({
      method: "NEFT",
      notOver: "8000",
      bankName: "TJSB bank",
    });
  });
});

describe("mapPaymentTransactionsToApi payment-mode leakage", () => {
  it("does not persist bank fields after CHEQUE carry-forward row is switched to CASH", () => {
    const values = getAdPolicyInitialValues();
    values.paymentTransactions = [
      sanitizePaymentTransactionForMode({
        ...values.paymentTransactions[0],
        mode: "CASH",
        transactionNumber: "CHQ-999",
        bankName: "SBI",
        branch: "Main",
        accountNumber: "1234567890",
        nameAsPerCheque: "Holder",
        ifscCode: "SBIN0001",
        notOver: "10000",
        amountReceived: "5000",
      }),
    ];

    const api = mapPaymentTransactionsToApi(values);
    expect(api).toHaveLength(1);
    expect(api[0]).toMatchObject({
      method: "CASH",
      amount: 5000,
      bankName: null,
      branchName: null,
      accountNumber: null,
      transactionNumber: null,
      ifscCode: null,
      nameAsPerCheque: null,
    });
  });
});

describe("applyPrimaryPaymentModeToBody", () => {
  it("nulls year-level bank summary for CASH", () => {
    const values = getAdPolicyInitialValues();
    values.bank = "SBI";
    values.accountNo = "1234567890";
    values.onlineTransactionRef = "UTR-OLD";
    values.paymentTransactions = [
      {
        ...values.paymentTransactions[0],
        mode: "CASH",
        bankName: "SBI",
        accountNumber: "1234567890",
        amountReceived: "1000",
      },
    ];

    const body: Record<string, unknown> = {};
    applyPrimaryPaymentModeToBody(body, values);
    expect(body).toMatchObject({
      paymentMode: "CASH",
      bankName: null,
      bankAccountLast4: null,
      utrRef: null,
      amountReceived: 1000,
    });
  });
});

describe("carry-forward integration: mode switch then submit payload", () => {
  it("builds a CASH payload without bank metadata after mode change", () => {
    const carried = getAdPolicyInitialValues();
    carried.paymentMode = "CHEQUE";
    carried.bank = "SBI";
    carried.paymentTransactions = [
      {
        ...carried.paymentTransactions[0],
        mode: "CHEQUE",
        transactionNumber: "CH-999",
        bankName: "SBI",
        accountNumber: "111122223333",
        amountReceived: "8000",
      },
    ];
    const paymentDetails = clonePaymentDetailsForCarryForward(carried);
    const values = { ...getAdPolicyInitialValues(), ...paymentDetails };
    values.paymentTransactions[0] = sanitizePaymentTransactionForMode({
      ...values.paymentTransactions[0],
      mode: "CASH",
    });

    const api = mapPaymentTransactionsToApi(values);
    const body: Record<string, unknown> = {};
    applyPrimaryPaymentModeToBody(body, values);

    expect(api[0]?.bankName).toBeNull();
    expect(body.bankName).toBeNull();
    expect(body.utrRef).toBeNull();
  });
});

describe("sanitizeByMode apiPayload", () => {
  it("uses null for cleared API fields", () => {
    const out = sanitizeByMode(
      "CASH",
      {
        ...getAdPolicyInitialValues().paymentTransactions[0],
        mode: "CASH",
        bankName: "X",
      },
      { apiPayload: true },
    );
    expect(out.bankName).toBeNull();
  });
});

describe("sortPaymentRowsNewestFirst", () => {
  it("orders newest payment first regardless of API array order", () => {
    const sorted = sortPaymentRowsNewestFirst([
      { id: "b", createdAt: "2026-05-29T00:00:00.000Z", method: "UPI" },
      { id: "a", createdAt: "2026-05-25T00:00:00.000Z", method: "CHQ" },
      { id: "c", createdAt: "2026-05-26T00:00:00.000Z", method: "CASH" },
    ]);
    expect(sorted.map((p) => p.method)).toEqual(["UPI", "CASH", "CHQ"]);
  });
});
