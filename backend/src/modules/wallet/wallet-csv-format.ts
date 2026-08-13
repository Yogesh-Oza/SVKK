import { Prisma } from "@prisma/client";
import type { WalletTxnType } from "@prisma/client";
import { csvCell } from "../policy/policy-csv-utils.js";
import { parseCsvDate } from "../policy/policy-csv-utils.js";

/** Sample / template headers matching wallet_balance_manager_new.html */
export const WALLET_USAGE_CSV_HEADERS = [
  "Date of Submission",
  "Month",
  "Year",
  "Type",
  "Holder's Name",
  "Village",
  "Category",
  "Group",
  "Policy Type",
  "CD Account Used",
  "CD Amount",
  "Remark",
  "Deposited/Deducted Amount",
] as const;

export type WalletUsageCsvHeader = (typeof WALLET_USAGE_CSV_HEADERS)[number];

/** Canonical import fields (sample headers + legacy Reference). */
export const WALLET_CSV_CANONICAL_FIELDS = [
  ...WALLET_USAGE_CSV_HEADERS,
  "Reference",
] as const;

export type WalletCsvCanonicalField = (typeof WALLET_CSV_CANONICAL_FIELDS)[number];

export const WALLET_TXN_EXPORT_HEADERS = [
  "Transaction ID",
  "Date of Submission",
  "Month",
  "Year",
  "Type",
  "Holder's Name",
  "Village",
  "Category",
  "Group",
  "Policy Type",
  "CD Account Used",
  "CD Amount",
  "Remark",
  "Deposited/Deducted Amount",
  "Balance After",
  "Policy ID",
  "Policy Number",
  "Created By",
] as const;

export const WALLET_ALLOWED_CATEGORIES = ["A", "B", "C", "D", "Staff", "SVGA"] as const;

export type WalletCategory = (typeof WALLET_ALLOWED_CATEGORIES)[number];

export const WALLET_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const WALLET_CSV_MAX_ROWS = 5_000;

/** Accepted CSV date formats (same as policy CSV): YYYY-MM-DD or DD-MM-YYYY. */
export const WALLET_CSV_DATE_HINT = "YYYY-MM-DD or DD-MM-YYYY";

export const WALLET_SAMPLE_ROWS: ReadonlyArray<{
  date: string;
  month: string;
  year: string;
  type: "Debit" | "Credit";
  holderName: string;
  village: string;
  category: WalletCategory;
  group: string;
  policyType: string;
  cdAccountUsed: string;
  cdAmount: string;
  remark: string;
  amount: string;
}> = [
  {
    date: "2026-06-16",
    month: "June",
    year: "2026",
    type: "Debit",
    holderName: "Kiran Nishar",
    village: "Bhachau",
    category: "A",
    group: "SVKK",
    policyType: "Individual",
    cdAccountUsed: "CD-1023",
    cdAmount: "5000",
    remark: "Printing Charge",
    amount: "250",
  },
  {
    date: "2026-06-16",
    month: "June",
    year: "2026",
    type: "Debit",
    holderName: "Rita Shah",
    village: "Adhoi",
    category: "B",
    group: "NVKK",
    policyType: "Family Floater",
    cdAccountUsed: "CD-1044",
    cdAmount: "3000",
    remark: "Delivery Charge",
    amount: "100",
  },
  {
    date: "2026-06-16",
    month: "June",
    year: "2026",
    type: "Debit",
    holderName: "-",
    village: "-",
    category: "Staff",
    group: "-",
    policyType: "-",
    cdAccountUsed: "-",
    cdAmount: "-",
    remark: "Staff Tea Expense",
    amount: "120",
  },
  {
    date: "2026-06-16",
    month: "June",
    year: "2026",
    type: "Credit",
    holderName: "-",
    village: "-",
    category: "SVGA",
    group: "-",
    policyType: "-",
    cdAccountUsed: "-",
    cdAmount: "-",
    remark: "SVGA Donation Received",
    amount: "500",
  },
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

export function normalizeWalletMonth(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t || t === "-") return "";
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= 12) {
    return WALLET_MONTH_NAMES[n - 1] ?? t;
  }
  const found = WALLET_MONTH_NAMES.find((m) => m.toLowerCase() === t.toLowerCase());
  return found ?? t;
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
  if (!t || t === "-") return null;
  try {
    const d = parseCsvDate(t);
    if (!d) return "invalid";
    return d;
  } catch {
    return "invalid";
  }
}

