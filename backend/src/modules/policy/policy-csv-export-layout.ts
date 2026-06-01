import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import {
  buildExtendedMemberHeaders,
  buildExtendedPaymentHeaders,
  memberJoiningHeader,
  memberSlotHeader,
  POLICY_CSV_MAX_MEMBER_SLOTS,
  POLICY_CSV_MAX_PAYMENT_SLOTS,
  type PaymentSlotFieldKey,
} from "./policy-csv-slots.js";

const FLAT_PAYMENT1_START = POLICY_CSV_FLAT_HEADERS.indexOf("mode of payment");
const FLAT_GROSS_START = POLICY_CSV_FLAT_HEADERS.indexOf("Gross premium");
const FLAT_MEMBER1_START = POLICY_CSV_FLAT_HEADERS.indexOf("Member 1 Name");
const FLAT_NOMINEE_START = POLICY_CSV_FLAT_HEADERS.indexOf("nominee_name");

/** Flat v2 segments (payment 1 and member 1 are optional in export). */
export const POLICY_CSV_FLAT_CORE_HEADERS = POLICY_CSV_FLAT_HEADERS.slice(0, FLAT_PAYMENT1_START);

export const POLICY_CSV_FLAT_PAYMENT1_HEADERS = POLICY_CSV_FLAT_HEADERS.slice(
  FLAT_PAYMENT1_START,
  FLAT_GROSS_START,
);

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

/** List export always includes at least one member/payment column group (blank when no data). */
export const POLICY_CSV_MIN_EXPORT_MEMBER_SLOTS = 1;
export const POLICY_CSV_MIN_EXPORT_PAYMENT_SLOTS = 1;

/**
 * Max member/payment slots for export, with a floor of one blank slot each.
 */
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

/** Payment slots 1…N contiguous (slot 1 = flat cheque block). */
export function buildAllPaymentHeaders(maxPayments: number): string[] {
  const headers: string[] = [];
  if (maxPayments >= 1) {
    headers.push(...POLICY_CSV_FLAT_PAYMENT1_HEADERS);
  }
  if (maxPayments >= 2) {
    headers.push(...buildExtendedPaymentHeaders(maxPayments));
  }
  return headers;
}

/** Member slots 1…N contiguous (slot 1 = flat Member 1 block), before nominee/address tail. */
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

/**
 * Export column order:
 * core → Payment 1…N → premium/loan → Member 1…N → nominee/address/… (tail).
 * Members and payments are never appended after `url`.
 */
export function buildPolicyCsvHeadersForExport(
  maxMembers: number,
  maxPayments: number,
): string[] {
  const { maxMembers: members, maxPayments: payments } = clampExportSlotCounts({
    maxMembers,
    maxPayments,
  });

  return [
    ...POLICY_CSV_FLAT_CORE_HEADERS,
    ...buildAllPaymentHeaders(payments),
    ...POLICY_CSV_FLAT_PREMIUM_HEADERS,
    ...buildAllMemberHeaders(members),
    ...POLICY_CSV_FLAT_TAIL_HEADERS,
  ];
}

/** Full flat column set in export order (1 member, 1 payment) — use for samples and width tests. */
export function buildPolicyCsvFlatExportHeaders(): string[] {
  return buildPolicyCsvHeadersForExport(1, 1);
}

/** Member 1 field headers in flat block (for tests). */
export function flatMember1FieldHeaders(): string[] {
  return [...POLICY_CSV_FLAT_MEMBER1_HEADERS];
}

/** Payment 1 field headers in flat block (excludes `amount`, which is not in v2 flat). */
export function flatPayment1FieldHeaders(): string[] {
  return [...POLICY_CSV_FLAT_PAYMENT1_HEADERS];
}

export { memberSlotHeader, memberJoiningHeader, type PaymentSlotFieldKey };
