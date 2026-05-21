import { Prisma } from "@prisma/client";
import { CATEGORY_TEXT_MAP } from "./config/dropdown-mappings.js";
import {
  CATEGORY_LETTER_MAP,
  POLICY_GROUPING_MAP,
  POLICY_TYPE_MAP,
  memberDobSentinelUtc,
  migrationAuditTag,
} from "./config/migration.js";
import type { DropdownResolver } from "./dropdown-resolver.js";
import { normalizeLegacyText } from "./normalize.js";
import { parseLegacyDate } from "./parse-legacy-date.js";
import type { LegacyMemberRow, LegacyPolicyRow } from "./types.js";

const DIGITS_ONLY = /^\d+$/;
const DEFAULT_CC = "91";

/** Normalize to E.164 +91…; returns null if empty (caller may synthetic). */
export function normalizeMobileOrNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/[\s\-().]/g, "");
  if (!trimmed) return null;
  let digits = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  if (!DIGITS_ONLY.test(digits)) return null;
  if (digits.length === 10) return `+${DEFAULT_CC}${digits}`;
  if (digits.startsWith(DEFAULT_CC) && digits.length === 12) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Deterministic +91 synthetic mobile from ref_no (plan: legacy missing mobile). */
export function syntheticMobileFromRef(refNo: string): string {
  let n = 0;
  for (let i = 0; i < refNo.length; i++) {
    n = (n * 31 + refNo.charCodeAt(i)) >>> 0;
  }
  const suffix = String(n % 1000000000).padStart(9, "0");
  return `+919${suffix}`;
}

export function trimPolicyNo(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/:+\s*$/, "").trim();
  return s || null;
}

export function mapPolicyTypeKey(policyTypeRaw: string | null | undefined): string | null {
  if (policyTypeRaw == null) return null;
  const k = policyTypeRaw.trim().toLowerCase().replace(/\s+/g, "-");
  const entry = POLICY_TYPE_MAP[k] ?? POLICY_TYPE_MAP[policyTypeRaw.trim().toLowerCase()];
  if (entry) return entry.policyTypeKey;
  const fuzzy = Object.keys(POLICY_TYPE_MAP).find((x) => k.includes(x) || x.includes(k));
  return fuzzy ? POLICY_TYPE_MAP[fuzzy]!.policyTypeKey : null;
}

export function mapCategoryKey(catRaw: string | null | undefined): string | null {
  if (catRaw == null) return null;
  const c = catRaw.trim().toLowerCase();
  return (
    CATEGORY_LETTER_MAP[c] ??
    CATEGORY_TEXT_MAP[normalizeLegacyText(catRaw)] ??
    null
  );
}

export function mapPolicyGrouping(
  raw: string | null | undefined,
): "SVKK" | "NVKK" | "RTY" | "OTHER" | null {
  if (raw == null) return null;
  const k = raw.trim().toLowerCase();
  return POLICY_GROUPING_MAP[k] ?? "OTHER";
}

/** Hint for PAYMENT_MODE resolver from legacy cheque/bank columns (no dedicated mode column). */
export function inferLegacyPaymentModeHint(row: LegacyPolicyRow): string {
  const chequeNo = row.policy_cheque_no?.trim().toLowerCase() ?? "";
  if (chequeNo.includes("cash")) return "CASH";
  if (chequeNo.includes("upi")) return "UPI";
  if (chequeNo.includes("neft") || chequeNo.includes("online") || chequeNo.includes("rtgs")) {
    return "ONLINE";
  }
  return "CHEQUE";
}

export function parseDecimalSafe(raw: string | null | undefined): Prisma.Decimal | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/,/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(s);
}

/** @deprecated Use parseLegacyDate */
export const parseDateSafe = parseLegacyDate;

