import { Prisma, type WalletTxnSource, type WalletTxnType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import {
  emptyCategoryMis,
  formatWalletTxnType,
  isWalletCreditLedgerType,
  normalizeWalletCategory,
  normalizeWalletMonth,
  parseWalletAmount,
  parseWalletCsvDate,
  parseWalletLedgerType,
  WALLET_MONTH_NAMES,
  type WalletCategory,
} from "./wallet-csv-format.js";

export const WALLET_SINGLETON_KEY = "default";
export const WALLET_RESTORE_MAX_ROWS = 50_000;

export type WalletLocked = {
  id: string;
  currentBalance: Prisma.Decimal;
  lastUpdatedAt: Date | null;
};

export type WalletTxnSnapshots = {
  policyId?: string | null;
  policyNumber?: string | null;
  dateOfSubmission?: Date | null;
  monthText?: string | null;
  yearText?: string | null;
  holderName?: string | null;
  village?: string | null;
  category?: string | null;
  groupName?: string | null;
  policyTypeName?: string | null;
  cdAccountUsed?: string | null;
  cdAmount?: Prisma.Decimal | number | string | null;
  remark?: string | null;
  particulars?: string | null;
  reference?: string | null;
  txnDate?: Date;
};

export type AppendWalletTxnInput = {
  type: WalletTxnType;
  source: WalletTxnSource;
  /** Absolute amount (always positive). */
  amount: Prisma.Decimal;
  /** true = credit (add); false = debit (subtract). */
  isCredit: boolean;
  allowNegative?: boolean;
  userId?: string | null;
  snapshots?: WalletTxnSnapshots;
};

/**
 * Ensure the org singleton wallet exists (upsert on unique singletonKey),
 * then lock the row with SELECT … FOR UPDATE inside the caller’s transaction.
 */
export async function ensureAndLockWallet(tx: Prisma.TransactionClient): Promise<WalletLocked> {
  await tx.wallet.upsert({
    where: { singletonKey: WALLET_SINGLETON_KEY },
    create: {
      singletonKey: WALLET_SINGLETON_KEY,
      currentBalance: new Prisma.Decimal(0),
    },
    update: {},
  });

  await tx.$executeRaw`
    SELECT id FROM wallet WHERE singletonKey = ${WALLET_SINGLETON_KEY} FOR UPDATE
  `;

  const wallet = await tx.wallet.findUniqueOrThrow({
    where: { singletonKey: WALLET_SINGLETON_KEY },
    select: { id: true, currentBalance: true, lastUpdatedAt: true },
  });

  return wallet;
}

export async function getOrCreateWallet() {
  return prisma.wallet.upsert({
    where: { singletonKey: WALLET_SINGLETON_KEY },
    create: {
      singletonKey: WALLET_SINGLETON_KEY,
      currentBalance: new Prisma.Decimal(0),
    },
    update: {},
  });
}

export function decimalToString(d: Prisma.Decimal): string {
  return d.toFixed(2);
}

export function monthYearFromDate(d: Date | null | undefined): { monthText: string | null; yearText: string | null } {
  if (!d || Number.isNaN(d.getTime())) return { monthText: null, yearText: null };
  return {
    monthText: WALLET_MONTH_NAMES[d.getUTCMonth()] ?? null,
    yearText: String(d.getUTCFullYear()),
  };
}

function toOptionalDecimal(raw: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal | null {
  if (raw == null || raw === "") return null;
  try {
    const d = raw instanceof Prisma.Decimal ? raw : new Prisma.Decimal(String(raw));
    if (!d.isFinite()) return null;
    return d;
  } catch {
    return null;
  }
}

function sliceOrNull(raw: string | null | undefined, max: number): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * Append one immutable wallet transaction and update currentBalance.
 * Must be called inside an existing interactive transaction after ensureAndLockWallet.
 */
export async function appendWalletTxn(
  tx: Prisma.TransactionClient,
  wallet: WalletLocked,
  input: AppendWalletTxnInput,
) {
  const amount = input.amount;
  if (!amount.isFinite() || amount.lte(0)) {
    throw new AppError("VALIDATION_ERROR", "Amount must be greater than zero.", 400);
  }

  if (!input.isCredit && amount.gt(wallet.currentBalance) && !input.allowNegative) {
    throw new AppError(
      "WALLET_INSUFFICIENT",
      "Amount is greater than wallet balance. Confirm to allow a negative balance.",
      409,
    );
  }

  const newBalance = input.isCredit
    ? wallet.currentBalance.plus(amount)
    : wallet.currentBalance.minus(amount);
  const now = new Date();
  const snap = input.snapshots ?? {};
  const dateOfSubmission = snap.dateOfSubmission ?? null;
  const derived = monthYearFromDate(dateOfSubmission);
  const remark =
    sliceOrNull(snap.remark, 500) ??
    sliceOrNull(snap.particulars, 500);
  const particulars = sliceOrNull(snap.particulars, 500) ?? remark;

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { currentBalance: newBalance, lastUpdatedAt: now },
  });

  const txn = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      txnDate: snap.txnDate ?? now,
      type: input.type,
      category: sliceOrNull(snap.category, 32),
      particulars,
      reference: sliceOrNull(snap.reference, 255),
      amount,
      balanceAfter: newBalance,
      source: input.source,
      policyId: snap.policyId ?? null,
      policyNumber: sliceOrNull(snap.policyNumber, 120),
      dateOfSubmission,
      monthText: sliceOrNull(snap.monthText ?? derived.monthText, 20),
      yearText: sliceOrNull(snap.yearText ?? derived.yearText, 8),
      holderName: sliceOrNull(snap.holderName, 200),
      village: sliceOrNull(snap.village, 200),
      groupName: sliceOrNull(snap.groupName, 64),
      policyTypeName: sliceOrNull(snap.policyTypeName, 120),
      cdAccountUsed: sliceOrNull(snap.cdAccountUsed, 16),
      cdAmount: toOptionalDecimal(snap.cdAmount),
      remark,
      createdById: input.userId ?? null,
    },
  });

  return { txn, newBalance, walletId: wallet.id };
}

