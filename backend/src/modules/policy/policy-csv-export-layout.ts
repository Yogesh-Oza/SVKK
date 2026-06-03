import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import {
  buildPaymentExportPlan,
  buildWidestPaymentExportPlan,
  type PaymentExportPlan,
} from "./policy-csv-payment-columns.js";
import {
  buildExtendedMemberHeaders,
  memberJoiningHeader,
  memberSlotHeader,
  POLICY_CSV_MAX_MEMBER_SLOTS,
  POLICY_CSV_MAX_PAYMENT_SLOTS,
} from "./policy-csv-slots.js";
import type { PolicyExportRow } from "./policy.export-csv.js";

const FLAT_GROSS_START = POLICY_CSV_FLAT_HEADERS.indexOf("Gross premium");
const FLAT_MEMBER1_START = POLICY_CSV_FLAT_HEADERS.indexOf("Member 1 Name");
const FLAT_NOMINEE_START = POLICY_CSV_FLAT_HEADERS.indexOf("nominee_name");

/** Flat v2 segments (payments are dynamic; member 1 lives in flat block). */
export const POLICY_CSV_FLAT_CORE_HEADERS = POLICY_CSV_FLAT_HEADERS.slice(0, FLAT_GROSS_START);

export const POLICY_CSV_FLAT_PREMIUM_HEADERS = POLICY_CSV_FLAT_HEADERS.slice(
  FLAT_GROSS_START,
  FLAT_MEMBER1_START,
);

export const POLICY_CSV_FLAT_MEMBER1_HEADERS = POLICY_CSV_FLAT_HEADERS.slice(
  FLAT_MEMBER1_START,
  FLAT_NOMINEE_START,
);

export const POLICY_CSV_FLAT_TAIL_HEADERS = POLICY_CSV_FLAT_HEADERS.slice(FLAT_NOMINEE_START);

export type ExportSlotCounts = {
  maxMembers: number;
  maxPayments: number;
};

export const POLICY_CSV_MIN_EXPORT_MEMBER_SLOTS = 1;
export const POLICY_CSV_MIN_EXPORT_PAYMENT_SLOTS = 1;

export function clampExportSlotCounts(counts: ExportSlotCounts): ExportSlotCounts {
  return {
    maxMembers: Math.min(
      Math.max(counts.maxMembers, POLICY_CSV_MIN_EXPORT_MEMBER_SLOTS),
      POLICY_CSV_MAX_MEMBER_SLOTS,
    ),
    maxPayments: Math.min(
      Math.max(counts.maxPayments, POLICY_CSV_MIN_EXPORT_PAYMENT_SLOTS),
      POLICY_CSV_MAX_PAYMENT_SLOTS,
    ),
  };
}

type YearSlotSource = {
  members?: readonly unknown[];
  payments?: readonly unknown[];
};

export function resolveExportSlotCounts(
  years: Array<YearSlotSource | undefined>,
): ExportSlotCounts {
  let maxMembers = 0;
  let maxPayments = 0;
  for (const year of years) {
    maxMembers = Math.max(maxMembers, year?.members?.length ?? 0);
    maxPayments = Math.max(maxPayments, year?.payments?.length ?? 0);
  }
  return clampExportSlotCounts({ maxMembers, maxPayments });
}

export type PolicyCsvExportLayout = {
  headers: string[];
  paymentPlan: PaymentExportPlan;
};

/**
 * Export column order:
 * core → Payment 1…N (dynamic fields per slot) → premium → Member 1…N → tail.
 */
export function buildPolicyCsvExportLayout(
  maxMembers: number,
  maxPayments: number,
  years: Array<PolicyExportRow["years"][number] | undefined> = [],
): PolicyCsvExportLayout {
  const { maxMembers: members, maxPayments: payments } = clampExportSlotCounts({
    maxMembers,
    maxPayments,
  });
  const paymentPlan = buildPaymentExportPlan(years, payments);
  const headers = [
    ...POLICY_CSV_FLAT_CORE_HEADERS,
    ...paymentPlan.headers,
    ...POLICY_CSV_FLAT_PREMIUM_HEADERS,
    ...buildAllMemberHeaders(members),
    ...POLICY_CSV_FLAT_TAIL_HEADERS,
  ];
  return { headers, paymentPlan };
}

export function buildPolicyCsvHeadersForExport(
  maxMembers: number,
  maxPayments: number,
  years: Array<PolicyExportRow["years"][number] | undefined> = [],
): string[] {
  return buildPolicyCsvExportLayout(maxMembers, maxPayments, years).headers;
}

/**
 * Full-width import/upload template: all payment field types for every slot.
 * Matches canonical export header names (`Payment N Mode of Payment`, etc.).
 */
export function buildPolicyCsvImportTemplateLayout(
  maxMembers: number,
  maxPayments: number,
): PolicyCsvExportLayout {
  const { maxMembers: members, maxPayments: payments } = clampExportSlotCounts({
    maxMembers,
    maxPayments,
  });
  const paymentPlan = buildWidestPaymentExportPlan(payments);
  const headers = [
    ...POLICY_CSV_FLAT_CORE_HEADERS,
    ...paymentPlan.headers,
    ...POLICY_CSV_FLAT_PREMIUM_HEADERS,
    ...buildAllMemberHeaders(members),
    ...POLICY_CSV_FLAT_TAIL_HEADERS,
  ];
  return { headers, paymentPlan };
}

export function buildPolicyCsvImportTemplateHeaders(
  maxMembers: number,
  maxPayments: number,
): string[] {
  return buildPolicyCsvImportTemplateLayout(maxMembers, maxPayments).headers;
}

export function buildAllMemberHeaders(maxMembers: number): string[] {
  const headers: string[] = [];
  if (maxMembers >= 1) {
    headers.push(...POLICY_CSV_FLAT_MEMBER1_HEADERS);
  }
  if (maxMembers >= 2) {
    headers.push(...buildExtendedMemberHeaders(maxMembers));
  }
  return headers;
}

export function buildPolicyCsvFlatExportHeaders(
  years: Array<PolicyExportRow["years"][number] | undefined> = [],
): string[] {
  return buildPolicyCsvHeadersForExport(1, 1, years);
}

export function flatMember1FieldHeaders(): string[] {
  return [...POLICY_CSV_FLAT_MEMBER1_HEADERS];
}

export { memberSlotHeader, memberJoiningHeader };