/** CSV Type column: Credit or Debit (default Debit). */
export function parseWalletCsvType(raw: string | null | undefined): "CREDIT" | "DEBIT" {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  return t === "credit" ? "CREDIT" : "DEBIT";
}

export function parseWalletLedgerType(raw: string | null | undefined): WalletTxnType | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (t === "OPENING") return "OPENING";
  if (t === "TOP_UP" || t === "TOPUP") return "TOP_UP";
  if (t === "DEBIT") return "DEBIT";
  if (t === "CREDIT") return "CREDIT";
  if (t === "ADJUSTMENT") return "ADJUSTMENT";
  return null;
}

export function isWalletCreditLedgerType(
  type: WalletTxnType,
  direction?: string | null,
): boolean {
  if (type === "DEBIT") return false;
  if (type === "OPENING" || type === "TOP_UP" || type === "CREDIT") return true;
  const d = String(direction ?? "")
    .trim()
    .toUpperCase();
  return d === "CREDIT";
}

/**
 * Map header cell to canonical field.
 * Accepts prototype headers plus legacy Date / Particulars / Amount / Reference / catagory.
 */
export function resolveWalletCsvHeader(header: string): WalletCsvCanonicalField | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (h === "date of submission" || h === "date") return "Date of Submission";
  if (h === "month") return "Month";
  if (h === "year") return "Year";
  if (h === "type") return "Type";
  if (h === "holder's name" || h === "holders name" || h === "holder name") return "Holder's Name";
  if (h === "village") return "Village";
  if (h === "category" || h === "catagory") return "Category";
  if (h === "group") return "Group";
  if (h === "policy type") return "Policy Type";
  if (h === "cd account used" || h === "cd account") return "CD Account Used";
  if (h === "cd amount") return "CD Amount";
  if (h === "remark" || h === "particulars") return "Remark";
  if (
    h === "deposited/deducted amount" ||
    h === "deposited / deducted amount" ||
    h === "amount"
  ) {
    return "Deposited/Deducted Amount";
  }
  if (h === "reference") return "Reference";
  return null;
}

export function buildWalletSampleCsv(): string {
  const header = WALLET_USAGE_CSV_HEADERS.map(csvCell).join(",");
  const lines = [header];
  for (const row of WALLET_SAMPLE_ROWS) {
    lines.push(
      [
        row.date,
        row.month,
        row.year,
        row.type,
        row.holderName,
        row.village,
        row.category,
        row.group,
        row.policyType,
        row.cdAccountUsed,
        row.cdAmount,
        row.remark,
        row.amount,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function walletSampleFilename(): string {
  return "sample_wallet_usage_with_category.csv";
}

/** Serialize Prisma txn type for API/CSV/UI. */
export function formatWalletTxnType(
  type: "OPENING" | "TOP_UP" | "DEBIT" | "CREDIT" | "ADJUSTMENT",
): string {
  if (type === "TOP_UP") return "TOP-UP";
  return type;
}

export function emptyCategoryMis(): Record<WalletCategory, { count: number; amount: string }> {
  const mis = {} as Record<WalletCategory, { count: number; amount: string }>;
  for (const cat of WALLET_ALLOWED_CATEGORIES) {
    mis[cat] = { count: 0, amount: "0" };
  }
  return mis;
}

export function dashCell(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  return t && t !== "-" ? t : "-";
}
