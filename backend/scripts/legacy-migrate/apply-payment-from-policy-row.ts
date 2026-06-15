import {
  PaymentStatus,
  Prisma,
  type PrismaClient,
  type TransactionClient,
} from "@prisma/client";
import {
  paymentModeToPayMethod,
  toChequeStatus,
} from "./config/dropdown-mappings.js";
import { parseLegacyChequeStatusToken, parseLegacyDate } from "./parse-legacy-date.js";
import type { TransformedPolicy } from "./transform.js";
import type { LegacyPolicyRow } from "./types.js";

export interface PaymentApplyResult {
  chequeCreated: boolean;
  paymentCreated: boolean;
}

function inferPaymentModeFromChequeNo(raw: string | null | undefined): string {
  const t = raw?.trim().toLowerCase() ?? "";
  if (t.includes("cash")) return "CASH";
  if (t.startsWith("ch-") || t.includes("cheque") || t.includes("chq")) return "CHEQUE";
  return "CHEQUE";
}

export async function applyPaymentAndChequeForPolicy(
  tx: TransactionClient,
  row: LegacyPolicyRow,
  t: TransformedPolicy,
  policyYearId: string,
  migrationRunId: string,
  resolvedPaymentMode: string,
): Promise<PaymentApplyResult> {
  const chequeNo = row.policy_cheque_no?.trim();
  const amount =
    t.yearData.expectedNetPremium instanceof Prisma.Decimal
      ? t.yearData.expectedNetPremium
      : t.yearData.vkkPremium instanceof Prisma.Decimal
        ? t.yearData.vkkPremium
        : null;

  if (!chequeNo && !amount) {
    return { chequeCreated: false, paymentCreated: false };
  }

  const mode =
    resolvedPaymentMode || inferPaymentModeFromChequeNo(chequeNo);
  const payMethod = paymentModeToPayMethod(mode);
  const statusToken = parseLegacyChequeStatusToken(row.cheque_status);
  const chequeStatus = toChequeStatus(statusToken);

  let chequeId: string | undefined;
  let chequeCreated = false;

  if (chequeNo && payMethod === "CHQ") {
    const existing = await tx.cheque.findFirst({
      where: { number: chequeNo.slice(0, 64) },
    });
    if (existing) {
      chequeId = existing.id;
    } else {
      const ch = await tx.cheque.create({
        data: {
          number: chequeNo.slice(0, 64),
          bankName: (row.bank?.trim() || "Unknown").slice(0, 200),
          ifsc: row.ifsc?.trim()?.slice(0, 20) || null,
          status: chequeStatus,
          reason: row.reason_dishonoured?.trim() || null,
          accountNo: row.account_no?.trim()?.slice(0, 64) || null,
          branch: row.branch?.trim()?.slice(0, 200) || null,
          nameAsPerCheque: row.name_as_per_cheque?.trim()?.slice(0, 200) || null,
          notOver: row.not_over?.trim()?.slice(0, 50) || null,
          chequeDate: parseLegacyDate(row.cheque_date),
          migratedRunId: migrationRunId,
        },
      });
      chequeId = ch.id;
      chequeCreated = true;
    }
  }

  const txnKey = `legacy:${t.refNo}`;
  const payAmount = amount ?? new Prisma.Decimal(0);
  const paymentStatus =
    chequeStatus === "CLEARED" || chequeStatus === "PAID"
      ? PaymentStatus.COMPLETED
      : chequeStatus === "DISHONOURED"
        ? PaymentStatus.FAILED
        : PaymentStatus.PENDING;

  const paymentData = {
    amount: payAmount,
    transactionNumber: txnKey,
    transactionDate: parseLegacyDate(row.cheque_date),
    bankName: row.bank?.trim()?.slice(0, 200) || null,
    branchName: row.branch?.trim()?.slice(0, 200) || null,
    accountNumber: row.account_no?.trim()?.slice(0, 64) || null,
    nameAsPerCheque: row.name_as_per_cheque?.trim()?.slice(0, 200) || null,
    ifscCode: row.ifsc?.trim()?.slice(0, 20) || null,
    notOver: row.not_over?.trim()?.slice(0, 50) || null,
    dishonourReason: row.reason_dishonoured?.trim() || null,
    status: paymentStatus,
    method: payMethod,
    chequeId: chequeId ?? null,
    migratedRunId: migrationRunId,
  };

  const existingPayment = await tx.payment.findFirst({
    where: { policyYearId, transactionNumber: txnKey, deletedAt: null },
  });
  if (existingPayment) {
    await tx.payment.update({
      where: { id: existingPayment.id },
      data: paymentData,
    });
  } else {
    await tx.payment.create({
      data: { policyYearId, ...paymentData },
    });
  }

  await tx.policyYear.update({
    where: { id: policyYearId },
    data: { paymentMode: mode },
  });

  return { chequeCreated, paymentCreated: true };
}

export async function applyReceiptIfNeeded(
  prisma: PrismaClient,
  policyId: string,
  policyYearId: string,
  t: TransformedPolicy,
  resolvedPaymentMode: string,
  migrationRunId: string,
): Promise<boolean> {
  const existing = await prisma.receipt.findFirst({ where: { policyId } });
  if (existing) return false;

  const amount =
    t.yearData.expectedNetPremium instanceof Prisma.Decimal
      ? Number(t.yearData.expectedNetPremium)
      : t.yearData.vkkPremium instanceof Prisma.Decimal
        ? Number(t.yearData.vkkPremium)
        : 0;
  if (amount <= 0) return false;

  const { createReceiptOnPolicyCreate } = await import("../../src/services/receipt.service.js");
  await prisma.$transaction(async (tx) => {
    await createReceiptOnPolicyCreate(tx, {
      policyId,
      policyYearId,
      amount,
      paymentMode: resolvedPaymentMode,
      issuedAt:
        t.yearData.policyStart instanceof Date ? t.yearData.policyStart : undefined,
    });
    await tx.receipt.updateMany({
      where: { policyId },
      data: { migratedRunId: migrationRunId },
    });
  });
  return true;
}