export function parseIntSafe(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function yesNoToBool(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const u = String(raw).trim().toUpperCase();
  if (u === "YES" || u === "Y" || u === "1" || u === "TRUE") return true;
  if (u === "NO" || u === "N" || u === "0" || u === "FALSE") return false;
  return null;
}

export interface TransformedPolicy {
  refNo: string;
  policyTypeKey: string;
  categoryKey: string | null;
  yearLabel: string;
  mobile: string;
  usedSyntheticMobile: boolean;
  partyName: string;
  customerId: string | null;
  svkkPublicId: string;
  email: string | null;
  pan: string | null;
  holderDob: Date | null;
  policyNo: string | null;
  /** Prisma Policy create/update payload (partial) */
  policyData: Record<string, unknown>;
  /** Prisma PolicyYear create/update payload (partial) */
  yearData: Record<string, unknown>;
  auditRemarksSuffix: string;
}

export function transformPolicyRow(row: LegacyPolicyRow): TransformedPolicy {
  const refNo = String(row.ref_no).trim();
  let mobile = normalizeMobileOrNull(row.mobile_first);
  let usedSyntheticMobile = false;
  if (!mobile) {
    mobile = syntheticMobileFromRef(refNo);
    usedSyntheticMobile = true;
  }

  const policyTypeKey = mapPolicyTypeKey(row.policy_type);
  if (!policyTypeKey) {
    throw new Error(`UNMAPPED_POLICY_TYPE:${row.policy_type ?? ""}`);
  }

  const categoryKey = mapCategoryKey(row.cat);
  const yearLabel = (row.year && String(row.year).trim()) || "legacy";
  const svkkRaw = row.svvk_id != null ? String(row.svvk_id).trim() : "";
  const svkkPublicId = svkkRaw || `LEGACY-${refNo}`.slice(0, 64);

  const holderDob = parseLegacyDate(row.dob);
  const policyStart = parseLegacyDate(row.policy_start_date);
  const policyEnd = parseLegacyDate(row.policy_expiry_date);
  const refundChequeDate = parseLegacyDate(row.refund_cheque_date);
  const courierDate = parseLegacyDate(row.courier_date);

  const grouping = mapPolicyGrouping(row.policy_grouping);

  const remarkBase = row.remark != null ? String(row.remark).trim() : "";
  const audit = migrationAuditTag(refNo);
  const remarks = [remarkBase, audit].filter(Boolean).join("\n");

  const policyData = {
    policyNo: trimPolicyNo(row.policy_no),
    village: row.village?.trim() || null,
    addressLine1: row.address?.trim() || null,
    addressLine2: row.address_two?.trim() || null,
    addressLine3: row.address_three?.trim() || null,
    addressLine4: row.address_four?.trim() || null,
    city: row.city?.trim() || null,
    state: null,
    pincode: row.pincode?.trim() || null,
    contactPhone: mobile,
    nomineeName: row.nominee_name?.trim() || null,
    nomineeRelation: row.nominee_relation?.trim() || null,
    loanRef: null,
    courierTracking: null,
    remarks,
    insuranceCompany: row.company?.trim() || null,
    tpa: row.tpa?.trim() || null,
    categoryText: row.cat?.trim() || null,
    holderRelationship: row.relation?.trim() || null,
    holderAge: parseIntSafe(row.age),
    personsInsuredCount: parseIntSafe(row.person),
    area: row.area?.trim() || null,
    referenceNo: refNo,
    mobileSecondary: (() => {
      const n = normalizeMobileOrNull(row.mobile_second);
      if (n) return n.replace(/^\+/, "").slice(0, 20);
      const t = row.mobile_second?.trim();
      return t ? t.slice(0, 20) : null;
    })(),
    policyGrouping: grouping,
    policyUrl: row.url?.trim() || null,
    loanStatus: row.loan_status?.trim()?.slice(0, 10) || null,
    loanAmount: parseDecimalSafe(row.loan_amt),
    refundChequeAmount: parseDecimalSafe(row.refund_cheque_amt),
    refundChequeNo: row.cheque_no?.trim() || null,
    refundChequeDate,
    cdAccountUsed: yesNoToBool(row.cd_account_status),
    cdAmount: parseDecimalSafe(row.cd_amount),
    courierStatus: row.not_courier?.trim()?.slice(0, 10) || null,
    courierDate,
    courierAddress: row.courier_address?.trim() || null,
    periodYearText: row.year?.trim() || null,
    periodMonthText: row.month != null ? String(row.month).trim().slice(0, 20) : null,
    adProductVariant: variantFromPolicyType(row.policy_type),
  };

  const chequeBits = [
    row.policy_cheque_no && `cheque:${row.policy_cheque_no}`,
    row.bank && `bank:${row.bank}`,
    row.cheque_status && `status:${row.cheque_status}`,
    row.reason_dishonoured && `dishonour:${row.reason_dishonoured}`,
  ]
    .filter(Boolean)
    .join(" | ");

  const yearData = {
    policyStart,
    policyEnd,
    sumInsured: parseDecimalSafe(row.sum_insured),
    expectedNetPremium: parseDecimalSafe(row.co_premium),
    holderCumulativeBonus: parseDecimalSafe(row.comulative_bonus),
    holderJoiningYear: row.joining_year?.trim() || null,
    holderBasicPremium: parseDecimalSafe(row.basic_premium_ps),
    vkkPremium: parseDecimalSafe(row.vkk_premium),
    grossPremium: parseDecimalSafe(row.gross_premium),
    commissionAmount: parseDecimalSafe(row.commission),
    twoLacFloater: parseDecimalSafe(row.two_lakh_f),
    yearPolicyHolderPremium: parseDecimalSafe(row.policy_holder_premium),
    gaamMahajanVkk: parseDecimalSafe(row.Gaam_mahajan_vkk_refund),
    excessShortAmount: parseDecimalSafe(row.excess_short_amt),
    diffPaidByHolder: parseDecimalSafe(row.diff_amt_paid_policy_holder),
    yearRemarks: chequeBits || null,
  };

  return {
    refNo,
    policyTypeKey,
    categoryKey,
    yearLabel,
    mobile,
    usedSyntheticMobile,
    partyName: row.policy_holder?.trim() || "Unknown",
    customerId: row.customer_id?.trim() || null,
    svkkPublicId: svkkPublicId.slice(0, 64),
    email: row.email?.trim() || null,
    pan: row.pan_no?.trim()?.slice(0, 20) || null,
    holderDob,
    policyNo: trimPolicyNo(row.policy_no),
    policyData,
    yearData,
    auditRemarksSuffix: audit,
  };
}

function variantFromPolicyType(raw: string | null | undefined) {
  if (!raw) return undefined;
  const k = raw.trim().toLowerCase();
  if (k.includes("asha")) return "ASHA_KIRAN" as const;
  if (k.includes("individual")) return "INDIVIDUAL" as const;
  if (k.includes("floater") || k.includes("floating")) return "FAMILY_FLOATER" as const;
  return undefined;
}

export interface TransformedMember {
  name: string;
  relationship: string;
  dob: Date;
  dobSentinel: boolean;
  gender: string;
  sumInsured: Prisma.Decimal | null;
  cumulativeBonus: Prisma.Decimal | null;
  dateOfJoining: Date | null;
  memberPhone: string | null;
  basicPremium: Prisma.Decimal | null;
  ageAtEntry: number | null;
}

export interface ResolvedPolicyFields {
  area: string | null;
  village: string | null;
  city: string | null;
  holderRelationship: string | null;
  policyGrouping: string | null;
  paymentMode: string;
}

export async function resolvePolicyDropdownFields(
  row: LegacyPolicyRow,
  resolver: DropdownResolver,
): Promise<ResolvedPolicyFields> {
  const [area, village, city, holderRelationship, paymentMode] = await Promise.all([
    resolver.resolveArea(row.area),
    resolver.resolveVillage(row.village),
    resolver.resolveCity(row.city),
    resolver.resolveRelation(row.relation),
    resolver.resolvePaymentMode(inferLegacyPaymentModeHint(row)),
  ]);
  const grouping = mapPolicyGrouping(row.policy_grouping) ?? "OTHER";
  return {
    area,
    village,
    city,
    holderRelationship,
    policyGrouping: grouping,
    paymentMode,
  };
}

export function mergeResolvedPolicyFields(
  policyData: Record<string, unknown>,
  resolved: ResolvedPolicyFields,
): void {
  policyData.area = resolved.area;
  policyData.village = resolved.village;
  policyData.city = resolved.city;
  policyData.holderRelationship = resolved.holderRelationship;
  policyData.policyGrouping = resolved.policyGrouping;
}

export async function transformMemberRowAsync(
  row: LegacyMemberRow,
  resolver: DropdownResolver,
): Promise<TransformedMember> {
  const base = transformMemberRow(row);
  const relationship =
    (await resolver.resolveRelation(row.relation)) ?? base.relationship;
  const gender = await resolver.resolveGender(null);
  return { ...base, relationship, gender };
}

export function transformMemberRow(row: LegacyMemberRow): TransformedMember {
  const parsed = parseLegacyDate(row.dob);
  let dob: Date;
  let dobSentinel = false;
  if (parsed) {
    dob = parsed;
  } else {
    dob = new Date(memberDobSentinelUtc);
    dobSentinel = true;
  }
  const name = row.name?.trim() || "Unknown";
  const relationship = row.relation?.trim() || "Unknown";
  return {
    name,
    relationship,
    dob,
    dobSentinel,
    gender: "O",
    sumInsured: parseDecimalSafe(row.sum_insured),
    cumulativeBonus: parseDecimalSafe(row.comulative_bonus),
    dateOfJoining: parseLegacyDate(row.date_of_joining),
    memberPhone: (() => {
      const n = normalizeMobileOrNull(row.ph_no);
      if (n) return n.replace(/^\+/, "").slice(0, 20);
      const t = row.ph_no?.trim();
      return t ? t.slice(0, 20) : null;
    })(),
    basicPremium: parseDecimalSafe(row.basic_premium),
    ageAtEntry: parseIntSafe(row.age),
  };
}
