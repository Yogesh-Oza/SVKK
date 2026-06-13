import type { CsvImportMode, CsvUpdateMode } from "@prisma/client";
import { getCsvField } from "./policy-csv-parse.js";

type CsvFieldMap = Map<string, string>;

/** Writable CSV columns for POLICY_COURIER scoped updates (legacy). */
export const POLICY_COURIER_WRITABLE_HEADERS = [
  "policy no",
  "Policy start",
  "Policy end",
  "Courier Status",
  "courier_date",
  "courier_address",
  "pod",
  "Courier Company",
] as const;

export type PolicyUpdateFieldPreview = {
  field: string;
  value: string;
};

const PREVIEW_FIELD_LIMIT = 30;

/** UPDATE_ONLY + FULL: all non-empty CSV columns (except ref no) are applied. */
export function isPolicyFullUpdateMode(
  importMode: CsvImportMode,
  updateMode?: CsvUpdateMode,
): boolean {
  return importMode === "UPDATE_ONLY" && updateMode === "FULL";
}

export function isPolicyCourierUpdateMode(updateMode?: CsvUpdateMode): boolean {
  return updateMode === "POLICY_COURIER";
}

/** Any ref-no-keyed policy CSV update (full row or legacy courier scope). */
export function isPolicyRefNoUpdateMode(
  importMode: CsvImportMode,
  updateMode?: CsvUpdateMode,
): boolean {
  return importMode === "UPDATE_ONLY" && (updateMode === "FULL" || updateMode === "POLICY_COURIER");
}

function readPolicyCourierFieldValue(
  map: CsvFieldMap,
  header: (typeof POLICY_COURIER_WRITABLE_HEADERS)[number],
): string {
  if (header === "Courier Status") return getCsvField(map, "Courier Status", "not_courier").trim();
  if (header === "Courier Company") return getCsvField(map, "Courier Company", "courier co").trim();
  return getCsvField(map, header).trim();
}

/** Non-empty CSV columns for preview (full update). */
export function listCsvRowUpdateFieldValues(
  header: string[],
  map: CsvFieldMap,
  limit = PREVIEW_FIELD_LIMIT,
): PolicyUpdateFieldPreview[] {
  const out: PolicyUpdateFieldPreview[] = [];
  for (const h of header) {
    const key = h.trim().toLowerCase();
    if (key === "ref no") continue;
    const value = getCsvField(map, h).trim();
    if (!value) continue;
    out.push({ field: h, value });
    if (out.length >= limit) break;
  }
  return out;
}

export function describeCsvRowUpdateFields(header: string[], map: CsvFieldMap): string {
  const entries = listCsvRowUpdateFieldValues(header, map);
  if (!entries.length) return "";
  const suffix = entries.length >= PREVIEW_FIELD_LIMIT ? "…" : "";
  return entries.map((entry) => `${entry.field} = ${entry.value}`).join("; ") + suffix;
}

/** Field names and CSV values that will be applied for POLICY_COURIER update. */
export function listPolicyCourierUpdateFieldValues(map: CsvFieldMap): PolicyUpdateFieldPreview[] {
  const out: PolicyUpdateFieldPreview[] = [];
  for (const header of POLICY_COURIER_WRITABLE_HEADERS) {
    const value = readPolicyCourierFieldValue(map, header);
    if (value) out.push({ field: header, value });
  }
  return out;
}

export function listPolicyCourierUpdateFields(map: CsvFieldMap): string[] {
  return listPolicyCourierUpdateFieldValues(map).map((entry) => entry.field);
}

export function describePolicyCourierUpdateFields(map: CsvFieldMap): string {
  const entries = listPolicyCourierUpdateFieldValues(map);
  if (!entries.length) return "";
  return entries.map((entry) => `${entry.field} = ${entry.value}`).join("; ");
}

export function hasPolicyCourierUpdateFields(map: CsvFieldMap): boolean {
  for (const header of POLICY_COURIER_WRITABLE_HEADERS) {
    if (readPolicyCourierFieldValue(map, header)) return true;
  }
  return false;
}

/** Validate a POLICY_COURIER update row before preview/import. */
export function validatePolicyCourierUpdateRow(map: CsvFieldMap): void {
  const refNo = getCsvField(map, "ref no").trim();
  if (!refNo) {
    throw new Error("ref no is required for policy update");
  }
  if (!hasPolicyCourierUpdateFields(map)) {
    throw new Error(
      "At least one updatable field is required (policy no, Policy start, Policy end, or courier fields)",
    );
  }
}

/** Validate a full v2 update row — ref no only; non-empty columns are applied. */
export function validatePolicyFullUpdateRow(map: CsvFieldMap): void {
  const refNo = getCsvField(map, "ref no").trim();
  if (!refNo) {
    throw new Error("ref no is required for policy update");
  }
}
