import { ClaimPolicyMatchStatus } from "@prisma/client";
import {
  buildClaimImportTypeCache,
  matchPolicyForClaim,
  type ClaimMatchInput,
  type ClaimMatchResult,
} from "./claim-policy-match.js";

/** Fields used to build the same match input CSV import uses. */
export type ClaimManualMatchFields = {
  policyNo: string | null | undefined;
  svkkPublicId?: string | null;
  policyHolderName?: string | null;
  policyTypeText?: string | null;
  policyStartDate?: Date | null;
  policyEndDate?: Date | null;
  sumInsured?: number | null;
  insuranceCompany?: string | null;
  admissionDate?: Date | null;
  lodgeDate?: Date | null;
  claimReceivedDate?: Date | null;
};

export type ClaimPolicyLinkFields = {
  policyId: string | null;
  policyYearId: string | null;
  /** Set when matched; null when explicitly unlinked / not matched. */
  insuredPartyId: string | null;
  matchStatus: ClaimPolicyMatchStatus;
  matchReason: string;
  verificationWarnings: string[];
  policyArea: string | null;
  policyTypeName: string | null;
  yearLabel: string | null;
  /** Policy number on the matched Policy row, when linked. */
  matchedPolicyNo: string | null;
  svkkPublicId: string | null;
  holderName: string | null;
  village: string | null;
  policyGrouping: string | null;
  categoryText: string | null;
  /** Non-null when the user entered a policy number that did not link. */
  linkWarning: string | null;
};

export type ClaimSnapshotFields = {
  svkkPublicId?: string | null;
  policyYear?: string | null;
  village?: string | null;
  policyHolderName?: string | null;
  policyTypeText?: string | null;
  policyGroupingText?: string | null;
  categoryText?: string | null;
};

/** Village values that came from a shifted CSV (lodge amount in the Village column). */
export function isPlaceholderVillage(village: string | null | undefined): boolean {
  const t = (village ?? "").trim();
  if (!t) return true;
  return /^\d+(\.\d+)?$/.test(t);
}

/**
 * Copy identifiers from the matched policy into blank claim fields.
 * Does not overwrite a value the user (or CSV) already provided, except numeric-only village.
 */
export function applyMatchedPolicySnapshots(
  current: ClaimSnapshotFields,
  link: ClaimPolicyLinkFields,
): Partial<ClaimSnapshotFields> {
  if (!link.policyId) return {};
  const out: Partial<ClaimSnapshotFields> = {};
  if (!current.svkkPublicId?.trim() && link.svkkPublicId) {
    out.svkkPublicId = link.svkkPublicId;
  }
  if (!current.policyYear?.trim() && link.yearLabel) {
    out.policyYear = link.yearLabel;
  }
  if (isPlaceholderVillage(current.village) && link.village) {
    out.village = link.village;
  }
  if (!current.policyHolderName?.trim() && link.holderName) {
    out.policyHolderName = link.holderName;
  }
  if (!current.policyTypeText?.trim() && link.policyTypeName) {
    out.policyTypeText = link.policyTypeName;
  }
  if (!current.policyGroupingText?.trim() && link.policyGrouping) {
    out.policyGroupingText = link.policyGrouping;
  }
  if (!current.categoryText?.trim() && link.categoryText) {
    out.categoryText = link.categoryText;
  }
  return out;
}

export function claimMatchInputFromFields(fields: ClaimManualMatchFields): ClaimMatchInput {
  return {
    policyNo: (fields.policyNo ?? "").trim(),
    svkkPublicId: (fields.svkkPublicId ?? "").trim(),
    policyHolderName: (fields.policyHolderName ?? "").trim(),
    policyTypeText: (fields.policyTypeText ?? "").trim(),
    policyStartDate: fields.policyStartDate ?? null,
    policyEndDate: fields.policyEndDate ?? null,
    sumInsured: fields.sumInsured ?? null,
    insuranceCompany: fields.insuranceCompany ?? null,
    admissionDate: fields.admissionDate ?? null,
    lodgeDate: fields.lodgeDate ?? null,
    claimReceivedDate: fields.claimReceivedDate ?? null,
  };
}

/**
 * Map a matcher result to claim FK / status fields.
 * MATCHED → set policyId; otherwise clear policyId so a stale link cannot remain.
 */
export function linkFieldsFromMatchResult(
  match: ClaimMatchResult,
  policyNo: string,
): ClaimPolicyLinkFields {
  const trimmed = policyNo.trim();
  const linked = match.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT && !!match.policyId;

  return {
    policyId: linked ? (match.policyId ?? null) : null,
    policyYearId: linked ? (match.policyYearId ?? null) : null,
    insuredPartyId: linked ? (match.insuredPartyId ?? null) : null,
    matchStatus: match.matchStatus,
    matchReason: match.matchReason,
    verificationWarnings: match.verificationWarnings,
    policyArea: match.policyArea ?? null,
    policyTypeName: match.policyTypeName ?? null,
    yearLabel: match.yearLabel ?? null,
    matchedPolicyNo: linked ? (match.policyNo ?? (trimmed || null)) : null,
    svkkPublicId: linked ? (match.svkkPublicId ?? null) : null,
    holderName: linked ? (match.holderName ?? null) : null,
    village: linked ? (match.village ?? null) : null,
    policyGrouping: linked ? (match.policyGrouping ?? null) : null,
    categoryText: linked ? (match.categoryText ?? null) : null,
    linkWarning: !trimmed || linked ? null : match.matchReason,
  };
}

/** Resolve policy link for Add/Edit claim using the same matcher as CSV import. */
export async function resolveClaimManualPolicyLink(
  fields: ClaimManualMatchFields,
): Promise<ClaimPolicyLinkFields> {
  const input = claimMatchInputFromFields(fields);
  const typeCache = await buildClaimImportTypeCache();
  const match = await matchPolicyForClaim(input, typeCache);
  return linkFieldsFromMatchResult(match, input.policyNo);
}
