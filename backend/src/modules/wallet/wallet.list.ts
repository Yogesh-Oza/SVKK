import type { Prisma, WalletTxnType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getOrCreateWallet, serializeTxn } from "./wallet.service.js";
import { formatWalletTxnType, normalizeWalletCategory } from "./wallet-csv-format.js";

export const WALLET_TXN_PAGE_SIZE_MAX = 100;
export const WALLET_TXN_EXPORT_MAX_ROWS = 50_000;

export type WalletTxnListQuery = {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
};

function parseTypeFilter(q: string): WalletTxnType | undefined {
  const t = q.trim().toUpperCase().replace(/-/g, "_");
  if (t === "OPENING") return "OPENING";
  if (t === "TOP_UP" || t === "TOPUP") return "TOP_UP";
  if (t === "DEBIT") return "DEBIT";
  return undefined;
}

export function buildWalletTxnWhere(
  walletId: string,
  query: WalletTxnListQuery,
): Prisma.WalletTransactionWhereInput {
  const where: Prisma.WalletTransactionWhereInput = { walletId };
  const and: Prisma.WalletTransactionWhereInput[] = [];

  if (query.category) {
    const cat = normalizeWalletCategory(query.category);
    if (cat) {
      and.push({ category: cat });
    }
  }

  const q = query.q?.trim();
  if (q) {
    const typeMatch = parseTypeFilter(q);
    const or: Prisma.WalletTransactionWhereInput[] = [
      { particulars: { contains: q } },
      { reference: { contains: q } },
      { category: { contains: q } },
    ];
    if (typeMatch) {
      or.push({ type: typeMatch });
    }
    // Also match display form TOP-UP when searching "top"
    if (q.toLowerCase().includes("top")) {
      or.push({ type: "TOP_UP" });
    }
    if (q.toLowerCase().includes("open")) {
      or.push({ type: "OPENING" });
    }
    if (q.toLowerCase().includes("debit")) {
      or.push({ type: "DEBIT" });
    }
    and.push({ OR: or });
  }

  if (and.length) where.AND = and;
  return where;
}

export async function queryWalletTransactionsPaged(query: WalletTxnListQuery) {
  const wallet = await getOrCreateWallet();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(WALLET_TXN_PAGE_SIZE_MAX, Math.max(1, query.pageSize ?? 20));
  const where = buildWalletTxnWhere(wallet.id, query);

  const [total, rows] = await Promise.all([
    prisma.walletTransaction.count({ where }),
    prisma.walletTransaction.findMany({
      where,
      orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map(serializeTxn),
  };
}

export async function queryWalletTransactionsForExport(query: WalletTxnListQuery) {
  const wallet = await getOrCreateWallet();
  const where = buildWalletTxnWhere(wallet.id, query);
  const rows = await prisma.walletTransaction.findMany({
    where,
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    take: WALLET_TXN_EXPORT_MAX_ROWS + 1,
  });
  const truncated = rows.length > WALLET_TXN_EXPORT_MAX_ROWS;
  return {
    rows: (truncated ? rows.slice(0, WALLET_TXN_EXPORT_MAX_ROWS) : rows).map((r) => ({
      date: r.txnDate.toISOString(),
      type: formatWalletTxnType(r.type),
      category: r.category ?? "-",
      particulars: r.particulars ?? "-",
      reference: r.reference ?? "-",
      amount: r.amount.toFixed(2),
      balanceAfter: r.balanceAfter.toFixed(2),
    })),
    truncated,
  };
}
