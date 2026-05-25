import type { Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import type { PaymentReplaceRow } from "./policy.schemas.js";

/** Blank strings must not be stored — MySQL unique index treats `''` as a value. */
export function normalizeTxnNumber(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function assertUniqueTransactionNumbersInBatch(
  payments: PaymentReplaceRow[],
): void {
  const seen = new Set<string>();
  for (const row of payments) {
    const tn = normalizeTxnNumber(row.transactionNumber ?? null);
    if (!tn) continue;
    if (seen.has(tn)) {
      throw new AppError(
        "VALIDATION",
        `Duplicate transaction/cheque number in the same year: ${tn}`,
        400,
      );
    }
    seen.add(tn);
  }
}

/**
 * Soft-delete active payments for a year and clear transaction numbers on all deleted
 * rows for that year. Required because `transactionNumber` is globally unique and older
 * soft-deleted rows may still hold numbers from prior saves.
 */
export async function prepareYearPaymentReplace(
  tx: Prisma.TransactionClient,
  policyYearId: string,
): Promise<void> {
  await tx.payment.updateMany({
    where: { policyYearId, deletedAt: null },
    data: { deletedAt: new Date(), transactionNumber: null },
  });
  await tx.payment.updateMany({
    where: {
      policyYearId,
      deletedAt: { not: null },
      transactionNumber: { not: null },
    },
    data: { transactionNumber: null },
  });
}
