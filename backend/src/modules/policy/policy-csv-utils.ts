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
const CATEGORY_CHANGE_REMARK_MARKER = "Category Change Remark:";

const REMARK_MARKERS = [
  { key: "generalRemark" as const, marker: GENERAL_REMARK_MARKER },
  { key: "policyChangeRemark" as const, marker: POLICY_CHANGE_REMARK_MARKER },
  { key: "categoryChangeRemark" as const, marker: CATEGORY_CHANGE_REMARK_MARKER },
];

export type ParsedRemarks = {
  generalRemark: string;
  policyChangeRemark: string;
  categoryChangeRemark: string;
};

const EMPTY_PARSED_REMARKS: ParsedRemarks = {
  generalRemark: "",
  policyChangeRemark: "",
  categoryChangeRemark: "",
};

/** Mirrors frontend parseRemarks — splits combined Policy.remarks storage. */
export function parseRemarks(raw: string | null | undefined): ParsedRemarks {
  const text = raw?.trim() ?? "";
  if (!text) return { ...EMPTY_PARSED_REMARKS };

  const found = REMARK_MARKERS.map((s) => ({ ...s, idx: text.indexOf(s.marker) }))
    .filter((s) => s.idx !== -1)
    .sort((a, b) => a.idx - b.idx);

  if (found.length === 0) {
    return { generalRemark: text, policyChangeRemark: "", categoryChangeRemark: "" };
  }

  const result = { ...EMPTY_PARSED_REMARKS };
  for (let i = 0; i < found.length; i++) {
    const start = found[i].idx + found[i].marker.length;
    const end = i + 1 < found.length ? found[i + 1].idx : text.length;
    result[found[i].key] = text.slice(start, end).trim();
  }
  return result;
}

/** Builds combined Policy.remarks from separate remark parts (round-trip with UI/CSV). */
export function buildCombinedRemarksFromParts(
  generalRemark: string | null | undefined,
  policyChangeRemark: string | null | undefined,
  categoryChangeRemark?: string | null | undefined,
): string | null {
  const parts: string[] = [];
  if (generalRemark?.trim()) {
    parts.push(`${GENERAL_REMARK_MARKER}\n${generalRemark.trim()}`);
  }
  if (policyChangeRemark?.trim()) {
    parts.push(`${POLICY_CHANGE_REMARK_MARKER}\n${policyChangeRemark.trim()}`);
  }
  if (categoryChangeRemark?.trim()) {
    parts.push(`${CATEGORY_CHANGE_REMARK_MARKER}\n${categoryChangeRemark.trim()}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Maps stored remarks + legacy yearRemarks to flat CSV remark columns. */
export function resolvePolicyRemarkCsvCells(
  remarks: string | null | undefined,
  yearRemarks: string | null | undefined,
): { genRemark: string; policyRemark: string; categoryChangeRemark: string } {
  const parsed = parseRemarks(remarks);
  const policyRemark =
    parsed.policyChangeRemark ||
    (remarks?.includes(POLICY_CHANGE_REMARK_MARKER)
      ? ""
      : (yearRemarks?.trim() ?? ""));
  return {
    genRemark: parsed.generalRemark,
    policyRemark,
    categoryChangeRemark: parsed.categoryChangeRemark,
  };
}
