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
  insurersMatch,
  normalizePolicyNo,
  sumInsuredMatches,
} from "./claim-csv-normalize.js";

export type ClaimMatchInput = {
  policyNo: string;
  /** CSV SVKK ID — validation only; never used to choose or reject the Policy. */
  svkkPublicId: string;
  policyHolderName: string;
  policyTypeText: string;
  policyStartDate: Date | null;
  policyEndDate: Date | null;
  sumInsured: number | null;
  insuranceCompany: string | null;
  /** Coverage-date year hint: admission → lodge → received */
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
  policyTypeName?: string | null;
  conflictDetail?: string;
  /** Canonical Policy.policyNo when MATCHED. */
  policyNo?: string;
  holderName?: string | null;
  policyGrouping?: string | null;
  categoryText?: string | null;
};

export type PolicyYearHint = {
  id: string;
  yearLabel: string;
  policyStart: Date | null;
  policyEnd: Date | null;
  sumInsured: { toString(): string } | null;
  deletedAt?: Date | null;
};

export type PolicyMatchCandidate = {
  id: string;
  policyNo: string | null;
  village: string | null;
  area: string | null;
  insuranceCompany: string | null;
  holderName: string | null;
  insuredPartyId: string;
  insuredParty: { id: string; svkkPublicId: string; name: string };
  policyType: { id: string; key: string; name: string };
  policyGrouping: string | null;
  categoryText: string | null;
  years: PolicyYearHint[];
};

export type ClaimPolicyLookupCache = {
  byNormalizedNo: Map<string, PolicyMatchCandidate[]>;
};

const policyLookupInclude = {
  insuredParty: true,
  policyType: true,
  years: {
    where: { deletedAt: null },
    select: {
      id: true,
      yearLabel: true,
      policyStart: true,
      policyEnd: true,
      sumInsured: true,
      deletedAt: true,
    },
  },
} as const;

type PolicyLookupRow = Prisma.PolicyGetPayload<{ include: typeof policyLookupInclude }>;

/** Prefer admission → lodge → received for coverage-window year hint. */
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

function liveYears(policy: PolicyMatchCandidate): PolicyYearHint[] {
  return policy.years.filter((y) => !y.deletedAt);
}

function yearMatchesExactCsvDates(py: PolicyYearHint, input: ClaimMatchInput): boolean {
  if (input.policyStartDate != null && !datesEqualUtc(py.policyStart, input.policyStartDate)) {
    return false;
  }
  if (input.policyEndDate != null && !datesEqualUtc(py.policyEnd, input.policyEndDate)) {
    return false;
  }
  return true;
}

function pickPolicyYearHint(
  policy: PolicyMatchCandidate,
  input: ClaimMatchInput,
): { policyYearId?: string; yearLabel?: string; warnings: string[] } {
  const years = liveYears(policy);
  const warnings: string[] = [];

  if (hasExplicitCsvPolicyDates(input)) {
    const exact = years.filter((y) => yearMatchesExactCsvDates(y, input));
    if (exact.length === 1) {
      return { policyYearId: exact[0]!.id, yearLabel: exact[0]!.yearLabel, warnings };
    }
    if (exact.length > 1) {
      warnings.push("policy_year_ambiguous");
      return { warnings };
    }
  }

  const coverage = claimCoverageDate(input);
  if (coverage) {
    const inWindow = years.filter((y) => policyYearContainsDate(y, coverage));
    if (inWindow.length === 1) {
      return { policyYearId: inWindow[0]!.id, yearLabel: inWindow[0]!.yearLabel, warnings };
    }
    if (inWindow.length === 0) {
      warnings.push("policy_dates");
    }
    if (inWindow.length > 1) {
      warnings.push("policy_year_ambiguous");
      return { warnings };
    }
  } else if (hasExplicitCsvPolicyDates(input)) {
    warnings.push("policy_dates");
  }

  if (years.length === 1 && !warnings.includes("policy_dates")) {
    return { policyYearId: years[0]!.id, yearLabel: years[0]!.yearLabel, warnings };
  }
  if (years.length > 1 && !warnings.includes("policy_year_ambiguous") && !warnings.includes("policy_dates")) {
    warnings.push("policy_year_ambiguous");
  }
  return { warnings };
}

function runValidations(
  policy: PolicyMatchCandidate,
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
  chosenYear: PolicyYearHint | undefined,
): string[] {
  const warnings: string[] = [];
  const csvSvkk = input.svkkPublicId.trim();
  const dbSvkk = policy.insuredParty.svkkPublicId.trim();
  if (csvSvkk && dbSvkk && csvSvkk.toLowerCase() !== dbSvkk.toLowerCase()) {
    warnings.push("svkk");
  }

  const typeRaw = input.policyTypeText.trim();
  if (typeRaw) {
    const resolved = resolvePolicyTypeFromCache(typeRaw, typeCache);
    if (!resolved || resolved.id !== policy.policyType.id) {
      warnings.push("policy_type");
    }
  }

  const holderCsv = input.policyHolderName.trim();
  if (holderCsv) {
    const partyOk = holderNamesMatch(holderCsv, policy.insuredParty.name);
    const policyOk = policy.holderName ? holderNamesMatch(holderCsv, policy.holderName) : false;
    if (!partyOk && !policyOk) {
      warnings.push("holder_name");
    }
  }

  const years = liveYears(policy);
  const sumYear = chosenYear ?? (years.length === 1 ? years[0] : undefined);
  if (input.sumInsured != null) {
    if (sumYear) {
      if (!sumInsuredMatches(input.sumInsured, sumYear.sumInsured as never)) {
        warnings.push("sum_insured");
      }
    } else if (years.length > 0 && !years.some((y) => sumInsuredMatches(input.sumInsured, y.sumInsured as never))) {
      warnings.push("sum_insured");
    }
  }

  const csvIns = (input.insuranceCompany ?? "").trim();
  const dbIns = (policy.insuranceCompany ?? "").trim();
  if (csvIns && dbIns && !insurersMatch(csvIns, dbIns)) {
    warnings.push("insurance_company");
  }
  return warnings;
}

