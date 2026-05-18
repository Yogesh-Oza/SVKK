import { PayMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  assertUniqueTransactionNumbersInBatch,
  normalizeTxnNumber,
} from "./policy-payment.helpers.js";
import { AppError } from "../../errors/app-error.js";

describe("policy-payment.helpers", () => {
  it("normalizes blank transaction numbers to undefined", () => {
    expect(normalizeTxnNumber("")).toBeUndefined();
    expect(normalizeTxnNumber("  ")).toBeUndefined();
    expect(normalizeTxnNumber(" UTR1 ")).toBe("UTR1");
  });

  it("rejects duplicate transaction numbers in one batch", () => {
    expect(() =>
      assertUniqueTransactionNumbersInBatch([
        { amount: 100, method: PayMethod.UPI, transactionNumber: "TXN-1" },
        { amount: 200, method: PayMethod.CASH, transactionNumber: "TXN-1" },
      ]),
    ).toThrow(AppError);
  });

  it("allows multiple rows without transaction numbers", () => {
    expect(() =>
      assertUniqueTransactionNumbersInBatch([
        { amount: 100, method: PayMethod.CASH, transactionNumber: null },
        { amount: 200, method: PayMethod.CASH, transactionNumber: "" },
      ]),
    ).not.toThrow();
  });
});
