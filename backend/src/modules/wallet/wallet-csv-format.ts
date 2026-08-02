import { Prisma } from "@prisma/client";
import { csvCell } from "../policy/policy-csv-utils.js";
import { parseCsvDate } from "../policy/policy-csv-utils.js";

export const WALLET_USAGE_CSV_HEADERS = [
  "Date",
  "Category",
  "Particulars",
  "Amount",
  "Reference",
] as const;

export type WalletUsageCsvHeader = (typeof WALLET_USAGE_CSV_HEADERS)[number];

export const WALLET_ALLOWED_CATEGORIES = ["A", "B", "C", "D", "Staff", "SVGA"] as const;

export type WalletCategory = (typeof WALLET_ALLOWED_CATEGORIES)[number];

export const WALLET_CSV_MAX_ROWS = 5_000;

/** Accepted CSV date formats (same as policy CSV): YYYY-MM-DD or DD-MM-YYYY. */
export const WALLET_CSV_DATE_HINT = "YYYY-MM-DD or DD-MM-YYYY";

export const WALLET_SAMPLE_ROWS: ReadonlyArray<{
  date: string;
  category: WalletCategory;
  particulars: string;
  amount: string;
  reference: string;
}> = [
  { date: "2026-06-16", category: "A", particulars: "Printing Charge", amount: "250", reference: "BILL-001" },
  { date: "2026-06-16", category: "B", particulars: "Delivery Charge", amount: "100", reference: "BILL-002" },
  { date: "2026-06-16", category: "C", particulars: "Stationery", amount: "75", reference: "BILL-003" },
  { date: "2026-06-16", category: "D", particulars: "Office Expense", amount: "50", reference: "BILL-004" },
  { date: "2026-06-16", category: "Staff", particulars: "Staff Tea Expense", amount: "120", reference: "BILL-005" },
  { date: "2026-06-16", category: "SVGA", particulars: "SVGA Expense", amount: "500", reference: "BILL-006" },
];

export function normalizeWalletCategory(raw: string | null | undefined): WalletCategory | "" {
  const c = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (c === "a") return "A";
  if (c === "b") return "B";
  if (c === "c") return "C";
  if (c === "d") return "D";
  if (c === "staff") return "Staff";
  if (c === "svga") return "SVGA";
  return "";
}

/**
 * Strip currency symbols / grouping, then parse as Decimal.
 * Returns null when empty or not a valid positive-or-any finite number string.
 */
export function parseWalletAmount(raw: string | null | undefined): Prisma.Decimal | null {
  const cleaned = String(raw ?? "")
    .replace(/[₹,\s]/g, "")
    .trim();
  if (!cleaned) return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  try {
    const d = new Prisma.Decimal(cleaned);
    if (!d.isFinite()) return null;
    return d;
  } catch {
    return null;
  }
}

/** Parse CSV date; empty → null (caller uses now). Invalid non-empty → "invalid". */
export function parseWalletCsvDate(raw: string | null | undefined): Date | null | "invalid" {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  try {
    const d = parseCsvDate(t);
    if (!d) return "invalid";
    return d;
  } catch {
    return "invalid";
  }
}

/** Map header cell to canonical field; accepts legacy typo `catagory`. */
export function resolveWalletCsvHeader(header: string): WalletUsageCsvHeader | null {
  const h = header.trim().toLowerCase();
  if (h === "date") return "Date";
  if (h === "category" || h === "catagory") return "Category";
  if (h === "particulars") return "Particulars";
  if (h === "amount") return "Amount";
  if (h === "reference") return "Reference";
  return null;
}

export function buildWalletSampleCsv(): string {
  const header = WALLET_USAGE_CSV_HEADERS.map(csvCell).join(",");
  const lines = [header];
  for (const row of WALLET_SAMPLE_ROWS) {
    lines.push(
      [row.date, row.category, row.particulars, row.amount, row.reference].map(csvCell).join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function walletSampleFilename(): string {
  return "sample_wallet_usage_with_category.csv";
}

/** Serialize Prisma txn type for API/CSV/UI. */
export function formatWalletTxnType(type: "OPENING" | "TOP_UP" | "DEBIT"): string {
  return type === "TOP_UP" ? "TOP-UP" : type;
}

export function emptyCategoryMis(): Record<WalletCategory, { count: number; amount: string }> {
  const mis = {} as Record<WalletCategory, { count: number; amount: string }>;
  for (const cat of WALLET_ALLOWED_CATEGORIES) {
    mis[cat] = { count: 0, amount: "0" };
  }
  return mis;
}
