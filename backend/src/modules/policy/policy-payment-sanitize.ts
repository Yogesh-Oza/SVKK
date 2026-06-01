import { PayMethod } from "@prisma/client";
import type { PaymentReplaceRow } from "./policy.schemas.js";

/**
 * Keys nulled when the PayMethod does not use them.
 * Keep aligned with frontend `ad-policy-payment-mode-fields.ts`.
 */
export const PAYMENT_ROW_CLEAR_BY_METHOD: Record<
  PayMethod,
  readonly (keyof PaymentReplaceRow)[]
> = {
  [PayMethod.CASH]: [
    "transactionNumber",
    "bankName",
    "branchName",
    "accountNumber",
    "nameAsPerCheque",
    "ifscCode",
    "notOver",
    "dishonourReason",
  ],
  [PayMethod.UPI]: ["bankName", "branchName", "nameAsPerCheque", "ifscCode", "notOver"],
  [PayMethod.NEFT]: ["nameAsPerCheque", "notOver"],
  [PayMethod.CHQ]: [],
};

function nullIfCleared<T>(value: T | null | undefined): T | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

/**
 * Mandatory before persisting payments — strips fields that do not apply to `method`.
 */
export function sanitizePaymentReplaceRow(row: PaymentReplaceRow): PaymentReplaceRow {
  const next: PaymentReplaceRow = { ...row };
  for (const key of PAYMENT_ROW_CLEAR_BY_METHOD[row.method]) {
    (next as Record<string, unknown>)[key] = null;
  }
  if (row.method === PayMethod.UPI) {
    next.transactionNumber = nullIfCleared(next.transactionNumber) as string | null | undefined;
  }
  return next;
}

export type YearPaymentSummaryInput = {
  paymentMode?: string | null;
  bankName?: string | null;
  bankAccountLast4?: string | null;
  utrRef?: string | null;
};

/**
 * Clears policy-year bank summary when the primary mode cannot use those fields.
 */
export function sanitizeYearPaymentSummary(
  primaryMethod: PayMethod | null | undefined,
  fields: YearPaymentSummaryInput,
): YearPaymentSummaryInput {
  if (!primaryMethod) return fields;
  const next = { ...fields };
  if (primaryMethod === PayMethod.CASH) {
    next.bankName = null;
    next.bankAccountLast4 = null;
    next.utrRef = null;
    return next;
  }
  if (primaryMethod === PayMethod.UPI) {
    next.bankName = null;
    next.bankAccountLast4 = null;
    return next;
  }
  if (primaryMethod === PayMethod.NEFT) {
    next.bankAccountLast4 = null;
    return next;
  }
  if (primaryMethod === PayMethod.CHQ) {
    next.utrRef = null;
  }
  return next;
}

/** Resolve primary PayMethod from a payment batch (newest row — last in oldest-first API order). */
export function primaryPayMethodFromPayments(
  payments: PaymentReplaceRow[],
): PayMethod | undefined {
  if (!payments.length) return undefined;
  return payments[payments.length - 1]?.method;
}

export function payMethodFromModeString(mode: string | null | undefined): PayMethod | undefined {
  const m = (mode ?? "").toUpperCase();
  if (m === "CHQ" || m === "CHEQUE") return PayMethod.CHQ;
  if (m === "CASH") return PayMethod.CASH;
  if (m === "UPI") return PayMethod.UPI;
  if (m === "NEFT" || m === "ONLINE") return PayMethod.NEFT;
  return undefined;
}
