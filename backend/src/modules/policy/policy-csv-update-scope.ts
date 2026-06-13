import type { CsvUpdateMode } from "@prisma/client";
import { getCsvField } from "./policy-csv-parse.js";

type CsvFieldMap = Map<string, string>;

/** Writable CSV columns for POLICY_COURIER scoped updates. */
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

export type PolicyCourierUpdateFieldPreview = {
  field: string;
  value: string;
};

function readPolicyCourierFieldValue(map: CsvFieldMap, header: (typeof POLICY_COURIER_WRITABLE_HEADERS)[number]): string {
  if (header === "Courier Status") return getCsvField(map, "Courier Status", "not_courier").trim();
  if (header === "Courier Company") return getCsvField(map, "Courier Company", "courier co").trim();
  return getCsvField(map, header).trim();
}

/** Field names and CSV values that will be applied for POLICY_COURIER update. */
export function listPolicyCourierUpdateFieldValues(map: CsvFieldMap): PolicyCourierUpdateFieldPreview[] {
  const out: PolicyCourierUpdateFieldPreview[] = [];
  for (const header of POLICY_COURIER_WRITABLE_HEADERS) {
    const value = readPolicyCourierFieldValue(map, header);
    if (value) out.push({ field: header, value });
  }
  return out;
}

/** Returns CSV column names that have non-empty values for POLICY_COURIER update. */
export function listPolicyCourierUpdateFields(map: CsvFieldMap): string[] {
  return listPolicyCourierUpdateFieldValues(map).map((entry) => entry.field);
}

/** Human-readable summary of fields that will be updated from this CSV row. */
export function describePolicyCourierUpdateFields(map: CsvFieldMap): string {
  const entries = listPolicyCourierUpdateFieldValues(map);
  if (!entries.length) return "";
  return entries.map((entry) => `${entry.field} = ${entry.value}`).join("; ");
}

/** Returns true when at least one POLICY_COURIER field has a non-empty value. */
export function hasPolicyCourierUpdateFields(map: CsvFieldMap): boolean {
  for (const header of POLICY_COURIER_WRITABLE_HEADERS) {
    if (header === "Courier Status") {
      if (getCsvField(map, "Courier Status", "not_courier").trim()) return true;
      continue;
    }
    if (header === "Courier Company") {
      if (getCsvField(map, "Courier Company", "courier co").trim()) return true;
      continue;
    }
    if (getCsvField(map, header).trim()) return true;
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
    throw new Error("At least one updatable field is required (policy no, Policy start, Policy end, or courier fields)");
  }
}

export function isPolicyCourierUpdateMode(updateMode?: CsvUpdateMode): boolean {
  return updateMode === "POLICY_COURIER";
}
