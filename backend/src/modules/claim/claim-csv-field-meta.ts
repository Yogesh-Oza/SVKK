import {
  CLAIM_CSV_PUBLIC_HEADERS,
  type ClaimCsvPublicHeader,
} from "./claim-csv-format.js";

/** MIS / export report classification for a public claim CSV column. */
export type ClaimCsvReportKind = "id" | "date" | "amount" | "category";

/**
 * Shared metadata for one public claim CSV column.
 * Sample / Import / Export / Claim MIS Field Reports all align on this.
 */
export type ClaimCsvFieldMeta = {
  /** Exact public CSV header spelling. */
  header: ClaimCsvPublicHeader;
  /** Stable row/API key used in field-report payloads. */
  key: string;
  reportKind: ClaimCsvReportKind;
};

/**
 * Canonical 39-field contract metadata — same order as CLAIM_CSV_PUBLIC_HEADERS.
 * Do not invent a second independent list in MIS code.
 */
export const CLAIM_CSV_FIELD_META: readonly ClaimCsvFieldMeta[] = [
  { header: "Category", key: "category", reportKind: "category" },
  { header: "SVKK ID", key: "svkkId", reportKind: "id" },
  { header: "Policy Type", key: "policyType", reportKind: "category" },
  { header: "Policy Grouping", key: "policyGrouping", reportKind: "category" },
  { header: "Insurance Company name", key: "insuranceCompany", reportKind: "category" },
  { header: "Policy Number", key: "policyNumber", reportKind: "id" },
  { header: "Policy Start Date", key: "policyStartDate", reportKind: "date" },
  { header: "Policy End Date", key: "policyEndDate", reportKind: "date" },
  { header: "Policy Holder Name", key: "policyHolderName", reportKind: "category" },
  { header: "MD ID", key: "mdId", reportKind: "id" },
  { header: "Patient Name", key: "patientName", reportKind: "category" },
  { header: "Age", key: "patientAge", reportKind: "category" },
  { header: "Sex", key: "patientGender", reportKind: "category" },
  { header: "Relation", key: "patientRelation", reportKind: "category" },
  // Category (not amount): HTML colKind only treats names containing "amt"/"amount" as amounts.
  { header: "Sum Insured", key: "sumInsured", reportKind: "category" },
  { header: "Claim  No. ( CCN)", key: "claimNo", reportKind: "id" },
  { header: "Hospital Name", key: "hospitalName", reportKind: "category" },
  { header: "Area", key: "hospitalArea", reportKind: "category" },
  { header: "Treatment Type", key: "treatmentType", reportKind: "category" },
  { header: "DIAGNOSIS", key: "illness", reportKind: "category" },
  { header: "Disease Category", key: "diseaseCategory", reportKind: "category" },
  { header: "Date Of Admission", key: "admissionDate", reportKind: "date" },
  { header: "Date Of Discharge", key: "dischargeDate", reportKind: "date" },
  { header: " Claim Lodge Amt", key: "claimAmount", reportKind: "amount" },
  { header: "Claim Lodge Date", key: "lodgeDate", reportKind: "date" },
  { header: "Claim LodgeType", key: "claimType", reportKind: "category" },
  { header: "Actual Lodge Type", key: "actualLodgeType", reportKind: "category" },
  { header: "Deduction Amount", key: "deductionAmount", reportKind: "amount" },
  { header: "Discount Amt", key: "discountAmount", reportKind: "amount" },
  { header: "Deduction/Claim Rejection /Close", key: "deductionDetails", reportKind: "category" },
  { header: "Remark", key: "remark", reportKind: "category" },
  { header: "Paid Amount", key: "approvedAmount", reportKind: "amount" },
  { header: "Payment In Faver Of", key: "paymentInFavourOf", reportKind: "category" },
  { header: "PRSDate/CRS Date", key: "prsCrsDate", reportKind: "date" },
  { header: "Payment Detail", key: "paymentDetails", reportKind: "category" },
  { header: "Payment Date", key: "paymentDate", reportKind: "date" },
  { header: "Treatment  Type", key: "treatmentProcedure", reportKind: "category" },
  { header: "Status", key: "statusText", reportKind: "category" },
  { header: "Reported_LodgeAmt", key: "reportedLodgeAmount", reportKind: "amount" },
] as const;

/** Alias used in plan / docs. */
export const CLAIM_CSV_FIELD_MAP = CLAIM_CSV_FIELD_META;

/** Max categorical values shown in UI cards (CSV may include full set). */
export const CLAIM_FIELD_REPORT_CATEGORY_TOP_N = 25;

/** Backend in-memory row ceiling for field-report computation. */
export const CLAIM_FIELD_REPORT_MAX_ROWS = 50_000;

/** Assert meta stays aligned with public headers (called from tests). */
export function assertClaimCsvFieldMetaAligned(): void {
  if (CLAIM_CSV_FIELD_META.length !== CLAIM_CSV_PUBLIC_HEADERS.length) {
    throw new Error(
      `CLAIM_CSV_FIELD_META length ${CLAIM_CSV_FIELD_META.length} !== PUBLIC_HEADERS ${CLAIM_CSV_PUBLIC_HEADERS.length}`,
    );
  }
  for (let i = 0; i < CLAIM_CSV_PUBLIC_HEADERS.length; i++) {
    if (CLAIM_CSV_FIELD_META[i]!.header !== CLAIM_CSV_PUBLIC_HEADERS[i]) {
      throw new Error(
        `CLAIM_CSV_FIELD_META[${i}] header mismatch: ${CLAIM_CSV_FIELD_META[i]!.header} vs ${CLAIM_CSV_PUBLIC_HEADERS[i]}`,
      );
    }
  }
}

export function claimCsvFieldMetaByKey(key: string): ClaimCsvFieldMeta | undefined {
  return CLAIM_CSV_FIELD_META.find((m) => m.key === key);
}
