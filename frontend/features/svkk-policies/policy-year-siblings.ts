import { svkkJson } from "@/lib/svkk/api";
import { applyDisplayYearLabels } from "./policy-year-display";

/** One fiscal-year policy row linked by insured party SVKK public id. */
export type PolicyListYearSibling = {
  policyId: string;
  yearLabel: string;
  displayYearLabel?: string;
  referenceNo: string | null;
  policyNo: string | null;
  vkkPremium: unknown;
  sumInsured: unknown;
};

export type PolicyListRowMinimal = {
  id: string;
  policyNo?: string | null;
  referenceNo?: string | null;
  periodYearText?: string | null;
  insuredParty: { svkkPublicId: string };
  years: Array<{ yearLabel: string; vkkPremium: unknown; sumInsured: unknown }>;
};

export function yearLabelFromPolicyRow(row: PolicyListRowMinimal): string {
  return row.periodYearText?.trim() || row.years[0]?.yearLabel?.trim() || "";
}

export function toYearSiblingsFromListItems(
  items: PolicyListRowMinimal[],
  svkkPublicId: string,
): PolicyListYearSibling[] {
  const id = svkkPublicId.trim();
  if (!id) return [];
  const rows = items
    .filter((p) => p.insuredParty.svkkPublicId === id)
    .map((p) => {
      const yearLabel = yearLabelFromPolicyRow(p);
      const y0 = p.years[0];
      return {
        policyId: p.id,
        yearLabel,
        referenceNo: p.referenceNo ?? null,
        policyNo: p.policyNo ?? null,
        vkkPremium: y0?.vkkPremium ?? null,
        sumInsured: y0?.sumInsured ?? null,
      };
    })
    .filter((x) => x.yearLabel)
    .sort((a, b) => b.yearLabel.localeCompare(a.yearLabel));
  return applyDisplayYearLabels(rows);
}

export function singleRowYearSibling(row: PolicyListRowMinimal): PolicyListYearSibling[] {
  const yearLabel = yearLabelFromPolicyRow(row);
  if (!yearLabel) return [];
  const y0 = row.years[0];
  return [
    {
      policyId: row.id,
      yearLabel,
      referenceNo: row.referenceNo ?? null,
      policyNo: row.policyNo ?? null,
      vkkPremium: y0?.vkkPremium ?? null,
      sumInsured: y0?.sumInsured ?? null,
    },
  ];
}

export async function fetchPolicyYearSiblings(
  svkkPublicId: string,
): Promise<PolicyListYearSibling[]> {
  const id = svkkPublicId.trim();
  if (!id) return [];
  const query = new URLSearchParams({
    search: id,
    page: "1",
    pageSize: "50",
    sort: "periodYearText_desc",
    groupBySvkk: "false",
  });
  const res = await svkkJson<{ items: PolicyListRowMinimal[] }>(`/policies?${query}`);
  return toYearSiblingsFromListItems(res.items ?? [], id);
}
