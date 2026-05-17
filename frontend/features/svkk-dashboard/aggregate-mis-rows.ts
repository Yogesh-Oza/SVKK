import type { PolicyMemberRow } from "@/features/svkk-mis/policy-member-report-section";

export function aggregateMisRows(rows: PolicyMemberRow[]): PolicyMemberRow {
  const z: PolicyMemberRow = {
    label: "TOTAL",
    totalPolicies: 0,
    membersPlusPolicies: 0,
    cntAshaKiran: 0,
    cntFamilyFloater: 0,
    cntIndividual: 0,
    sumVkk: 0,
    sumCo: 0,
    sumGross: 0,
    sumComm: 0,
    sumTwoLac: 0,
    sumPolHolder: 0,
    sumGaam: 0,
    sumRefund: 0,
    sumCd: 0,
    age0_18: 0,
    age19_35: 0,
    age36_45: 0,
    age46_50: 0,
    age51_55: 0,
    age56_60: 0,
    age61_65: 0,
    age65p: 0,
  };
  for (const o of rows) {
    z.totalPolicies += o.totalPolicies;
    z.membersPlusPolicies += o.membersPlusPolicies;
    z.cntAshaKiran += o.cntAshaKiran;
    z.cntFamilyFloater += o.cntFamilyFloater;
    z.cntIndividual += o.cntIndividual;
    z.sumVkk += o.sumVkk;
    z.sumCo += o.sumCo;
    z.sumGross += o.sumGross;
    z.sumComm += o.sumComm;
    z.sumTwoLac += o.sumTwoLac;
    z.sumPolHolder += o.sumPolHolder;
    z.sumGaam += o.sumGaam;
    z.sumRefund += o.sumRefund;
    z.sumCd += o.sumCd;
    z.age0_18 += o.age0_18;
    z.age19_35 += o.age19_35;
    z.age36_45 += o.age36_45;
    z.age46_50 += o.age46_50;
    z.age51_55 += o.age51_55;
    z.age56_60 += o.age56_60;
    z.age61_65 += o.age61_65;
    z.age65p += o.age65p;
  }
  return z;
}

export type PieSlice = { name: string; value: number; percent: number };

export function rowsToPieSlices(
  rows: PolicyMemberRow[],
  valueKey: keyof PolicyMemberRow,
  topN = 8,
): PieSlice[] {
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
