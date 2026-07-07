import type { PolicyExportRow } from "./policy.export-csv.js";

export type PolicyYearForExport = PolicyExportRow["years"][number];

/** Resolved premium scalars for CSV export (mirrors policy detail / form fallbacks). */
export type ResolvedYearPremiumForExport = {
  grossPremium: PolicyYearForExport["grossPremium"] | null;
  taxPercent: PolicyYearForExport["taxPercent"] | null;
  taxAmount: PolicyYearForExport["taxAmount"] | null;
  svkkPremium: PolicyYearForExport["svkkPremium"] | null;
  netPremium: PolicyYearForExport["netPremium"] | null;
  vkkCommission: PolicyYearForExport["vkkCommission"] | null;
  commissionAmount: PolicyYearForExport["commissionAmount"] | null;
  yearPolicyHolderPremium: PolicyYearForExport["yearPolicyHolderPremium"] | null;
  twoLacFloater: PolicyYearForExport["twoLacFloater"] | null;
  gaamMahajanContribution: PolicyYearForExport["gaamMahajanContribution"] | null;
  excessShortAmount: PolicyYearForExport["excessShortAmount"] | null;
  diffPaidByHolder: PolicyYearForExport["diffPaidByHolder"] | null;
};

const EMPTY_PREMIUM: ResolvedYearPremiumForExport = {
  grossPremium: null,
  taxPercent: null,
  taxAmount: null,
  svkkPremium: null,
  netPremium: null,
  vkkCommission: null,
  commissionAmount: null,
  yearPolicyHolderPremium: null,
  twoLacFloater: null,
  gaamMahajanContribution: null,
  excessShortAmount: null,
  diffPaidByHolder: null,
};

/**
 * Maps `PolicyYear` premium fields using the same fallbacks as the policy detail UI
 * (`policy-detail-view-body`, `ad-policy-detail-to-form`).
 */
export function resolveYearPremiumForExport(
  year: PolicyYearForExport | undefined,
): ResolvedYearPremiumForExport {
  if (!year) return EMPTY_PREMIUM;

  return {
    grossPremium: year.grossPremium,
    taxPercent: year.taxPercent,
    taxAmount: year.taxAmount,
    svkkPremium: year.svkkPremium ?? year.vkkPremium,
    netPremium: year.netPremium ?? year.expectedNetPremium,
    vkkCommission: year.vkkCommission,
    commissionAmount: year.commissionAmount,
    yearPolicyHolderPremium: year.yearPolicyHolderPremium ?? year.policyHolderContribution,
    twoLacFloater: year.twoLacFloater ?? year.premiumOneOrTwoLakh,
    gaamMahajanContribution: year.gaamMahajanContribution ?? year.gaamMahajanVkk,
    excessShortAmount: year.excessShortAmount,
    diffPaidByHolder: year.diffPaidByHolder ?? year.differenceAmountPaidByHolder,
  };
}

/** Receipt for the exported policy year, else the policy's first receipt. */
export function resolveReceiptNoForExport(
  row: PolicyExportRow,
  year: PolicyYearForExport | undefined,
): string {
  const receipts = row.receipts ?? [];
  if (!receipts.length) return "";

  if (year?.id) {
    const forYear = receipts.find((r) => r.policyYearId === year.id);
    if (forYear?.receiptNo?.trim()) return forYear.receiptNo.trim();
  }

  return receipts[0]?.receiptNo?.trim() ?? "";
}
