import type { Prisma } from "@prisma/client";

const CSV_DATETIME_TIME_ZONE = "Asia/Kolkata";

function csvDateParts(d: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CSV_DATETIME_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { day: pick("day"), month: pick("month"), year: pick("year") };
}

/** Date-only columns for CSV export (DD-MM-YYYY, India time). Leading tab keeps Excel from reformatting. */
export function fmtCsvDate(d: Date | null | undefined): string {
  if (!d) return "";
  const { day, month, year } = csvDateParts(d);
  return `\t${day}-${month}-${year}`;
}

/** Parse policy CSV date cells (export format, ISO legacy, or locale fallback). */
export function parseCsvDate(raw: string): Date | undefined {
  const t = raw.trim();
  if (!t) return undefined;

  const ddMmYyyy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${raw}`);
  return d;
}

/** User-readable timestamp for CSV export (DD-MM-YYYY HH:mm:ss, India time). */
export function fmtCsvDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CSV_DATETIME_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("day")}-${pick("month")}-${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
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

/**
 * Formats Aadhaar for CSV export so Excel/Sheets keep all 12 digits (not scientific notation).
 * Uses a leading tab (Excel text hint). Import strips it via `.trim()` on read.
 */
export function formatAadhaarForCsvExport(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return `\t${digits}`;
}

/** Keeps long numeric IDs (account/mobile) out of Excel scientific notation. */
export function formatDigitsForCsvExport(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10 && /^\d[\d\s]*$/.test(trimmed)) {
    return `\t${digits}`;
  }
  return trimmed;
}

const GENERAL_REMARK_MARKER = "General Remark:";
const POLICY_CHANGE_REMARK_MARKER = "Policy Change Remark:";

/** Mirrors frontend parseRemarks — splits combined Policy.remarks storage. */
export function parseRemarks(raw: string | null | undefined): {
  generalRemark: string;
  policyChangeRemark: string;
} {
  const text = raw?.trim() ?? "";
  if (!text) {
    return { generalRemark: "", policyChangeRemark: "" };
  }

  const gIdx = text.indexOf(GENERAL_REMARK_MARKER);
  const pIdx = text.indexOf(POLICY_CHANGE_REMARK_MARKER);

  if (gIdx !== -1 || pIdx !== -1) {
    let generalRemark = "";
    let policyChangeRemark = "";

    if (gIdx !== -1) {
      const gStart = gIdx + GENERAL_REMARK_MARKER.length;
      const gEnd = pIdx !== -1 && pIdx > gStart ? pIdx : text.length;
      generalRemark = text.slice(gStart, gEnd).trim();
    }
    if (pIdx !== -1) {
      const pStart = pIdx + POLICY_CHANGE_REMARK_MARKER.length;
      policyChangeRemark = text.slice(pStart).trim();
    }
    return { generalRemark, policyChangeRemark };
  }

  return { generalRemark: text, policyChangeRemark: "" };
}

/** Builds combined Policy.remarks from separate CSV columns (round-trip with UI). */
export function buildCombinedRemarksFromParts(
  generalRemark: string | null | undefined,
  policyChangeRemark: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (generalRemark?.trim()) {
    parts.push(`${GENERAL_REMARK_MARKER}\n${generalRemark.trim()}`);
  }
  if (policyChangeRemark?.trim()) {
    parts.push(`${POLICY_CHANGE_REMARK_MARKER}\n${policyChangeRemark.trim()}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Maps stored remarks + per-year policy remark to flat CSV remark columns. */
export function resolvePolicyRemarkCsvCells(
  remarks: string | null | undefined,
  yearRemarks: string | null | undefined,
): { genRemark: string; policyRemark: string } {
  const { generalRemark } = parseRemarks(remarks);
  return {
    genRemark: generalRemark,
    policyRemark: yearRemarks?.trim() ?? "",
  };
}