export async function buildWalletSummary(
  walletId: string,
  currentBalance: Prisma.Decimal,
  lastUpdatedAt: Date | null,
) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const [
    topUpAgg,
    usedAgg,
    refundAgg,
    todayAgg,
    monthAgg,
    debitByCategory,
    debitByVillage,
    debitByGroup,
    debitByPolicyType,
  ] = await Promise.all([
    prisma.walletTransaction.aggregate({
      where: { walletId, type: { in: ["OPENING", "TOP_UP"] } },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { walletId, type: "DEBIT" },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { walletId, type: "CREDIT" },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        walletId,
        type: "DEBIT",
        OR: [
          { dateOfSubmission: { gte: startOfToday } },
          { dateOfSubmission: null, txnDate: { gte: startOfToday } },
        ],
      },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        walletId,
        type: "DEBIT",
        OR: [
          { dateOfSubmission: { gte: startOfMonth } },
          { dateOfSubmission: null, txnDate: { gte: startOfMonth } },
        ],
      },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ["category"],
      where: { walletId, type: "DEBIT" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ["village"],
      where: { walletId, type: "DEBIT" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ["groupName"],
      where: { walletId, type: "DEBIT" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ["policyTypeName"],
      where: { walletId, type: "DEBIT" },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const misList = debitByCategory
    .map((row) => {
      const category = normalizeWalletCategory(row.category ?? "") || "Unspecified";
      return {
        category,
        count: row._count._all,
        amount: decimalToString(row._sum.amount ?? new Prisma.Decimal(0)),
      };
    })
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  const mapFieldMis = (
    rows: Array<{
      _count: { _all: number };
      _sum: { amount: Prisma.Decimal | null };
      [k: string]: unknown;
    }>,
    key: string,
  ) =>
    rows
      .map((row) => {
        const label = String((row as Record<string, unknown>)[key] ?? "").trim() || "Unspecified";
        return {
          key: label,
          count: row._count._all,
          amount: decimalToString(row._sum.amount ?? new Prisma.Decimal(0)),
        };
      })
      .sort((a, b) => Number(b.amount) - Number(a.amount));

  return {
    currentBalance: decimalToString(currentBalance),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    totalTopUp: decimalToString(topUpAgg._sum.amount ?? new Prisma.Decimal(0)),
    totalUsed: decimalToString(usedAgg._sum.amount ?? new Prisma.Decimal(0)),
    totalRefund: decimalToString(refundAgg._sum.amount ?? new Prisma.Decimal(0)),
    todayUsage: decimalToString(todayAgg._sum.amount ?? new Prisma.Decimal(0)),
    thisMonthUsage: decimalToString(monthAgg._sum.amount ?? new Prisma.Decimal(0)),
    mis: misList,
    misVillage: mapFieldMis(debitByVillage as never, "village"),
    misGroup: mapFieldMis(debitByGroup as never, "groupName"),
    misPolicyType: mapFieldMis(debitByPolicyType as never, "policyTypeName"),
  };
}

export async function getWalletSummary() {
  const wallet = await getOrCreateWallet();
  return buildWalletSummary(wallet.id, wallet.currentBalance, wallet.lastUpdatedAt);
}

export function parsePositiveAmount(raw: unknown): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(String(raw ?? "").trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid amount.", 400);
  }
  if (!d.isFinite() || d.lte(0)) {
    throw new AppError("VALIDATION_ERROR", "Amount must be greater than zero.", 400);
  }
  return d;
}

function parseNonNegativeAmount(raw: unknown): Prisma.Decimal {
  let d: Prisma.Decimal;
  try {
    d = new Prisma.Decimal(String(raw ?? "").trim());
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid amount.", 400);
  }
  if (!d.isFinite() || d.lt(0)) {
    throw new AppError("VALIDATION_ERROR", "Please enter a valid opening balance.", 400);
  }
  if (d.eq(0)) {
    throw new AppError("VALIDATION_ERROR", "Please enter a valid opening balance.", 400);
  }
  return d;
}

export async function setOpeningBalance(
  amountRaw: unknown,
  userId: string | undefined,
  dateOfSubmission?: Date | null,
) {
  const amount = parseNonNegativeAmount(amountRaw);
  const txnDate = dateOfSubmission ?? new Date();

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    const existingCount = await tx.walletTransaction.count({ where: { walletId: wallet.id } });
    if (existingCount > 0) {
      throw new AppError(
        "WALLET_OPENING_EXISTS",
        "Opening balance can only be set when the wallet has no transactions. Use Top-up or Manual Adjustment instead.",
        409,
      );
    }

    // Opening sets absolute balance (from 0).
    wallet.currentBalance = new Prisma.Decimal(0);
    const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
      type: "OPENING",
      source: "OPENING",
      amount,
      isCredit: true,
      userId,
      snapshots: {
        dateOfSubmission: txnDate,
        txnDate,
        remark: "Opening Wallet Balance",
        particulars: "Opening Wallet Balance",
      },
    });

    return {
      currentBalance: decimalToString(newBalance),
      transaction: serializeTxn(txn),
    };
  });
}

