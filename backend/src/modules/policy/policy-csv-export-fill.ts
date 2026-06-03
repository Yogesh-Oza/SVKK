import type { PolicyExportRow } from "./policy.export-csv.js";

/** Gender codes stored in DB → labels shown on policy profile. */
export function formatGenderForCsvExport(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim().toUpperCase();
  if (t === "O" || t === "OTHER") return "Other";
  if (t === "M" || t === "MALE") return "Male";
  if (t === "F" || t === "FEMALE") return "Female";
  return raw.trim();
}

/** Holder joining year column: year label, else year portion of holder joining date (profile fallback). */
export function resolveHolderJoiningYearForExport(
  row: PolicyExportRow,
  year: PolicyExportRow["years"][number] | undefined,
): string {
  const fromYear = year?.holderJoiningYear?.trim();
  if (fromYear) return fromYear;
  if (row.holderJoiningDate) {
    return String(row.holderJoiningDate.getUTCFullYear());
  }
  return "";
}
