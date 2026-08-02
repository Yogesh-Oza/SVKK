import { Prisma, type WalletTxnType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import {
  emptyCategoryMis,
  formatWalletTxnType,
  normalizeWalletCategory,
  WALLET_ALLOWED_CATEGORIES,
  type WalletCategory,
} from "./wallet-csv-format.js";

export const WALLET_SINGLETON_KEY = "default";

export type WalletLocked = {
  id: string;
  currentBalance: Prisma.Decimal;
  lastUpdatedAt: Date | null;
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

export async function buildWalletSummary(walletId: string, currentBalance: Prisma.Decimal, lastUpdatedAt: Date | null) {
  const [topUpAgg, usedAgg, debitByCategory] = await Promise.all([
    prisma.walletTransaction.aggregate({
      where: { walletId, type: { in: ["OPENING", "TOP_UP"] } },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { walletId, type: "DEBIT" },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ["category"],
      where: { walletId, type: "DEBIT", category: { in: [...WALLET_ALLOWED_CATEGORIES] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const mis = emptyCategoryMis();
  for (const row of debitByCategory) {
    const cat = normalizeWalletCategory(row.category ?? "");
    if (!cat) continue;
    mis[cat] = {
      count: row._count._all,
      amount: decimalToString(row._sum.amount ?? new Prisma.Decimal(0)),
    };
  }

  const misList = WALLET_ALLOWED_CATEGORIES.map((category) => ({
    category,
    count: mis[category].count,
    amount: mis[category].amount,
  }));

  return {
    currentBalance: decimalToString(currentBalance),
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    totalTopUp: decimalToString(topUpAgg._sum.amount ?? new Prisma.Decimal(0)),
    totalUsed: decimalToString(usedAgg._sum.amount ?? new Prisma.Decimal(0)),
    mis: misList,
  };
}

export async function getWalletSummary() {
  const wallet = await getOrCreateWallet();
  return buildWalletSummary(wallet.id, wallet.currentBalance, wallet.lastUpdatedAt);
}

function parsePositiveAmount(raw: unknown): Prisma.Decimal {
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

export async function setOpeningBalance(amountRaw: unknown, userId: string | undefined) {
  const amount = parseNonNegativeAmount(amountRaw);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    await tx.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { currentBalance: amount, lastUpdatedAt: now },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        txnDate: now,
        type: "OPENING",
        category: null,
        particulars: "Opening Wallet Balance",
        reference: null,
        amount,
        balanceAfter: amount,
        source: "OPENING",
        createdById: userId ?? null,
      },
    });
    return {
      currentBalance: decimalToString(amount),
      transaction: serializeTxn(txn),
    };
  });
}

export async function topUpWallet(amountRaw: unknown, remark: string | undefined, userId: string | undefined) {
  const amount = parsePositiveAmount(amountRaw);
  const particulars = (remark?.trim() || "Manual Wallet Top-Up").slice(0, 500);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    const newBalance = wallet.currentBalance.plus(amount);
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { currentBalance: newBalance, lastUpdatedAt: now },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        txnDate: now,
        type: "TOP_UP",
        category: null,
        particulars,
        reference: null,
        amount,
        balanceAfter: newBalance,
        source: "TOPUP",
        createdById: userId ?? null,
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
}) {
  const category = normalizeWalletCategory(input.category);
  if (!category) {
    throw new AppError("VALIDATION_ERROR", "Please select a valid category.", 400);
  }
  const amount = parsePositiveAmount(input.amount);
  const particulars = (input.particulars?.trim() || "Manual Usage Deduction").slice(0, 500);
  const reference = (input.reference?.trim() || "").slice(0, 255) || null;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    if (amount.gt(wallet.currentBalance) && !input.allowNegative) {
      throw new AppError(
        "WALLET_INSUFFICIENT",
        "Amount is greater than wallet balance. Confirm to allow a negative balance.",
        409,
      );
    }
    const newBalance = wallet.currentBalance.minus(amount);
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { currentBalance: newBalance, lastUpdatedAt: now },
    });
    const txn = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        txnDate: now,
        type: "DEBIT",
        category,
        particulars,
        reference,
        amount,
        balanceAfter: newBalance,
        source: "MANUAL",
        createdById: input.userId ?? null,
      },
    });
    return {
      currentBalance: decimalToString(newBalance),
      transaction: serializeTxn(txn),
    };
  });
}

export async function clearWallet(confirm: boolean, userId: string | undefined) {
  if (!confirm) {
    throw new AppError("VALIDATION_ERROR", "Clear requires confirm: true.", 400);
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const wallet = await ensureAndLockWallet(tx);
    await tx.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { currentBalance: new Prisma.Decimal(0), lastUpdatedAt: now },
    });
    return {
      currentBalance: "0.00",
      lastUpdatedAt: now.toISOString(),
      clearedBy: userId ?? null,
    };
  });
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
  };
}

export type { WalletCategory };