export async function topUpWallet(
  amountRaw: unknown,
  remark: string | undefined,
  userId: string | undefined,
  dateOfSubmission?: Date | null,
) {
  const amount = parsePositiveAmount(amountRaw);
  const text = (remark?.trim() || "Manual Wallet Top-Up").slice(0, 500);
  const txnDate = dateOfSubmission ?? new Date();

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
      type: "TOP_UP",
      source: "TOPUP",
      amount,
      isCredit: true,
      userId,
      snapshots: {
        dateOfSubmission: txnDate,
        txnDate,
        remark: text,
        particulars: text,
      },
    });
    return {
      currentBalance: decimalToString(newBalance),
      transaction: serializeTxn(txn),
    };
  });
}

export async function manualDebit(input: {
  category: string;
  amount: unknown;
  particulars?: string;
  reference?: string;
  allowNegative?: boolean;
  userId?: string;
  dateOfSubmission?: Date | null;
  monthText?: string | null;
  yearText?: string | null;
  holderName?: string | null;
  village?: string | null;
  groupName?: string | null;
  policyTypeName?: string | null;
  cdAccountUsed?: string | null;
  cdAmount?: unknown;
}) {
  const category = normalizeWalletCategory(input.category);
  if (!category) {
    throw new AppError("VALIDATION_ERROR", "Please select a valid category.", 400);
  }
  const amount = parsePositiveAmount(input.amount);
  const remark = (input.particulars?.trim() || "Manual Usage Deduction").slice(0, 500);

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
      type: "DEBIT",
      source: "MANUAL",
      amount,
      isCredit: false,
      allowNegative: input.allowNegative,
      userId: input.userId,
      snapshots: {
        category,
        remark,
        particulars: remark,
        reference: input.reference,
        dateOfSubmission: input.dateOfSubmission ?? null,
        monthText: input.monthText,
        yearText: input.yearText,
        holderName: input.holderName,
        village: input.village,
        groupName: input.groupName,
        policyTypeName: input.policyTypeName,
        cdAccountUsed: input.cdAccountUsed,
        cdAmount: input.cdAmount != null ? String(input.cdAmount) : null,
      },
    });
    return {
      currentBalance: decimalToString(newBalance),
      transaction: serializeTxn(txn),
    };
  });
}

