import { getv, normKey } from "./future-csv-utils";
import type { CsvRowObject } from "./future-premium-types";

/** Multi-select filters aligned with the policies list page. */
export type FuturePolicyFilters = {
  periodYears: string[];
  periodMonths: string[];
  categoryIds: string[];
  policyTypeIds: string[];
  areas: string[];
  villages: string[];
  sumInsureds: string[];
  policyGroupings: string[];
};

export type FutureCsvFilterContext = {
  categoryKeys: string[];
  categoryLabels: string[];
  policyTypeKeys: string[];
  policyTypeLabels: string[];
};

export function emptyFuturePolicyFilters(): FuturePolicyFilters {
  return {
    periodYears: [],
    periodMonths: [],
    categoryIds: [],
    policyTypeIds: [],
    areas: [],
    villages: [],
    sumInsureds: [],
    policyGroupings: [],
  };
}

export function countActiveFuturePolicyFilters(filters: FuturePolicyFilters): number {
  return (
    filters.periodYears.length +
    filters.periodMonths.length +
    filters.categoryIds.length +
    filters.policyTypeIds.length +
    filters.areas.length +
    filters.villages.length +
    filters.sumInsureds.length +
    filters.policyGroupings.length
  );
}

/** Query string for GET /policies/export.csv (same params as policies page export). */
export function buildFuturePolicyFilterQuery(
  filters: FuturePolicyFilters,
  categoryKeys: string[],
): string {
  const q = new URLSearchParams();
  filters.periodYears.forEach((y) => q.append("periodYearTexts", y));
  filters.periodMonths.forEach((m) => q.append("periodMonthTexts", m));
  filters.categoryIds.forEach((id) => q.append("categoryIds", id));
  categoryKeys.forEach((k) => q.append("categoryKeys", k));
  filters.policyTypeIds.forEach((id) => q.append("policyTypeIds", id));
  filters.areas.forEach((a) => q.append("areas", a));
  filters.villages.forEach((v) => q.append("villages", v));
  filters.sumInsureds.forEach((s) => q.append("sumInsureds", s));
  filters.policyGroupings.forEach((g) => q.append("policyGroupings", g));
  return q.toString();
}

function normSi(v: string): string {
  return v.replace(/[,₹\s]/g, "").trim();
}

function inSet(values: string[], cell: string): boolean {
  if (!values.length) return true;
  const hay = cell.trim();
  if (!hay) return false;
  const nk = normKey(hay);
  return values.some((v) => normKey(v) === nk || hay === v);
}

function categoryMatches(row: CsvRowObject, ctx: FutureCsvFilterContext): boolean {
  if (!ctx.categoryKeys.length && !ctx.categoryLabels.length) return true;
  const cell = getv(row, ["category", "Category"]);
  if (!cell.trim()) return false;
  const nk = normKey(cell);
  if (ctx.categoryKeys.some((k) => nk.includes(normKey(k)) || nk === normKey(k))) return true;
  return ctx.categoryLabels.some((l) => normKey(l) === nk || cell.toLowerCase().includes(l.toLowerCase()));
}

function policyTypeMatches(row: CsvRowObject, ctx: FutureCsvFilterContext): boolean {
  if (!ctx.policyTypeKeys.length && !ctx.policyTypeLabels.length) return true;
  const cell = getv(row, [
    "policy_type",
    "product type",
    "product_type",
    "Product Type",
    "policy type",
  ]);
  if (!cell.trim()) return false;
  const nk = normKey(cell);
  if (ctx.policyTypeKeys.some((k) => nk === normKey(k) || nk.includes(normKey(k)))) return true;
  return ctx.policyTypeLabels.some(
    (l) => normKey(l) === nk || cell.toLowerCase().includes(l.toLowerCase()),
  );
}

function rowMatchesFutureFilters(
  row: CsvRowObject,
  filters: FuturePolicyFilters,
  ctx: FutureCsvFilterContext,
): boolean {
  const year = getv(row, ["year", "policy_year", "policy year", "Year"]);
  const month = getv(row, ["month", "period_month", "Month"]);
  const village = getv(row, ["village", "Village"]);
  const area = getv(row, ["area", "Area"]);
  const grouping = getv(row, ["grouping", "policy_group", "policy grouping", "Group", "group"]);
  const si = getv(row, ["sum_insured", "sum insured", "Sum insured", "si"]);

  if (!inSet(filters.periodYears, year)) return false;
  if (!inSet(filters.periodMonths, month)) return false;
  if (!inSet(filters.villages, village)) return false;
  if (!inSet(filters.areas, area)) return false;
  if (!inSet(filters.policyGroupings, grouping)) return false;
  if (filters.sumInsureds.length) {
    const nSi = normSi(si);
    if (!filters.sumInsureds.some((s) => normSi(s) === nSi)) return false;
  }
  if (!categoryMatches(row, ctx)) return false;
  if (!policyTypeMatches(row, ctx)) return false;
  return true;
}

/** Apply the same filter dimensions to uploaded CSV rows (session storage). */
export function filterFutureCsvRows(
  rows: CsvRowObject[],
  filters: FuturePolicyFilters,
  ctx: FutureCsvFilterContext,
): CsvRowObject[] {
  if (!countActiveFuturePolicyFilters(filters)) return rows;
  return rows.filter((row) => rowMatchesFutureFilters(row, filters, ctx));
}
