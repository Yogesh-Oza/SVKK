export const WALLET_CATEGORIES = ["A", "B", "C", "D", "Staff", "SVGA"] as const;

export type WalletCategory = (typeof WALLET_CATEGORIES)[number];

export type WalletMisRow = {
  category: WalletCategory | string;
  count: number;
  amount: string;
};

export type WalletFieldMisRow = {
  key: string;
  count: number;
  amount: string;
};

export type WalletSummary = {
  currentBalance: string;
  lastUpdatedAt: string | null;
  totalTopUp: string;
  totalUsed: string;
  totalRefund: string;
  todayUsage: string;
  thisMonthUsage: string;
  mis: WalletMisRow[];
  misVillage: WalletFieldMisRow[];
  misGroup: WalletFieldMisRow[];
  misPolicyType: WalletFieldMisRow[];
};

export type WalletTxn = {
  id: string;
  date: string;
  type: string;
  category: string | null;
  particulars: string | null;
  reference: string | null;
  amount: string;
  balanceAfter: string;
  source?: string;
  createdAt?: string;
  policyId?: string | null;
  policyNumber?: string | null;
  dateOfSubmission?: string | null;
  month?: string | null;
  year?: string | null;
  holderName?: string | null;
  village?: string | null;
  group?: string | null;
  policyType?: string | null;
  cdAccountUsed?: string | null;
  cdAmount?: string | null;
  remark?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
};

export type WalletTxnPage = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: WalletTxn[];
};

export type WalletCsvImportResult = {
  rowsDeducted: number;
  skippedRows: number;
  invalidCategoryRows: number;
  totalDeducted: string;
  remainingBalance: string;
};

export type WalletMisDimension = "category" | "village" | "group" | "policyType";

export function formatWalletInr(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0.00";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatWalletDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN");
}

export function formatWalletDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    // Already a YYYY-MM-DD or display string
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
    return iso;
  }
  return d.toLocaleDateString("en-IN");
}

export function isWalletDebitType(type: string | null | undefined): boolean {
  const t = (type ?? "").toUpperCase().replace(/-/g, "_");
  return t === "DEBIT" || t === "ADJUSTMENT_DEBIT";
}

export function isWalletCreditType(type: string | null | undefined): boolean {
  const t = (type ?? "").toUpperCase().replace(/-/g, "_");
  return (
    t === "CREDIT" ||
    t === "TOP_UP" ||
    t === "TOPUP" ||
    t === "OPENING" ||
    t === "ADJUSTMENT_CREDIT"
  );
}