export async function creditWallet(input: {
  amount: unknown;
  remark?: string;
  category?: string | null;
  source?: WalletTxnSource;
  allowNegative?: boolean;
  userId?: string;
  snapshots?: WalletTxnSnapshots;
}) {
  const amount = parsePositiveAmount(input.amount);
  const remark = (input.remark?.trim() || "Wallet credit").slice(0, 500);
  const category = input.category ? normalizeWalletCategory(input.category) || null : null;

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
      type: "CREDIT",
      source: input.source ?? "MANUAL",
      amount,
      isCredit: true,
      userId: input.userId,
      snapshots: {
        ...(input.snapshots ?? {}),
        category: category ?? input.snapshots?.category,
        remark: input.snapshots?.remark ?? remark,
        particulars: input.snapshots?.particulars ?? remark,
      },
    });
    return {
      currentBalance: decimalToString(newBalance),
      transaction: serializeTxn(txn),
    };
  });
}

export async function adjustWallet(input: {
  amount: unknown;
  direction: "CREDIT" | "DEBIT";
  remark?: string;
  category?: string | null;
  allowNegative?: boolean;
  userId?: string;
  snapshots?: WalletTxnSnapshots;
}) {
  const amount = parsePositiveAmount(input.amount);
  const isCredit = input.direction === "CREDIT";
  const remark = (input.remark?.trim() || "Manual Adjustment").slice(0, 500);
  const category = input.category ? normalizeWalletCategory(input.category) || null : null;

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    const { txn, newBalance } = await appendWalletTxn(tx, wallet, {
      type: "ADJUSTMENT",
      source: "MANUAL",
      amount,
      isCredit,
      allowNegative: input.allowNegative,
      userId: input.userId,
      snapshots: {
        ...(input.snapshots ?? {}),
        category: category ?? input.snapshots?.category,
        remark: input.snapshots?.remark ?? remark,
        particulars: input.snapshots?.particulars ?? remark,
      },
    });
    return {
      currentBalance: decimalToString(newBalance),
      transaction: serializeTxn(txn),
    };
  });
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function pickBackupStr(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    const t = String(v).trim();
    if (!t || t === "-") continue;
    return t;
  }
  return null;
}

type PreparedRestoreRow = {
  sortDate: Date;
  type: WalletTxnType;
  isCredit: boolean;
  amount: Prisma.Decimal;
  snapshots: WalletTxnSnapshots;
};

