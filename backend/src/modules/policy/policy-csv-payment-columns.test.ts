import { describe, expect, it } from "vitest";
import { PayMethod } from "@prisma/client";
import {
  buildPaymentExportPlan,
  paymentCsvHeader,
  unionPaymentFieldsForMethods,
} from "./policy-csv-payment-columns.js";

describe("payment CSV columns", () => {
  it("uses Payment 1 prefix for every slot header", () => {
    expect(paymentCsvHeader(1, "method")).toBe("Payment 1 Mode of Payment");
    expect(paymentCsvHeader(2, "amountReceived")).toBe("Payment 2 Amount Received");
  });

  it("unions UPI, Cheque, and Cash field sets without duplicates", () => {
    const fields = unionPaymentFieldsForMethods([PayMethod.UPI, PayMethod.CHQ, PayMethod.CASH]);
    expect(fields).toContain("mobileNumber");
    expect(fields).toContain("bankName");
    expect(fields).toContain("amountReceived");
    expect(fields.filter((f) => f === "method")).toHaveLength(1);
  });

  it("builds per-slot dynamic headers from batch payment methods", () => {
    const plan = buildPaymentExportPlan(
      [
        {
          payments: [
            { method: PayMethod.CASH, createdAt: new Date("2026-01-01T08:00:00.000Z"), id: "c" },
            { method: PayMethod.CHQ, createdAt: new Date("2026-01-02T09:00:00.000Z"), id: "b" },
            { method: PayMethod.UPI, createdAt: new Date("2026-01-03T10:00:00.000Z"), id: "a" },
          ],
        },
      ],
      3,
    );

    expect(plan.headers).toContain(paymentCsvHeader(1, "mobileNumber"));
    expect(plan.headers).not.toContain(paymentCsvHeader(1, "bankName"));
    expect(plan.headers).toContain(paymentCsvHeader(2, "bankName"));
    expect(plan.headers).toContain(paymentCsvHeader(3, "method"));
    expect(plan.headers).not.toContain(paymentCsvHeader(3, "transactionNumber"));
  });
});
