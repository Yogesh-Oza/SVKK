export const WALLET_CATEGORIES = ["A", "B", "C", "D", "Staff", "SVGA"] as const;

export type WalletCategory = (typeof WALLET_CATEGORIES)[number];

export type WalletMisRow = {
  category: WalletCategory | string;
  count: number;
  amount: string;
};

export type WalletSummary = {
  currentBalance: string;
  lastUpdatedAt: string | null;
  totalTopUp: string;
  totalUsed: string;
  mis: WalletMisRow[];
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
