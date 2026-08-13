import { Prisma, type PrismaClient } from "@prisma/client";
import {
  appendWalletTxn,
  decimalToString,
  ensureAndLockWallet,
  monthYearFromDate,
} from "./wallet.service.js";

export type PolicyWalletSnapshotSource = {
  id: string;
  policyNo?: string | null;
  archivedPolicyNo?: string | null;
  cdAccountUsed?: boolean | null;
  cdAmount?: Prisma.Decimal | number | string | null;
  dateOfSubmission?: Date | null;
  holderName?: string | null;
  village?: string | null;
  policyGroup?: string | null;
  policyGrouping?: string | null;
  categoryText?: string | null;
  category?: { name?: string | null } | null;
  policyType?: { name?: string | null } | null;
  insuredParty?: { name?: string | null } | null;
};

export function effectiveCdAmount(input: {
  cdAccountUsed?: boolean | null;
  cdAmount?: Prisma.Decimal | number | string | null;
}): Prisma.Decimal {
  if (input.cdAccountUsed !== true) return new Prisma.Decimal(0);
  if (input.cdAmount == null || input.cdAmount === "") return new Prisma.Decimal(0);
  try {
    const d =
      input.cdAmount instanceof Prisma.Decimal
        ? input.cdAmount
        : new Prisma.Decimal(String(input.cdAmount));
    if (!d.isFinite() || d.lte(0)) return new Prisma.Decimal(0);
    return d;
  } catch {
    return new Prisma.Decimal(0);
  }
}

export function cdDelta(
  previousEffective: Prisma.Decimal,
  nextEffective: Prisma.Decimal,
): Prisma.Decimal {
  return nextEffective.minus(previousEffective);
}

function resolveHolderName(p: PolicyWalletSnapshotSource): string | null {
  return (p.holderName || p.insuredParty?.name || "").trim() || null;
}

function resolveCategory(p: PolicyWalletSnapshotSource): string | null {
  return (p.category?.name || p.categoryText || "").trim() || null;
}

function resolveGroup(p: PolicyWalletSnapshotSource): string | null {
  return (p.policyGroup || p.policyGrouping || "").trim() || null;
}

function resolvePolicyNumber(p: PolicyWalletSnapshotSource): string | null {
  return (p.policyNo || p.archivedPolicyNo || "").trim() || null;
}

export function buildPolicyWalletSnapshots(p: PolicyWalletSnapshotSource) {
  const dateOfSubmission = p.dateOfSubmission ?? null;
  const derived = monthYearFromDate(dateOfSubmission);
  const policyCd = effectiveCdAmount(p);
  return {
    policyId: p.id,
    policyNumber: resolvePolicyNumber(p),
    dateOfSubmission,
    monthText: derived.monthText,
    yearText: derived.yearText,
    holderName: resolveHolderName(p),
    village: (p.village || "").trim() || null,
    category: resolveCategory(p),
    groupName: resolveGroup(p),
    policyTypeName: (p.policyType?.name || "").trim() || null,
    cdAccountUsed: p.cdAccountUsed === true ? "Yes" : p.cdAccountUsed === false ? "No" : null,
    cdAmount: policyCd.gt(0) ? policyCd : null,
  };
}

/** Net CD amount still held against the policy: sum(DEBIT) - sum(CREDIT). */
export async function netPostedForPolicy(
  tx: Prisma.TransactionClient,
  policyId: string,
): Promise<Prisma.Decimal> {
  const [debits, credits] = await Promise.all([
    tx.walletTransaction.aggregate({
      where: { policyId, type: "DEBIT" },
      _sum: { amount: true },
    }),
    tx.walletTransaction.aggregate({
      where: { policyId, type: "CREDIT" },
      _sum: { amount: true },
    }),
  ]);
  const debitSum = debits._sum.amount ?? new Prisma.Decimal(0);
  const creditSum = credits._sum.amount ?? new Prisma.Decimal(0);
  return debitSum.minus(creditSum);
}

export type SyncPolicyWalletResult = {
  posted: boolean;
  type: "DEBIT" | "CREDIT" | null;
  amount: string | null;
  txnId: string | null;
  balanceAfter: string | null;
};

/**
 * Post debit/credit for a policy CD amount change inside an existing transaction.
 * previousEffective / nextEffective are absolute effective CD amounts.
 */
