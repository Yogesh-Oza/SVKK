import type { Prisma } from "@prisma/client";
import { ClaimPolicyMatchStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  buildPolicyTypeCache,
  resolvePolicyTypeFromCache,
  type PolicyTypeCache,
} from "../policy/policy-csv-resolve.js";
import {
  datesEqualUtc,
  holderNamesMatch,
  sumInsuredMatches,
} from "./claim-csv-normalize.js";

export type ClaimMatchInput = {
  policyNo: string;
  /** CSV SVKK ID when provided — strong identity constraint via InsuredParty. */
  svkkPublicId: string;
  policyHolderName: string;
  policyTypeText: string;
  policyStartDate: Date | null;
  policyEndDate: Date | null;
  sumInsured: number | null;
  insuranceCompany: string | null;
  /** Coverage-date fallback: admission → lodge → received */
  admissionDate: Date | null;
  lodgeDate: Date | null;
  claimReceivedDate: Date | null;
};

export type ClaimMatchResult = {
  matchStatus: ClaimPolicyMatchStatus;
  verificationWarnings: string[];
  /** Human-readable reason for preview UI (no stack traces). */
  matchReason: string;
  policyId?: string;
  policyYearId?: string;
  insuredPartyId?: string;
  svkkPublicId?: string;
  yearLabel?: string;
  village?: string | null;
  policyArea?: string | null;
  conflictDetail?: string;
};

export type PolicyYearMatch = Prisma.PolicyYearGetPayload<{
  include: {
    policy: {
      include: { insuredParty: true; policyType: true };
    };
  };
}>;

/** Prefer admission → lodge → received for coverage-window fallback. */
export function claimCoverageDate(input: ClaimMatchInput): Date | null {
  return input.admissionDate ?? input.lodgeDate ?? input.claimReceivedDate ?? null;
}

function hasExplicitCsvPolicyDates(input: ClaimMatchInput): boolean {
  return input.policyStartDate != null || input.policyEndDate != null;
}

function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** True when coverageDate falls within PolicyYear start/end (inclusive, UTC day). */
export function policyYearContainsDate(
  py: { policyStart: Date | null; policyEnd: Date | null },
  coverageDate: Date,
): boolean {
  if (!py.policyStart || !py.policyEnd) return false;
  const t = utcDayMs(coverageDate);
  return utcDayMs(py.policyStart) <= t && t <= utcDayMs(py.policyEnd);
}

function normalizePolicyNo(raw: string): string {
  return raw.trim();
}

function normalizeSvkk(raw: string): string {
  return raw.trim();
}

/** Narrow by Policy Type when CSV provides a resolvable type. */
function filterByPolicyType(
  candidates: PolicyYearMatch[],
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
): PolicyYearMatch[] {
  const raw = input.policyTypeText.trim();
  if (!raw) return candidates;
  const resolved = resolvePolicyTypeFromCache(raw, typeCache);
  if (!resolved) return [];
  return candidates.filter((py) => py.policy.policyType.id === resolved.id);
}

/** Exact CSV Policy Start/End equality against PolicyYear (when either CSV date is set). */
function filterByExactCsvPolicyDates(
  candidates: PolicyYearMatch[],
  input: ClaimMatchInput,
): PolicyYearMatch[] {
  if (!hasExplicitCsvPolicyDates(input)) return candidates;
  return candidates.filter((py) => {
    if (input.policyStartDate != null && !datesEqualUtc(py.policyStart, input.policyStartDate)) {
      return false;
    }
    if (input.policyEndDate != null && !datesEqualUtc(py.policyEnd, input.policyEndDate)) {
      return false;
    }
    return true;
  });
}

function filterByCoverageDate(
  candidates: PolicyYearMatch[],
  coverageDate: Date,
): PolicyYearMatch[] {
  return candidates.filter((py) => policyYearContainsDate(py, coverageDate));
}

function runSecondaryVerification(
  match: PolicyYearMatch,
  input: ClaimMatchInput,
): string[] {
  const warnings: string[] = [];
  if (
    input.policyHolderName &&
    !holderNamesMatch(input.policyHolderName, match.policy.insuredParty.name)
  ) {
    warnings.push("holder_name");
  }
  if (!sumInsuredMatches(input.sumInsured, match.sumInsured)) {
    warnings.push("sum_insured");
  }
  const csvIns = (input.insuranceCompany ?? "").trim().toLowerCase();
  const dbIns = (match.policy.insuranceCompany ?? "").trim().toLowerCase();
  if (csvIns && dbIns && csvIns !== dbIns) {
    warnings.push("insurance_company");
  }
  return warnings;
}