function matchedResult(
  policy: PolicyMatchCandidate,
  warnings: string[],
  year: { policyYearId?: string; yearLabel?: string },
): ClaimMatchResult {
  const policyNo = policy.policyNo ?? "";
  const svkk = policy.insuredParty.svkkPublicId;
  const yearBit = year.yearLabel ? ` · Policy Year: ${year.yearLabel}` : "";
  return {
    matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
    verificationWarnings: warnings,
    matchReason: `MATCHED — Policy Number ${policyNo}${yearBit}`,
    policyId: policy.id,
    policyYearId: year.policyYearId,
    insuredPartyId: policy.insuredPartyId,
    svkkPublicId: svkk,
    yearLabel: year.yearLabel,
    village: policy.village,
    policyArea: policy.area,
    policyTypeName: policy.policyType.name,
    policyNo,
    holderName: policy.holderName ?? policy.insuredParty.name,
    policyGrouping: policy.policyGrouping,
    categoryText: policy.categoryText,
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

function toCandidate(row: PolicyLookupRow): PolicyMatchCandidate {
  return {
    id: row.id,
    policyNo: row.policyNo,
    village: row.village,
    area: row.area,
    insuranceCompany: row.insuranceCompany,
    holderName: row.holderName,
    insuredPartyId: row.insuredPartyId,
    insuredParty: {
      id: row.insuredParty.id,
      svkkPublicId: row.insuredParty.svkkPublicId,
      name: row.insuredParty.name,
    },
    policyType: {
      id: row.policyType.id,
      key: row.policyType.key,
      name: row.policyType.name,
    },
    policyGrouping: row.policyGrouping,
    categoryText: row.categoryText,
    years: row.years.map((y) => ({
      id: y.id,
      yearLabel: y.yearLabel,
      policyStart: y.policyStart,
      policyEnd: y.policyEnd,
      sumInsured: y.sumInsured,
      deletedAt: y.deletedAt,
    })),
  };
}

/**
 * Link decision uses Policy Number only (normalized). Other fields become warnings
 * and an optional PolicyYear hint — they never change MATCHED / UNLINKED / CONFLICT.
 */
export function resolveClaimPolicyMatch(
  candidates: PolicyMatchCandidate[],
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
): ClaimMatchResult {
  const policyNo = normalizePolicyNo(input.policyNo);
  if (!policyNo) {
    return unlinked("Policy Number is blank");
  }

  const pool = candidates.filter((p) => normalizePolicyNo(p.policyNo) === policyNo);
  if (pool.length === 0) {
    return unlinked("No policy found for this Policy Number.");
  }
  if (pool.length > 1) {
    const display = input.policyNo.trim() || policyNo;
    const labels = pool
      .map((p) => `${p.policyType.name} (${p.holderName ?? p.insuredParty.name})`)
      .join("; ");
    return conflict(
      `${pool.length} live policies share Policy Number ${display}: ${labels}`,
      "Policy Number matches multiple live policies. Claim cannot be linked safely.",
    );
  }

  const policy = pool[0]!;
  const yearHint = pickPolicyYearHint(policy, input);
  const chosenYear = yearHint.policyYearId
    ? liveYears(policy).find((y) => y.id === yearHint.policyYearId)
    : undefined;
  const warnings = [
    ...yearHint.warnings,
    ...runValidations(policy, input, typeCache, chosenYear),
  ];
  return matchedResult(policy, warnings, yearHint);
}

/** Load non-deleted policies once per import job; key by normalized Policy Number. */
export async function buildClaimImportPolicyCache(): Promise<ClaimPolicyLookupCache> {
  const rows = await prisma.policy.findMany({
    where: { deletedAt: null },
    include: policyLookupInclude,
  });
  const byNormalizedNo = new Map<string, PolicyMatchCandidate[]>();
  for (const row of rows) {
    const key = normalizePolicyNo(row.policyNo);
    if (!key) continue;
    const list = byNormalizedNo.get(key) ?? [];
    list.push(toCandidate(row));
    byNormalizedNo.set(key, list);
  }
  return { byNormalizedNo };
}

/** Find the Policy for a claim row using Policy Number only. */
export async function matchPolicyForClaim(
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
  policyCache?: ClaimPolicyLookupCache,
): Promise<ClaimMatchResult> {
  const policyNo = normalizePolicyNo(input.policyNo);
  if (!policyNo) {
    return unlinked("Policy Number is blank");
  }

  const cache = policyCache ?? (await buildClaimImportPolicyCache());
  const candidates = cache.byNormalizedNo.get(policyNo) ?? [];
  return resolveClaimPolicyMatch(candidates, input, typeCache);
}

/** Build policy type cache once per import job. */
export async function buildClaimImportTypeCache(): Promise<PolicyTypeCache> {
  return buildPolicyTypeCache(prisma);
}
