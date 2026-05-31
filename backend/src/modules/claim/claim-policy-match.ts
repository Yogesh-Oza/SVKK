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
  policyHolderName: string;
  policyTypeText: string;
  policyStartDate: Date | null;
  policyEndDate: Date | null;
  sumInsured: number | null;
};

export type ClaimMatchResult = {
  matchStatus: ClaimPolicyMatchStatus;
  verificationWarnings: string[];
  policyId?: string;
  policyYearId?: string;
  insuredPartyId?: string;
  svkkPublicId?: string;
  yearLabel?: string;
  village?: string | null;
  policyArea?: string | null;
  conflictDetail?: string;
};

type PolicyYearMatch = Prisma.PolicyYearGetPayload<{
  include: {
    policy: {
      include: { insuredParty: true; policyType: true };
    };
  };
}>;

/** Filter policy years by primary match keys (type + dates). */
function filterPrimaryMatches(
  candidates: PolicyYearMatch[],
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
): PolicyYearMatch[] {
  const resolvedType = input.policyTypeText
    ? resolvePolicyTypeFromCache(input.policyTypeText, typeCache)
    : null;

  return candidates.filter((py) => {
    const pt = py.policy.policyType;
    if (input.policyTypeText && resolvedType && pt.id !== resolvedType.id) return false;
    if (input.policyTypeText && !resolvedType) return false;
    if (!datesEqualUtc(py.policyStart, input.policyStartDate)) return false;
    if (!datesEqualUtc(py.policyEnd, input.policyEndDate)) return false;
    return true;
  });
}

/** Run secondary verification; returns warning keys. */
function runSecondaryVerification(
  match: PolicyYearMatch,
  input: ClaimMatchInput,
): string[] {
  const warnings: string[] = [];
  if (input.policyHolderName && !holderNamesMatch(input.policyHolderName, match.policy.insuredParty.name)) {
    warnings.push("holder_name");
  }
  if (!sumInsuredMatches(input.sumInsured, match.sumInsured)) {
    warnings.push("sum_insured");
  }
  return warnings;
}

function toMatchResult(
  match: PolicyYearMatch,
  warnings: string[],
): ClaimMatchResult {
  return {
    matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
    verificationWarnings: warnings,
    policyId: match.policyId,
    policyYearId: match.id,
    insuredPartyId: match.policy.insuredPartyId,
    svkkPublicId: match.policy.insuredParty.svkkPublicId,
    yearLabel: match.yearLabel,
    village: match.policy.village,
    policyArea: match.policy.area,
  };
}

/** Find policy year matches for a claim row using tiered matching. */
export async function matchPolicyForClaim(
  input: ClaimMatchInput,
  typeCache: PolicyTypeCache,
): Promise<ClaimMatchResult> {
  const policyNo = input.policyNo.trim();
  if (!policyNo) {
    return { matchStatus: ClaimPolicyMatchStatus.UNLINKED, verificationWarnings: [] };
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

  const primary = filterPrimaryMatches(candidates, input, typeCache);

  if (primary.length === 0) {
    return { matchStatus: ClaimPolicyMatchStatus.UNLINKED, verificationWarnings: [] };
  }
  if (primary.length > 1) {
    return {
      matchStatus: ClaimPolicyMatchStatus.CONFLICT,
      verificationWarnings: [],
      conflictDetail: `${primary.length} policy years match primary keys for policy ${policyNo}`,
    };
  }

  const match = primary[0]!;
  const warnings = runSecondaryVerification(match, input);
  return toMatchResult(match, warnings);
}

/** Build policy type cache once per import job. */
export async function buildClaimImportTypeCache(): Promise<PolicyTypeCache> {
  return buildPolicyTypeCache(prisma);
}
