import type { Prisma, WalletTxnType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getOrCreateWallet, serializeTxn } from "./wallet.service.js";
import {
  formatWalletTxnType,
  normalizeWalletCategory,
  normalizeWalletMonth,
  parseWalletLedgerType,
} from "./wallet-csv-format.js";

export const WALLET_TXN_PAGE_SIZE_MAX = 100;
export const WALLET_TXN_EXPORT_MAX_ROWS = 50_000;

export type WalletTxnListQuery = {
  q?: string;
  category?: string;
  type?: string;
  village?: string;
  group?: string;
  month?: string;
  year?: string;
  policyId?: string;
  page?: number;
  pageSize?: number;
};

export type WalletTxnExportRow = {
  id: string;
  dateOfSubmission: string;
  month: string;
  year: string;
  type: string;
  holderName: string;
  village: string;
  category: string;
  group: string;
  policyType: string;
  cdAccountUsed: string;
  cdAmount: string;
  remark: string;
  amount: string;
  balanceAfter: string;
  policyId: string;
  policyNumber: string;
  createdBy: string;
};

function dash(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return t && t !== "-" ? t : "-";
}

function isoDateOnly(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function parseTypeFilter(raw: string | undefined): WalletTxnType | undefined {
  if (!raw?.trim()) return undefined;
  return parseWalletLedgerType(raw) ?? undefined;
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

  const typeFilter = parseTypeFilter(query.type);
  if (typeFilter) {
    and.push({ type: typeFilter });
  }

  const village = query.village?.trim();
  if (village) {
    and.push({ village });
  }

  const group = query.group?.trim();
  if (group) {
    and.push({ groupName: group });
  }

  const month = normalizeWalletMonth(query.month);
  if (month) {
    and.push({ monthText: month });
  }

  const year = query.year?.trim();
  if (year) {
    and.push({ yearText: year });
  }

  const policyId = query.policyId?.trim();
  if (policyId) {
    and.push({ policyId });
  }

  const q = query.q?.trim();
  if (q) {
    const typeMatch = parseTypeFilter(q);
    const or: Prisma.WalletTransactionWhereInput[] = [
      { particulars: { contains: q } },
      { reference: { contains: q } },
      { category: { contains: q } },
      { holderName: { contains: q } },
      { policyNumber: { contains: q } },
      { remark: { contains: q } },
    ];
    if (typeMatch) {
      or.push({ type: typeMatch });
    }
    const qLower = q.toLowerCase();
    if (qLower.includes("top")) {
      or.push({ type: "TOP_UP" });
    }
    if (qLower.includes("open")) {
      or.push({ type: "OPENING" });
    }
    if (qLower.includes("debit")) {
      or.push({ type: "DEBIT" });
    }
    if (qLower.includes("credit")) {
      or.push({ type: "CREDIT" });
    }
    if (qLower.includes("adjust")) {
      or.push({ type: "ADJUSTMENT" });
    }
    and.push({ OR: or });
  }

  if (and.length) where.AND = and;
  return where;
}

const createdBySelect = {
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

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
      include: createdBySelect,
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
    include: createdBySelect,
  });
  const truncated = rows.length > WALLET_TXN_EXPORT_MAX_ROWS;
  const sliced = truncated ? rows.slice(0, WALLET_TXN_EXPORT_MAX_ROWS) : rows;
  return {
    rows: sliced.map((r): WalletTxnExportRow => ({
      id: r.id,
      dateOfSubmission: isoDateOnly(r.dateOfSubmission ?? r.txnDate),
      month: dash(r.monthText),
      year: dash(r.yearText),
      type: formatWalletTxnType(r.type),
      holderName: dash(r.holderName),
      village: dash(r.village),
      category: dash(r.category),
      group: dash(r.groupName),
      policyType: dash(r.policyTypeName),
      cdAccountUsed: dash(r.cdAccountUsed),
      cdAmount: r.cdAmount != null ? r.cdAmount.toFixed(2) : "-",
      remark: dash(r.remark ?? r.particulars),
      amount: r.amount.toFixed(2),
      balanceAfter: r.balanceAfter.toFixed(2),
      policyId: r.policyId ?? "-",
      policyNumber: dash(r.policyNumber),
      createdBy: dash(r.createdBy?.name ?? r.createdBy?.email ?? r.createdById),
    })),
    truncated,
  };
}
