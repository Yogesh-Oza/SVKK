export type ClaimReportRowClient = {
  label: string;
  claimCount: number;
  sumClaimAmount: number;
  sumApprovedAmount: number;
  sumDeductionAmount: number;
};

export type ClaimPieSlice = { name: string; value: number; percent: number };

export function claimRowsToPieSlices(
  rows: ClaimReportRowClient[],
  valueKey: "sumClaimAmount" | "claimCount" = "sumClaimAmount",
  topN = 8,
): ClaimPieSlice[] {
  const items = rows
    .map((r) => ({ name: r.label || "—", value: Number(r[valueKey]) || 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = items.slice(0, topN);
  const rest = items.slice(topN);
  const restSum = rest.reduce((s, x) => s + x.value, 0);
  const all = restSum > 0 ? [...top, { name: "Other", value: restSum }] : top;
  const total = all.reduce((s, x) => s + x.value, 0);
  return all.map((x) => ({
    ...x,
    percent: total > 0 ? Math.round((x.value / total) * 1000) / 10 : 0,
  }));
}
