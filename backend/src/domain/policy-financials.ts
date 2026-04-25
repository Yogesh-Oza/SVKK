import type { Decimal } from "@prisma/client/runtime/library";
import { PaymentStatus } from "@prisma/client";

const TOLERANCE = 0.01;

function toNum(d: Decimal | null | undefined): number {
  if (d == null) {
    return 0;
  }
  return Number(d);
}

/**
 * Sum of completed payments vs expected premium; drives PARTIAL vs met.
 */
export function sumCompletedPayments(
  payments: { amount: Decimal; status: PaymentStatus; deletedAt: Date | null }[],
): number {
  return payments
    .filter((p) => !p.deletedAt && p.status === PaymentStatus.COMPLETED)
    .reduce((s, p) => s + toNum(p.amount), 0);
}

/**
 * Reconciliation state for a policy year.
 */
export function reconcilePolicyYear(input: {
  expectedNetPremium: Decimal | null | undefined;
  payments: { amount: Decimal; status: PaymentStatus; deletedAt: Date | null }[];
}): {
  expected: number;
  paid: number;
  balance: number;
  paymentState: "NONE" | "PARTIAL" | "MET" | "OVER";
} {
  const expected = toNum(input.expectedNetPremium);
  const paid = sumCompletedPayments(input.payments);
  const balance = expected - paid;
  if (expected <= 0) {
    return { expected, paid, balance, paymentState: paid > 0 ? "MET" : "NONE" };
  }
  if (paid + TOLERANCE < expected) {
    return { expected, paid, balance, paymentState: "PARTIAL" };
  }
  if (paid > expected + TOLERANCE) {
    return { expected, paid, balance, paymentState: "OVER" };
  }
  return { expected, paid, balance, paymentState: "MET" };
}
