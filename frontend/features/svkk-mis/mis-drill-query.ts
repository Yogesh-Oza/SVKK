import { toIsoDateParam } from "@/lib/svkk/form-date";

/** Shared MIS filters passed to policy-member drill-down APIs. */
export type MisDrillFilterParams = {
  dateFrom: string;
  dateTo: string;
  categoryKeys: string[];
  villages: string[];
  sumInsureds: string[];
  policyGroupings: string[];
  periodMonthTexts: string[];
  fiscalLabels: string[];
  policyStartMonth?: string;
  policyStartYear?: string;
};

/**
 * Query string for `/mis/policy-member-report/detail` and detail CSV export.
 * Omits `groupBy` — drill endpoints use `drillVillage` / `drillArea` instead.
 */
export function buildPolicyMemberDrillQueryString(params: MisDrillFilterParams): string {
  const q = new URLSearchParams();
  const dateFromParam = toIsoDateParam(params.dateFrom);
  const dateToParam = toIsoDateParam(params.dateTo);
  if (dateFromParam) q.set("dateFrom", dateFromParam);
  if (dateToParam) q.set("dateTo", dateToParam);
  params.categoryKeys.forEach((c) => q.append("categoryKeys", c));
  params.villages.forEach((v) => q.append("villages", v));
  params.sumInsureds.forEach((s) => q.append("sumInsureds", s));
  params.policyGroupings.forEach((g) => q.append("policyGroupings", g));
  params.periodMonthTexts.forEach((m) => q.append("periodMonthTexts", m));
  params.fiscalLabels.forEach((y) => q.append("fiscalLabels", y));
  if (params.policyStartMonth) q.set("policyStartMonth", params.policyStartMonth);
  if (params.policyStartYear) q.set("policyStartYear", params.policyStartYear);
  return q.toString();
}
