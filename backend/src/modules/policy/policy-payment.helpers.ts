import type { Prisma } from "@prisma/client";

/** Blank strings must not be stored as transaction numbers. */
export function normalizeTxnNumber(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Soft-delete active payments for a policy year before replacing them. */
export async function prepareYearPaymentReplace(
  tx: Prisma.TransactionClient,
  policyYearId: string,
): Promise<void> {
  await tx.payment.updateMany({
    where: { policyYearId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}
