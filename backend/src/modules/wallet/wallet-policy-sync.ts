import { Prisma, type PrismaClient, type WalletTxnSource } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import {
  appendWalletTxn,
  decimalToString,
  ensureAndLockWallet,
  monthYearFromDate,
  recalculateWalletBalances,
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

const POLICY_CD_SOURCES: WalletTxnSource[] = ["POLICY", "RESTORE"];

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

function sliceOrNull(raw: string | null | undefined, max: number): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return t.slice(0, max);
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

async function findPolicyCdDebitRows(tx: Prisma.TransactionClient, policyId: string) {
  return tx.walletTransaction.findMany({
    where: {
      policyId,
      type: "DEBIT",
      source: { in: POLICY_CD_SOURCES },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

/** Keep one policy CD debit row; remove legacy duplicate rows from older delta logic. */
async function primaryPolicyCdDebit(
  tx: Prisma.TransactionClient,
  policyId: string,
) {
  const rows = await findPolicyCdDebitRows(tx, policyId);
  if (rows.length <= 1) return rows[0] ?? null;
  const [primary, ...extras] = rows;
  await tx.walletTransaction.deleteMany({
    where: { id: { in: extras.map((r) => r.id) } },
  });
  return primary;
}

function policyCdRemark(policyNumber: string | null, policyId: string): string {
  return `Policy CD deduction (${policyNumber || policyId})`;
}

function snapshotUpdateData(
  snapshots: ReturnType<typeof buildPolicyWalletSnapshots>,
  amount: Prisma.Decimal,
  remark: string,
) {
  return {
    amount,
    cdAmount: amount,
    policyId: snapshots.policyId,
    policyNumber: sliceOrNull(snapshots.policyNumber, 120),
    dateOfSubmission: snapshots.dateOfSubmission,
    monthText: sliceOrNull(snapshots.monthText, 20),
    yearText: sliceOrNull(snapshots.yearText, 8),
    holderName: sliceOrNull(snapshots.holderName, 200),
    village: sliceOrNull(snapshots.village, 200),
    category: sliceOrNull(snapshots.category, 32),
    groupName: sliceOrNull(snapshots.groupName, 64),
    policyTypeName: sliceOrNull(snapshots.policyTypeName, 120),
    cdAccountUsed: sliceOrNull(snapshots.cdAccountUsed, 16),
    remark,
    particulars: remark,
  };
}

export type SyncPolicyWalletResult = {
  posted: boolean;
  type: "DEBIT" | "CREDIT" | null;
  amount: string | null;
  txnId: string | null;
  balanceAfter: string | null;
};

/**
 * One wallet debit row per policy. Updates that row in place when CD changes;
 * recalculates the full balance chain. No new row when CD amount is unchanged.
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
  const next = input.nextEffective;
  const prev = input.previousEffective;

  const wallet = await ensureAndLockWallet(tx);
  const existing = await primaryPolicyCdDebit(tx, input.policy.id);

  if (next.lte(0)) {
    if (!existing) {
      return { posted: false, type: null, amount: null, txnId: null, balanceAfter: null };
    }
    await tx.walletTransaction.delete({ where: { id: existing.id } });
    const balance = await recalculateWalletBalances(tx, wallet.id);
    if (balance.lt(0) && !input.allowNegative) {
      throw new AppError(
        "WALLET_INSUFFICIENT",
        "Amount is greater than wallet balance. Confirm to allow a negative balance.",
        409,
      );
    }
    return {
      posted: true,
      type: "CREDIT",
      amount: decimalToString(existing.amount),
      txnId: existing.id,
      balanceAfter: decimalToString(balance),
    };
  }

  const snapshots = buildPolicyWalletSnapshots({
    ...input.policy,
    cdAccountUsed: true,
    cdAmount: next,
  });
  const remark =
    input.remark || policyCdRemark(snapshots.policyNumber, snapshots.policyId);

  if (existing) {
    const unchanged =
      prev.eq(next) && existing.amount.eq(next);
    if (unchanged) {
      await tx.walletTransaction.update({
        where: { id: existing.id },
        data: snapshotUpdateData(snapshots, next, remark),
      });
      const balance = await recalculateWalletBalances(tx, wallet.id);
      return {
        posted: false,
        type: null,
        amount: decimalToString(next),
        txnId: existing.id,
        balanceAfter: decimalToString(balance),
      };
    }

    await tx.walletTransaction.update({
      where: { id: existing.id },
      data: snapshotUpdateData(snapshots, next, remark),
    });
    const balance = await recalculateWalletBalances(tx, wallet.id);
    if (balance.lt(0) && !input.allowNegative) {
      throw new AppError(
        "WALLET_INSUFFICIENT",
        "Amount is greater than wallet balance. Confirm to allow a negative balance.",
        409,
      );
    }
    return {
      posted: true,
      type: "DEBIT",
      amount: decimalToString(next),
      txnId: existing.id,
      balanceAfter: decimalToString(balance),
    };
  }

  const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
    type: "DEBIT",
    source: input.source ?? "POLICY",
    amount: next,
    isCredit: false,
    allowNegative: input.allowNegative,
    userId: input.userId,
    snapshots: {
      ...snapshots,
      cdAmount: next,
      remark,
      particulars: remark,
    },
  });

  return {
    posted: true,
    type: "DEBIT",
    amount: decimalToString(next),
    txnId: txn.id,
    balanceAfter: decimalToString(newBalance),
  };
}

/** Soft-delete: remove the policy CD debit row and recalculate balances. */
export async function reversePolicyWalletOnDelete(
  tx: Prisma.TransactionClient,
  input: {
    policy: PolicyWalletSnapshotSource;
    userId?: string | null;
  },
): Promise<SyncPolicyWalletResult> {
  const wallet = await ensureAndLockWallet(tx);
  const existing = await primaryPolicyCdDebit(tx, input.policy.id);
  if (!existing) {
    return { posted: false, type: null, amount: null, txnId: null, balanceAfter: null };
  }
  const removedAmount = existing.amount;
  await tx.walletTransaction.delete({ where: { id: existing.id } });
  const balance = await recalculateWalletBalances(tx, wallet.id);
  return {
    posted: true,
    type: "CREDIT",
    amount: decimalToString(removedAmount),
    txnId: existing.id,
    balanceAfter: decimalToString(balance),
  };
}

/** Restore archived policy: create or update the single CD debit row. */
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
  const existing = await primaryPolicyCdDebit(tx, input.policy.id);
  const previousEffective = existing?.amount ?? new Prisma.Decimal(0);
  return syncPolicyWallet(tx, {
    policy: input.policy,
    previousEffective,
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
