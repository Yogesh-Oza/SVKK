import type { Prisma } from "@prisma/client";

export function fmtCsvDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function fmtCsvDecimal(v: Prisma.Decimal | null | undefined): string {
  if (v == null) return "";
  return v.toString();
}

export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : value instanceof Date
        ? value.toISOString()
        : typeof value === "object" && value !== null && "toString" in value
          ? String((value as { toString: () => string }).toString())
          : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Formats a phone value for CSV export so Excel/Sheets keep full digits (not scientific notation).
 * Uses a leading tab (Excel text hint) and 10-digit local display for India E.164 (+91…).
 */
export function formatPhoneForCsvExport(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  return `\t${local}`;
}

/** {@link csvCell} wrapper for phone columns in policy export. */
export function csvPhoneCell(value: unknown): string {
  if (value == null || value === "") return "";
  return csvCell(formatPhoneForCsvExport(String(value)));
}
