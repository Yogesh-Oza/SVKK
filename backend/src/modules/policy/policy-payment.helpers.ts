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
