import { Prisma, type WalletTxnType } from "@prisma/client";
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
  categories?: string[];
  type?: string;
  village?: string;
  villages?: string[];
  group?: string;
  groups?: string[];
  month?: string;
  months?: string[];
  year?: string;
  years?: string[];
  policyTypes?: string[];
  areas?: string[];
  sumInsureds?: string[];
  dateFrom?: string;
  dateTo?: string;
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

function parseIsoDateStart(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function parseIsoDateEnd(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

function stringInFilter(values: string[] | undefined): string | { in: string[] } | undefined {
  const cleaned = (values ?? []).map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return undefined;
  if (cleaned.length === 1) return cleaned[0];
  return { in: cleaned };
}

function normalizedCategories(query: WalletTxnListQuery): string[] {
  const raw = [
    ...(query.categories ?? []),
    ...(query.category ? [query.category] : []),
  ];
  return [...new Set(raw.map((c) => normalizeWalletCategory(c)).filter(Boolean))];
}

function normalizedMonths(query: WalletTxnListQuery): string[] {
  const raw = [...(query.months ?? []), ...(query.month ? [query.month] : [])];
  return [...new Set(raw.map((m) => normalizeWalletMonth(m)).filter(Boolean))];
}

function normalizedYears(query: WalletTxnListQuery): string[] {
  const raw = [...(query.years ?? []), ...(query.year ? [query.year] : [])];
  return [...new Set(raw.map((y) => y.trim()).filter(Boolean))];
}

function normalizedStrings(...groups: Array<string[] | undefined>): string[] {
  return [...new Set(groups.flatMap((g) => g ?? []).map((v) => v.trim()).filter(Boolean))];
}

export function buildWalletTxnWhere(
  walletId: string,
  query: WalletTxnListQuery,
): Prisma.WalletTransactionWhereInput {
  const where: Prisma.WalletTransactionWhereInput = { walletId };
  const and: Prisma.WalletTransactionWhereInput[] = [];

  const categories = normalizedCategories(query);
  const categoryFilter = stringInFilter(categories);
  if (categoryFilter) {
    and.push({ category: categoryFilter });
  }

  const typeFilter = parseTypeFilter(query.type);
  if (typeFilter) {
    and.push({ type: typeFilter });
  }

  const villageFilter = stringInFilter(
    normalizedStrings(query.villages, query.village ? [query.village] : undefined),
  );
  if (villageFilter) {
    and.push({ village: villageFilter });
  }

  const groupFilter = stringInFilter(
    normalizedStrings(query.groups, query.group ? [query.group] : undefined),
  );
  if (groupFilter) {
    and.push({ groupName: groupFilter });
  }

  const monthFilter = stringInFilter(normalizedMonths(query));
  if (monthFilter) {
    and.push({ monthText: monthFilter });
  }

  const yearFilter = stringInFilter(normalizedYears(query));
  if (yearFilter) {
    and.push({ yearText: yearFilter });
  }

  const policyTypeFilter = stringInFilter(normalizedStrings(query.policyTypes));
  if (policyTypeFilter) {
    and.push({ policyTypeName: policyTypeFilter });
  }

  if (query.dateFrom?.trim() || query.dateTo?.trim()) {
    const range: Prisma.DateTimeFilter = {};
    if (query.dateFrom?.trim()) range.gte = parseIsoDateStart(query.dateFrom.trim());
    if (query.dateTo?.trim()) range.lte = parseIsoDateEnd(query.dateTo.trim());
    and.push({
      OR: [
        { dateOfSubmission: range },
        { AND: [{ dateOfSubmission: null }, { txnDate: range }] },
      ],
    });
  }

  const policyAnd: Prisma.PolicyWhereInput[] = [];
  const areaFilter = stringInFilter(normalizedStrings(query.areas));
  if (areaFilter) {
    policyAnd.push({ area: areaFilter });
  }
  const sumInsureds = normalizedStrings(query.sumInsureds);
  if (sumInsureds.length > 0) {
    const decimals = sumInsureds
      .map((s) => {
        try {
          return new Prisma.Decimal(s);
        } catch {
          return null;
        }
      })
      .filter((d): d is Prisma.Decimal => d != null && d.isFinite());
    if (decimals.length === 1) {
      policyAnd.push({ years: { some: { deletedAt: null, sumInsured: decimals[0] } } });
    } else if (decimals.length > 1) {
      policyAnd.push({ years: { some: { deletedAt: null, sumInsured: { in: decimals } } } });
    }
  }
  if (policyAnd.length === 1) {
    and.push({ policy: policyAnd[0]! });
  } else if (policyAnd.length > 1) {
    and.push({ policy: { AND: policyAnd } });
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