export async function syncPolicyWallet(
  tx: Prisma.TransactionClient,
  input: {
    policy: PolicyWalletSnapshotSource;
    previousEffective: Prisma.Decimal;
    nextEffective: Prisma.Decimal;
    allowNegative?: boolean;
    userId?: string | null;
    remark?: string;
    source?: "POLICY" | "RESTORE";
  },
): Promise<SyncPolicyWalletResult> {
  const delta = cdDelta(input.previousEffective, input.nextEffective);
  if (delta.eq(0)) {
    return { posted: false, type: null, amount: null, txnId: null, balanceAfter: null };
  }

  const isCredit = delta.lt(0);
  const type: "DEBIT" | "CREDIT" = isCredit ? "CREDIT" : "DEBIT";
  const move = delta.abs();

  const wallet = await ensureAndLockWallet(tx);
  const snapshots = buildPolicyWalletSnapshots({
    ...input.policy,
    cdAccountUsed: input.nextEffective.gt(0) ? true : input.policy.cdAccountUsed,
    cdAmount: input.nextEffective.gt(0) ? input.nextEffective : input.policy.cdAmount,
  });
  const remark =
    input.remark ||
    (type === "DEBIT"
      ? `Policy CD deduction (${snapshots.policyNumber || snapshots.policyId})`
      : `Policy CD refund/reversal (${snapshots.policyNumber || snapshots.policyId})`);

  const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
    type,
    source: input.source ?? "POLICY",
    amount: move,
    isCredit,
    allowNegative: input.allowNegative,
    userId: input.userId,
    snapshots: {
      ...snapshots,
      cdAmount: move,
      remark,
      particulars: remark,
    },
  });

  return {
    posted: true,
    type,
    amount: decimalToString(move),
    txnId: txn.id,
    balanceAfter: decimalToString(newBalance),
  };
}

/** Soft-delete: credit back net posted for the policy. */
export async function reversePolicyWalletOnDelete(
  tx: Prisma.TransactionClient,
  input: {
    policy: PolicyWalletSnapshotSource;
    userId?: string | null;
  },
): Promise<SyncPolicyWalletResult> {
  const net = await netPostedForPolicy(tx, input.policy.id);
  if (net.lte(0)) {
    return { posted: false, type: null, amount: null, txnId: null, balanceAfter: null };
  }
  return syncPolicyWallet(tx, {
    policy: input.policy,
    previousEffective: net,
    nextEffective: new Prisma.Decimal(0),
    allowNegative: true,
    userId: input.userId,
    source: "POLICY",
    remark: `Policy delete CD reversal (${input.policy.policyNo || input.policy.archivedPolicyNo || input.policy.id})`,
  });
}

/** Restore archived policy: re-debit effective CD. */
export async function redebitPolicyWalletOnRestore(
  tx: Prisma.TransactionClient,
  input: {
    policy: PolicyWalletSnapshotSource;
    allowNegative?: boolean;
    userId?: string | null;
  },
): Promise<SyncPolicyWalletResult> {
  const next = effectiveCdAmount(input.policy);
  if (next.lte(0)) {
    return { posted: false, type: null, amount: null, txnId: null, balanceAfter: null };
  }
  return syncPolicyWallet(tx, {
    policy: input.policy,
    previousEffective: new Prisma.Decimal(0),
    nextEffective: next,
    allowNegative: input.allowNegative,
    userId: input.userId,
    source: "RESTORE",
    remark: `Policy restore CD re-debit (${input.policy.policyNo || input.policy.id})`,
  });
}

export async function syncPolicyWalletStandalone(input: {
  policy: PolicyWalletSnapshotSource;
  previousEffective: Prisma.Decimal;
  nextEffective: Prisma.Decimal;
  allowNegative?: boolean;
  userId?: string | null;
  prismaClient?: PrismaClient;
}): Promise<SyncPolicyWalletResult> {
  const db = input.prismaClient ?? (await import("../../lib/prisma.js")).prisma;
  return db.$transaction(async (tx: Prisma.TransactionClient) =>
    syncPolicyWallet(tx, {
      policy: input.policy,
      previousEffective: input.previousEffective,
      nextEffective: input.nextEffective,
      allowNegative: input.allowNegative,
      userId: input.userId,
    }),
  );
}