function parseRestoreTxn(raw: unknown, index: number): PreparedRestoreRow {
  const obj = asRecord(raw);
  if (!obj) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Backup transaction at index ${index} is invalid.`,
      400,
    );
  }

  const type = parseWalletLedgerType(pickBackupStr(obj, "type"));
  if (!type) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Backup transaction at index ${index} has an unknown type.`,
      400,
    );
  }

  const amountRaw = pickBackupStr(obj, "amount") ?? String(obj.amount ?? "");
  const amount = parseWalletAmount(amountRaw);
  if (!amount || amount.lte(0)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Backup transaction at index ${index} has an invalid amount.`,
      400,
    );
  }

  const dateRaw =
    pickBackupStr(obj, "dateOfSubmission", "date") ?? "";
  const parsedDate = parseWalletCsvDate(dateRaw);
  const txnDate =
    parsedDate instanceof Date
      ? parsedDate
      : obj.date instanceof Date
        ? obj.date
        : new Date();
  if (Number.isNaN(txnDate.getTime())) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Backup transaction at index ${index} has an invalid date.`,
      400,
    );
  }

  const dateOfSubmissionRaw = pickBackupStr(obj, "dateOfSubmission");
  const dateOfSubmissionParsed = dateOfSubmissionRaw
    ? parseWalletCsvDate(dateOfSubmissionRaw)
    : null;
  const dateOfSubmission =
    dateOfSubmissionParsed instanceof Date ? dateOfSubmissionParsed : txnDate;

  const derived = monthYearFromDate(dateOfSubmission);
  const remark =
    pickBackupStr(obj, "remark", "particulars") ?? "Restored wallet entry";
  const cdAmountRaw = pickBackupStr(obj, "cdAmount");

  return {
    sortDate: txnDate,
    type,
    isCredit: isWalletCreditLedgerType(type, pickBackupStr(obj, "direction")),
    amount,
    snapshots: {
      txnDate,
      dateOfSubmission,
      monthText: normalizeWalletMonth(pickBackupStr(obj, "month", "monthText")) || derived.monthText,
      yearText: pickBackupStr(obj, "year", "yearText") ?? derived.yearText,
      holderName: pickBackupStr(obj, "holderName"),
      village: pickBackupStr(obj, "village"),
      category: pickBackupStr(obj, "category"),
      groupName: pickBackupStr(obj, "group", "groupName"),
      policyTypeName: pickBackupStr(obj, "policyType", "policyTypeName"),
      cdAccountUsed: pickBackupStr(obj, "cdAccountUsed", "cdAccount"),
      cdAmount: cdAmountRaw,
      remark,
      particulars: pickBackupStr(obj, "particulars", "remark") ?? remark,
      reference: pickBackupStr(obj, "reference"),
      policyId: pickBackupStr(obj, "policyId"),
      policyNumber: pickBackupStr(obj, "policyNumber"),
    },
  };
}

/**
 * Clear the ledger then replay backup rows with appendWalletTxn (new IDs, recomputed balances).
 * Source is RESTORE. Invalid backup is rejected before any mutation.
 */
