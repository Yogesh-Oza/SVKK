import { CounterType, type Prisma } from "@prisma/client";
import { AppError } from "../errors/app-error.js";
import { allocateCounter, formatReceiptNo } from "./counter.service.js";

export type CreatePolicyReceiptInput = {
  policyId: string;
  policyYearId: string;
  amount: number;
  paymentMode?: string | null;
  issuedAt?: Date;
};

/**
 * Issue exactly one receipt when a policy is first created.
 * Receipt number and date are fixed at creation time for all future prints.
 */
export async function createReceiptOnPolicyCreate(
  tx: Prisma.TransactionClient,
  input: CreatePolicyReceiptInput,
) {
  const existing = await tx.receipt.findFirst({
    where: { policyId: input.policyId },
    select: { id: true },
  });
  if (existing) {
    throw new AppError("CONFLICT", "Receipt already exists for this policy", 409);
  }

  const issuedAt = input.issuedAt ?? new Date();
  const period = String(issuedAt.getFullYear());
  const seq = await allocateCounter(CounterType.RECEIPT, period, tx);
  const receiptNo = formatReceiptNo(period, seq);

  return tx.receipt.create({
    data: {
      policyId: input.policyId,
      policyYearId: input.policyYearId,
      receiptNo,
      amount: input.amount,
      paymentMode: input.paymentMode ?? undefined,
      policyDate: issuedAt,
    },
  });
}

export function resolveReceiptAmount(input: {
  vkkPremium?: number | null;
  amountReceived?: number | null;
  expectedNetPremium?: number | null;
}): number {
  if (input.vkkPremium != null && Number.isFinite(input.vkkPremium)) {
    return input.vkkPremium;
  }
  if (input.amountReceived != null && Number.isFinite(input.amountReceived)) {
    return input.amountReceived;
  }
  if (input.expectedNetPremium != null && Number.isFinite(input.expectedNetPremium)) {
    return input.expectedNetPremium;
  }
  return 0;
}