function matchedResult(match: PolicyYearMatch, warnings: string[]): ClaimMatchResult {
  const policyNo = match.policy.policyNo ?? "";
  const svkk = match.policy.insuredParty.svkkPublicId;
  return {
    matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
    verificationWarnings: warnings,
    matchReason: `MATCHED — Policy: ${policyNo} · SVKK: ${svkk} · Policy Year: ${match.yearLabel}`,
    policyId: match.policyId,
    policyYearId: match.id,
    insuredPartyId: match.policy.insuredPartyId,
    svkkPublicId: svkk,
    yearLabel: match.yearLabel,
    village: match.policy.village,
    policyArea: match.policy.area,
  };
}

function unlinked(reason: string): ClaimMatchResult {
  return {
    matchStatus: ClaimPolicyMatchStatus.UNLINKED,
    verificationWarnings: [],
    matchReason: `UNLINKED — ${reason}`,
  };
}

function conflict(detail: string, reason: string): ClaimMatchResult {
  return {
    matchStatus: ClaimPolicyMatchStatus.CONFLICT,
    verificationWarnings: [],
    matchReason: `CONFLICT — ${reason}`,
    conflictDetail: detail,
  };
}

/**
 * Pure matching against already-loaded PolicyYear candidates.
 * Implements Steps A–E: policyNo → SVKK → type → exact CSV dates → coverage fallback.
 * Never auto-picks when candidate count > 1.
 */
export function resolveClaimPolicyMatch(
  candidates: PolicyYearMatch[],
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
): ClaimMatchResult {
  const policyNo = normalizePolicyNo(input.policyNo);
  if (!policyNo) {
    return unlinked("Policy Number is blank");
  }

  const csvSvkk = normalizeSvkk(input.svkkPublicId);
  let pool = candidates.filter((py) => (py.policy.policyNo ?? "").trim() === policyNo);

  if (csvSvkk) {
    const bySvkk = pool.filter(
      (py) => normalizeSvkk(py.policy.insuredParty.svkkPublicId) === csvSvkk,
    );
    if (pool.length > 0 && bySvkk.length === 0) {
      return unlinked("CSV SVKK ID does not match policy owner");
    }
    pool = bySvkk;
  }

  if (pool.length === 0) {
    return unlinked(
      csvSvkk
        ? `No policy found for Policy Number ${policyNo} + SVKK ${csvSvkk}`
        : `No policy found for Policy Number ${policyNo}`,
    );
  }

  pool = filterByPolicyType(pool, input, typeCache);
  if (pool.length === 0) {
    return unlinked(
      input.policyTypeText.trim()
        ? `No policy of type "${input.policyTypeText.trim()}" for Policy Number ${policyNo}`
        : `No policy found for Policy Number ${policyNo}`,
    );
  }

  const hadExplicitDates = hasExplicitCsvPolicyDates(input);
  if (hadExplicitDates) {
    const dated = filterByExactCsvPolicyDates(pool, input);
    if (dated.length === 1) {
      const match = dated[0]!;
      return matchedResult(match, runSecondaryVerification(match, input));
    }
    if (dated.length > 1) {
      return conflict(
        `${dated.length} policy years match Policy Number ${policyNo} with CSV policy dates`,
        "Multiple policy years match this claim",
      );
    }
    // Explicit CSV dates contradict available years — do NOT fall back to coverage date.
    return unlinked(
      `CSV Policy Start/End dates do not match any PolicyYear for Policy Number ${policyNo}`,
    );
  }

  // Coverage-date fallback only when CSV policy dates are missing/insufficient.
  if (pool.length === 1) {
    const match = pool[0]!;
    return matchedResult(match, runSecondaryVerification(match, input));
  }

  const coverage = claimCoverageDate(input);
  if (!coverage) {
    return conflict(
      `${pool.length} policy years match Policy Number ${policyNo}; no coverage date to disambiguate`,
      "Multiple policy years match this claim",
    );
  }

  const inWindow = filterByCoverageDate(pool, coverage);
  if (inWindow.length === 1) {
    const match = inWindow[0]!;
    return matchedResult(match, runSecondaryVerification(match, input));
  }
  if (inWindow.length === 0) {
    return unlinked(
      `No PolicyYear contains claim coverage date for Policy Number ${policyNo}`,
    );
  }
  return conflict(
    `${inWindow.length} policy years contain the claim coverage date for Policy Number ${policyNo}`,
    "Multiple policy years match this claim",
  );
}

/** Find policy year matches for a claim row using deterministic Steps A–E. */
export async function matchPolicyForClaim(
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
): Promise<ClaimMatchResult> {
  const policyNo = normalizePolicyNo(input.policyNo);
  if (!policyNo) {
    return unlinked("Policy Number is blank");
  }

  const candidates = await prisma.policyYear.findMany({
    where: {
      deletedAt: null,
      policy: { deletedAt: null, policyNo },
    },
    include: {
      policy: { include: { insuredParty: true, policyType: true } },
    },
  });

  return resolveClaimPolicyMatch(candidates, input, typeCache);
}

/** Build policy type cache once per import job. */
export async function buildClaimImportTypeCache(): Promise<PolicyTypeCache> {
  return buildPolicyTypeCache(prisma);
}