export async function restoreWalletFromBackup(
  confirm: boolean,
  backup: unknown,
  userId: string | undefined,
) {
  if (!confirm) {
    throw new AppError("VALIDATION_ERROR", "Restore requires confirm: true.", 400);
  }
  const payload = asRecord(backup);
  if (!payload) {
    throw new AppError("VALIDATION_ERROR", "Backup object is required.", 400);
  }
  const rawTxns = payload.wallet_transactions;
  if (!Array.isArray(rawTxns)) {
    throw new AppError("VALIDATION_ERROR", "Backup wallet_transactions must be an array.", 400);
  }
  if (rawTxns.length > WALLET_RESTORE_MAX_ROWS) {
    throw new AppError(
      "TOO_MANY_ROWS",
      `Backup exceeds maximum of ${WALLET_RESTORE_MAX_ROWS} transactions.`,
      400,
    );
  }

  const prepared = rawTxns.map((row, i) => parseRestoreTxn(row, i));
  prepared.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

  return prisma.$transaction(
    async (tx) => {
      const wallet = await ensureAndLockWallet(tx);
      await tx.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
      wallet.currentBalance = new Prisma.Decimal(0);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { currentBalance: wallet.currentBalance, lastUpdatedAt: new Date() },
      });

      const policyIds = [
        ...new Set(
          prepared
            .map((row) => row.snapshots.policyId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const existingPolicyIds =
        policyIds.length === 0
          ? new Set<string>()
          : new Set(
              (
                await tx.policy.findMany({
                  where: { id: { in: policyIds } },
                  select: { id: true },
                })
              ).map((p) => p.id),
            );

      let restoredCount = 0;
      let newBalance = wallet.currentBalance;
      for (const row of prepared) {
        const policyId = row.snapshots.policyId;
        const { txn, newBalance: next } = await appendWalletTxn(tx, wallet, {
          type: row.type,
          source: "RESTORE",
          amount: row.amount,
          isCredit: row.isCredit,
          allowNegative: true,
          userId,
          snapshots: {
            ...row.snapshots,
            policyId: policyId && existingPolicyIds.has(policyId) ? policyId : null,
          },
        });
        wallet.currentBalance = next;
        newBalance = next;
        restoredCount += 1;
        void txn;
      }

      return {
        currentBalance: decimalToString(newBalance),
        restoredCount,
        lastUpdatedAt: new Date().toISOString(),
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

function isCreditLedgerTxn(
  txn: { id: string; type: WalletTxnType; balanceAfter: Prisma.Decimal },
  adjustmentDirections: Map<string, boolean>,
): boolean {
  if (txn.type === "DEBIT") return false;
  if (txn.type === "OPENING" || txn.type === "TOP_UP" || txn.type === "CREDIT") return true;
  if (txn.type === "ADJUSTMENT") {
    const dir = adjustmentDirections.get(txn.id);
    if (dir !== undefined) return dir;
    return true;
  }
  return true;
}

/**
 * Recompute balanceAfter for every row (chronological) and sync wallet.currentBalance.
 * Call after in-place edits to policy CD debits or other amount changes.
 */
export async function recalculateWalletBalances(
  tx: Prisma.TransactionClient,
  walletId: string,
): Promise<Prisma.Decimal> {
  const txns = await tx.walletTransaction.findMany({
    where: { walletId },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
  });

  const adjustmentDirections = new Map<string, boolean>();
  let walk = new Prisma.Decimal(0);
  for (const t of txns) {
    if (t.type === "ADJUSTMENT") {
      adjustmentDirections.set(t.id, t.balanceAfter.gt(walk));
    }
    walk = t.balanceAfter;
  }

  let balance = new Prisma.Decimal(0);
  const now = new Date();
  for (const t of txns) {
    const isCredit = isCreditLedgerTxn(t, adjustmentDirections);
    balance = isCredit ? balance.plus(t.amount) : balance.minus(t.amount);
    if (!t.balanceAfter.equals(balance)) {
      await tx.walletTransaction.update({
        where: { id: t.id },
        data: { balanceAfter: balance },
      });
    }
  }

  await tx.wallet.update({
    where: { id: walletId },
    data: { currentBalance: balance, lastUpdatedAt: now },
  });

  return balance;
}

export function serializeTxn(txn: {
  id: string;
  txnDate: Date;
  type: WalletTxnType;
  category: string | null;
  particulars: string | null;
  reference: string | null;
  amount: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  source: string;
  createdAt: Date;
  policyId?: string | null;
  policyNumber?: string | null;
  dateOfSubmission?: Date | null;
  monthText?: string | null;
  yearText?: string | null;
  holderName?: string | null;
  village?: string | null;
  groupName?: string | null;
  policyTypeName?: string | null;
  cdAccountUsed?: string | null;
  cdAmount?: Prisma.Decimal | null;
  remark?: string | null;
  createdById?: string | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
}) {
  return {
    id: txn.id,
    date: txn.txnDate.toISOString(),
    type: formatWalletTxnType(txn.type),
    category: txn.category,
    particulars: txn.particulars,
    reference: txn.reference,
    amount: decimalToString(txn.amount),
    balanceAfter: decimalToString(txn.balanceAfter),
    source: txn.source,
    createdAt: txn.createdAt.toISOString(),
    policyId: txn.policyId ?? null,
    policyNumber: txn.policyNumber ?? null,
    dateOfSubmission: txn.dateOfSubmission?.toISOString() ?? null,
    month: txn.monthText ?? null,
    year: txn.yearText ?? null,
    holderName: txn.holderName ?? null,
    village: txn.village ?? null,
    group: txn.groupName ?? null,
    policyType: txn.policyTypeName ?? null,
    cdAccountUsed: txn.cdAccountUsed ?? null,
    cdAmount: txn.cdAmount != null ? decimalToString(txn.cdAmount) : null,
    remark: txn.remark ?? txn.particulars ?? null,
    createdById: txn.createdById ?? null,
    createdByName: txn.createdBy?.name ?? null,
  };
}

export type { WalletCategory };
