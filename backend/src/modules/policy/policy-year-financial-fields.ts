import type { Prisma } from "@prisma/client";

/** Premium / financial scalars stored on `PolicyYear` (shared by create + patch). */
export type PolicyYearFinancialInput = {
  taxPercent?: number | null;
  taxAmount?: number | null;
  svkkPremium?: number | null;
  netPremium?: number | null;
  vkkCommission?: number | null;
  policyHolderContribution?: number | null;
  premiumOneOrTwoLakh?: number | null;
  gaamMahajanContribution?: number | null;
  differenceAmountPaidByHolder?: number | null;
  vkkPremium?: number | null;
  grossPremium?: number | null;
  commissionAmount?: number | null;
  twoLacFloater?: number | null;
  yearPolicyHolderPremium?: number | null;
  gaamMahajanVkk?: number | null;
  excessShortAmount?: number | null;
  diffPaidByHolder?: number | null;
  holderCumulativeBonus?: number | null;
  holderJoiningYear?: string | null;
  holderBasicPremium?: number | null;
};

function numOrUndefined(v: number | null | undefined): number | undefined {
  return v != null ? v : undefined;
}

/** `PolicyYear.create` financial columns from API input. */
export function policyYearFinancialCreateData(
  input: PolicyYearFinancialInput,
): Pick<
  Prisma.PolicyYearCreateInput,
  keyof PolicyYearFinancialInput & keyof Prisma.PolicyYearCreateInput
> {
  return {
    taxPercent: numOrUndefined(input.taxPercent),
    taxAmount: numOrUndefined(input.taxAmount),
    svkkPremium: numOrUndefined(input.svkkPremium),
    netPremium: numOrUndefined(input.netPremium),
    vkkCommission: numOrUndefined(input.vkkCommission),
    policyHolderContribution: numOrUndefined(input.policyHolderContribution),
    premiumOneOrTwoLakh: numOrUndefined(input.premiumOneOrTwoLakh),
    gaamMahajanContribution: numOrUndefined(input.gaamMahajanContribution),
    differenceAmountPaidByHolder: numOrUndefined(input.differenceAmountPaidByHolder),
    vkkPremium: numOrUndefined(input.vkkPremium),
    grossPremium: numOrUndefined(input.grossPremium),
    commissionAmount: numOrUndefined(input.commissionAmount),
    twoLacFloater: numOrUndefined(input.twoLacFloater),
    yearPolicyHolderPremium: numOrUndefined(input.yearPolicyHolderPremium),
    gaamMahajanVkk: numOrUndefined(input.gaamMahajanVkk),
    excessShortAmount: numOrUndefined(input.excessShortAmount),
    diffPaidByHolder: numOrUndefined(input.diffPaidByHolder),
    holderCumulativeBonus: numOrUndefined(input.holderCumulativeBonus),
    holderJoiningYear: input.holderJoiningYear ?? undefined,
    holderBasicPremium: numOrUndefined(input.holderBasicPremium),
  };
}

/** `PolicyYear.update` financial columns; only keys present on `yv` are applied. */
export function policyYearFinancialPatchData(
  yv: PolicyYearFinancialInput,
): Prisma.PolicyYearUpdateInput {
  return {
    ...(yv.taxPercent !== undefined ? { taxPercent: yv.taxPercent } : {}),
    ...(yv.taxAmount !== undefined ? { taxAmount: yv.taxAmount } : {}),
    ...(yv.svkkPremium !== undefined ? { svkkPremium: yv.svkkPremium } : {}),
    ...(yv.netPremium !== undefined ? { netPremium: yv.netPremium } : {}),
    ...(yv.vkkCommission !== undefined ? { vkkCommission: yv.vkkCommission } : {}),
    ...(yv.policyHolderContribution !== undefined
      ? { policyHolderContribution: yv.policyHolderContribution }
      : {}),
    ...(yv.premiumOneOrTwoLakh !== undefined ? { premiumOneOrTwoLakh: yv.premiumOneOrTwoLakh } : {}),
    ...(yv.gaamMahajanContribution !== undefined
      ? { gaamMahajanContribution: yv.gaamMahajanContribution }
      : {}),
    ...(yv.differenceAmountPaidByHolder !== undefined
      ? { differenceAmountPaidByHolder: yv.differenceAmountPaidByHolder }
      : {}),
    ...(yv.vkkPremium !== undefined ? { vkkPremium: yv.vkkPremium } : {}),
    ...(yv.grossPremium !== undefined ? { grossPremium: yv.grossPremium } : {}),
    ...(yv.commissionAmount !== undefined ? { commissionAmount: yv.commissionAmount } : {}),
    ...(yv.twoLacFloater !== undefined ? { twoLacFloater: yv.twoLacFloater } : {}),
    ...(yv.yearPolicyHolderPremium !== undefined
      ? { yearPolicyHolderPremium: yv.yearPolicyHolderPremium }
      : {}),
    ...(yv.gaamMahajanVkk !== undefined ? { gaamMahajanVkk: yv.gaamMahajanVkk } : {}),
    ...(yv.excessShortAmount !== undefined ? { excessShortAmount: yv.excessShortAmount } : {}),
    ...(yv.diffPaidByHolder !== undefined ? { diffPaidByHolder: yv.diffPaidByHolder } : {}),
    ...(yv.holderCumulativeBonus !== undefined
      ? { holderCumulativeBonus: yv.holderCumulativeBonus }
      : {}),
    ...(yv.holderJoiningYear !== undefined ? { holderJoiningYear: yv.holderJoiningYear } : {}),
    ...(yv.holderBasicPremium !== undefined ? { holderBasicPremium: yv.holderBasicPremium } : {}),
  };
}
