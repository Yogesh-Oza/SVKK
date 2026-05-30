import { DropdownType, PaymentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { MisScope } from "../../services/mis-scope.service.js";
import { buildPolicyReadWhere } from "../../services/mis-scope.service.js";
import { buildPolicyScopeSqlP } from "./mis.scope-sql.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";
import {
  classifyPolicyRenewalBucket,
  DASHBOARD_RENEWAL_PIE_KEYS,
  renewalBucketLabel,
  type RenewalBucketRow,
} from "../policy/renewal-pending.js";
import {
  asOfDayBoundsUTC,
  reportPeriodBoundsUTC,
  queryDashboardMonthlyPremium,
  queryVillageAggregates,
  queryVillagePaymentTotals,
  queryMemberAgeBuckets,
  queryDistinctPolicyCategoryKeys,
  queryPolicyMemberReport,
  UNCATEGORIZED_CATEGORY_KEY,
  type PolicyMemberReportRow,
} from "./mis.queries.js";

async function loadSumInsuredLabelMap(): Promise<Map<string, string>> {
  const rows = await prisma.dropdownOption.findMany({
    where: { type: DropdownType.SUM_INSURED, isActive: true },
    orderBy: [{ sortOrder: "asc" }],
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.value, row.label);
    const n = Number(row.value);
    if (Number.isFinite(n)) {
      map.set(String(Math.trunc(n)), row.label);
    }
  }
  return map;
}

function resolveSumInsuredLabel(raw: string, map: Map<string, string>): string {
  if (raw === "—" || raw === "") {
    return "—";
  }
  const stripped = raw.replace(/\.0+$/, "");
  return map.get(stripped) ?? map.get(raw) ?? raw;
}

function sumInsuredSortKey(label: string): number {
  if (label === "—") {
    return -1;
  }
  const n = Number(label.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function decStringToNumber(s: string | null | undefined): number {
  if (s == null || s === "") {
    return 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toPolicyMemberJsonRow(r: PolicyMemberReportRow) {
  return {
    label: r.label,
    totalPolicies: Number(r.totalPolicies),
    membersPlusPolicies: Number(r.membersPlusPolicies),
    cntAshaKiran: Number(r.cntAshaKiran),
    cntFamilyFloater: Number(r.cntFamilyFloater),
    cntIndividual: Number(r.cntIndividual),
    sumVkk: decStringToNumber(r.sumVkk),
    sumCo: decStringToNumber(r.sumCo),
    sumGross: decStringToNumber(r.sumGross),
    sumComm: decStringToNumber(r.sumComm),
    sumTwoLac: decStringToNumber(r.sumTwoLac),
    sumPolHolder: decStringToNumber(r.sumPolHolder),
    sumGaam: decStringToNumber(r.sumGaam),
    sumRefund: decStringToNumber(r.sumRefund),
    sumCd: decStringToNumber(r.sumCd),
    age0_18: Number(r.age0_18),
    age19_35: Number(r.age19_35),
    age36_45: Number(r.age36_45),
    age46_50: Number(r.age46_50),
    age51_55: Number(r.age51_55),
    age56_60: Number(r.age56_60),
    age61_65: Number(r.age61_65),
    age65p: Number(r.age65p),
  };
}

/**
 * Scope-aware dashboard: counts and premium totals. `asOfDate` is returned for client transparency.
 */
export async function getDashboardMetrics(
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
) {
  const pWhere = buildPolicyReadWhere(scope, filterVillage, userId, permissions);
  const { start, end } = asOfDayBoundsUTC(asOfDate);

  const [totalPolicies, completedPayments, expectedAgg, yearWindowCount] = await Promise.all([
    prisma.policy.count({ where: pWhere }),
    prisma.payment.aggregate({
      where: {
        deletedAt: null,
        status: PaymentStatus.COMPLETED,
        policyYear: {
          deletedAt: null,
          policy: pWhere,
          OR: [
            { policyStart: null, policyEnd: null },
            {
              AND: [
                { OR: [{ policyStart: null }, { policyStart: { lte: end } }] },
                { OR: [{ policyEnd: null }, { policyEnd: { gte: start } }] },
              ],
            },
          ],
        },
      },
      _sum: { amount: true },
    }),
    prisma.policyYear.aggregate({
      where: {
        deletedAt: null,
        policy: pWhere,
        OR: [
          { policyStart: null, policyEnd: null },
          {
            AND: [
              { OR: [{ policyStart: null }, { policyStart: { lte: end } }] },
              { OR: [{ policyEnd: null }, { policyEnd: { gte: start } }] },
            ],
          },
        ],
      },
      _sum: { expectedNetPremium: true },
    }),
    prisma.policyYear.count({
      where: {
        deletedAt: null,
        policy: pWhere,
        OR: [
          { policyStart: null, policyEnd: null },
          {
            AND: [
              { OR: [{ policyStart: null }, { policyStart: { lte: end } }] },
              { OR: [{ policyEnd: null }, { policyEnd: { gte: start } }] },
            ],
          },
        ],
      },
    }),
  ]);

  const expected = Number(expectedAgg._sum.expectedNetPremium ?? 0);
  const paid = Number(completedPayments._sum.amount ?? 0);
  return {
    asOfDate: asOfDate.toISOString(),
    totalPolicies,
    policyYearRowsInWindow: yearWindowCount,
    totalExpectedPremium: expected,
    totalPaidCompleted: paid,
    paymentGap: expected - paid,
  };
}

/** Renewal KPI buckets by latest policy-year end date (for dashboard pie → policies list). */
export async function getDashboardRenewalBuckets(
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
): Promise<{ asOfDate: string; buckets: RenewalBucketRow[] }> {
  const pWhere = buildPolicyReadWhere(scope, filterVillage, userId, permissions);
  const rows = await prisma.policy.findMany({
    where: pWhere,
    select: {
      years: {
        where: { deletedAt: null },
        select: { policyEnd: true },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const key of DASHBOARD_RENEWAL_PIE_KEYS) {
    counts.set(key, 0);
  }

  for (const row of rows) {
    const key = classifyPolicyRenewalBucket(
      row.years.map((y) => y.policyEnd),
      asOfDate,
    );
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const buckets: RenewalBucketRow[] = DASHBOARD_RENEWAL_PIE_KEYS.map((key) => ({
    key,
    label: renewalBucketLabel(key),
    count: counts.get(key) ?? 0,
  }));

  return { asOfDate: asOfDate.toISOString(), buckets };
}

function friendlyProductLabel(raw: string): string {
  switch (raw) {
    case "ASHA_KIRAN":
      return "Asha Kiran";
    case "FAMILY_FLOATER":
      return "Family Floater";
    case "INDIVIDUAL":
      return "Individual";
    case "UNASSIGNED":
      return "Unassigned";
    default:
      return raw || "—";
  }
}

export type DashboardChartsJson = {
  asOfDate: string;
  monthly: Array<{ year: number; month: number; monthLabel: string; premium: number }>;
  productMix: Array<{ label: string; premium: number; percent: number }>;
};

/**
 * Dashboard charts: rolling 12-month expected premium by policy-start month, and mix by AD product variant.
 */
export async function getDashboardCharts(
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
): Promise<DashboardChartsJson> {
  const scopeOnP = buildPolicyScopeSqlP(permissions, userId, scope, filterVillage);
  const buckets = await queryDashboardMonthlyPremium(prisma, { scopeOnP, asOfDate });
  const map = new Map<string, number>();
  for (const b of buckets) {
    map.set(`${Number(b.y)}-${Number(b.m)}`, decStringToNumber(b.premium));
  }
  const d = new Date(asOfDate);
  const monthly: DashboardChartsJson["monthly"] = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const premium = map.get(`${y}-${m}`) ?? 0;
    const monthShort = dt.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
    const monthLabel = `${monthShort} ${String(y).slice(-2)}`;
    monthly.push({ year: y, month: m, monthLabel, premium });
  }

  const { start, end, ageAsOf } = reportPeriodBoundsUTC(null, asOfDate);
  const mixRows = await queryPolicyMemberReport(prisma, {
    scopeOnP,
    periodStart: start,
    periodEnd: end,
    asOf: ageAsOf,
    ageAsOf,
    groupBy: "policy_type",
    categoryKeys: [],
    policyGroupings: [],
    villages: [],
    areas: [],
    sumInsureds: [],
    periodMonthTexts: [],
    policyStartMonths: [],
    policyStartYears: [],
    createdFrom: null,
    createdTo: null,
    fiscalLabels: [],
    restrictPolicyYearToAsOf: false,
  });
  const mixParsed = mixRows.map((r) => ({
    label: friendlyProductLabel(r.label),
    premium: decStringToNumber(r.sumCo),
  }));
  const totalPrem = mixParsed.reduce((s, x) => s + x.premium, 0);
  const productMix = mixParsed
    .map((x) => ({
      label: x.label,
      premium: x.premium,
      percent: totalPrem > 0 ? Math.round((x.premium / totalPrem) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.premium - a.premium);

  return { asOfDate: asOfDate.toISOString(), monthly, productMix };
}

export async function getVillageReport(
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
) {
  const scopeOnP = buildPolicyScopeSqlP(permissions, userId, scope, filterVillage);
  const [villages, payByV, ages] = await Promise.all([
    queryVillageAggregates(prisma, { scopeOnP, asOfDate }),
    queryVillagePaymentTotals(prisma, { scopeOnP }),
    queryMemberAgeBuckets(prisma, { scopeOnP, asOfDate }),
  ]);
  const payMap = new Map(
    payByV.map((p) => [p.village ?? "", Number(p.totalPaid ?? 0)]),
  );
  return {
    asOfDate: asOfDate.toISOString(),
    villages: villages.map((v) => ({
      village: v.village,
      totalPolicies: Number(v.totalPolicies),
      totalMembers: Number(v.totalMembers),
      sumExpectedPremium: v.sumExpectedPremium != null ? Number(v.sumExpectedPremium) : 0,
      totalPaid: payMap.get(v.village ?? "") ?? 0,
    })),
    ageBuckets: ages.map((a) => ({ bucket: a.bucketLabel, count: Number(a.memberCount) })),
  };
}

export type PolicyMemberReportGroupBy =
  | "village"
  | "area"
  | "policy_type"
  | "sum_insured"
  | "age"
  | "policy_grouping";

/** Preferred section order; additional keys (e.g. asha_kiran_cat, e) are appended from data. */
const PREFERRED_DRILL_CATEGORY_KEYS = ["a", "b", "c", "d", "staff", "svga"] as const;
const DRILL_GROUPING_ORDER = ["SVKK", "NVKK", "RTY", "OTHER"] as const;

function drillCategoryLabel(categoryKey: string): string {
  if (categoryKey === UNCATEGORIZED_CATEGORY_KEY) return "Uncategorized";
  if (categoryKey === "asha_kiran_cat") return "Asha Kiran";
  return `${categoryKey} category`;
}

/** Align user filter tokens (A, STAFF) with DB category keys (a, staff, asha_kiran_cat). */
function categoryKeyMatchesFilter(dbKey: string, filterToken: string): boolean {
  const f = filterToken.trim().toLowerCase();
  if (!f) return false;
  if (dbKey === UNCATEGORIZED_CATEGORY_KEY) return false;
  return dbKey === f;
}

/**
 * Build drill-down category list: preferred A–D/STAFF first, then other keys present in data
 * (e.g. asha_kiran_cat, e), then uncategorized — so section totals match the main row.
 */
export function resolveDrillCategoryKeys(
  discovered: string[],
  userCategoryFilters: string[],
): string[] {
  const pool =
    userCategoryFilters.length > 0
      ? discovered.filter((k) =>
          userCategoryFilters.some((f) => categoryKeyMatchesFilter(k, f)),
        )
      : [...discovered];

  const preferred = PREFERRED_DRILL_CATEGORY_KEYS.filter((k) => pool.includes(k));
  const rest = pool
    .filter((k) => !PREFERRED_DRILL_CATEGORY_KEYS.includes(k as (typeof PREFERRED_DRILL_CATEGORY_KEYS)[number]))
    .filter((k) => k !== UNCATEGORIZED_CATEGORY_KEY)
    .sort((a, b) => a.localeCompare(b));
  const ordered = [...preferred, ...rest];
  if (pool.includes(UNCATEGORIZED_CATEGORY_KEY)) {
    ordered.push(UNCATEGORIZED_CATEGORY_KEY);
  }
  return ordered;
}

function emptyPolicyMemberRow(label: string): PolicyMemberReportRow {
  return {
    label,
    totalPolicies: 0n,
    membersPlusPolicies: 0n,
    cntAshaKiran: 0n,
    cntFamilyFloater: 0n,
    cntIndividual: 0n,
    sumVkk: "0",
    sumCo: "0",
    sumGross: "0",
    sumComm: "0",
    sumTwoLac: "0",
    sumPolHolder: "0",
    sumGaam: "0",
    sumRefund: "0",
    sumCd: "0",
    age0_18: 0n,
    age19_35: 0n,
    age36_45: 0n,
    age46_50: 0n,
    age51_55: 0n,
    age56_60: 0n,
    age61_65: 0n,
    age65p: 0n,
  };
}

function normalizeGroupingLabel(label: string): string {
  const u = label.trim().toUpperCase();
  if (DRILL_GROUPING_ORDER.includes(u as (typeof DRILL_GROUPING_ORDER)[number])) {
    return u;
  }
  return u || "OTHER";
}

/**
 * Policy & Member report (filters + as-of). Rows are one per `groupBy` dimension; amounts are
 * for policy-years in the as-of window.
 */
export async function getPolicyMemberReport(
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
  input: {
    dateFrom: Date | null;
    dateTo: Date | null;
    villages: string[];
    areas: string[];
    sumInsureds: string[];
    groupBy: PolicyMemberReportGroupBy;
    categoryKeys: string[];
    policyGroupings: string[];
    periodMonthTexts: string[];
    policyStartMonths: number[];
    policyStartYears: number[];
    fiscalLabels: string[];
  },
) {
  const scopeOnP = buildPolicyScopeSqlP(permissions, userId, scope, undefined);
  const { start, end, ageAsOf } = reportPeriodBoundsUTC(input.dateFrom, input.dateTo);
  const usePolicyStartFilter =
    input.policyStartMonths.length > 0 && input.policyStartYears.length > 0;
  // Report period dates are for policy-year overlap; do not treat them as policy created-at when
  // drilling down from the dashboard policy-start chart.
  const createdFrom = usePolicyStartFilter
    ? null
    : input.dateFrom
      ? asOfDayBoundsUTC(input.dateFrom).start
      : null;
  const createdTo = usePolicyStartFilter
    ? null
    : input.dateFrom && input.dateTo
      ? asOfDayBoundsUTC(input.dateTo).end
      : null;
  // Dashboard policy-start drill-down: match chart (policyStart month), not overlap window only.
  const restrictPolicyYearToAsOf = input.dateFrom != null && !usePolicyStartFilter;
  const rows = await queryPolicyMemberReport(prisma, {
    scopeOnP,
    periodStart: start,
    periodEnd: end,
    asOf: ageAsOf,
    ageAsOf,
    groupBy: input.groupBy,
    categoryKeys: input.categoryKeys,
    policyGroupings: input.policyGroupings,
    villages: input.villages,
    areas: input.areas,
    sumInsureds: input.sumInsureds,
    periodMonthTexts: usePolicyStartFilter ? [] : input.periodMonthTexts,
    policyStartMonths: input.policyStartMonths,
    policyStartYears: input.policyStartYears,
    createdFrom,
    createdTo,
    fiscalLabels: usePolicyStartFilter ? [] : input.fiscalLabels,
    restrictPolicyYearToAsOf,
  });
  const orderedRows =
    input.groupBy === "sum_insured"
      ? [...rows].sort((a, b) => sumInsuredSortKey(a.label) - sumInsuredSortKey(b.label))
      : rows;
  const sumInsuredLabels =
    input.groupBy === "sum_insured" ? await loadSumInsuredLabelMap() : null;
  const jsonRows = orderedRows.map((r) => {
    const row = toPolicyMemberJsonRow(r);
    if (sumInsuredLabels) {
      row.label = resolveSumInsuredLabel(r.label, sumInsuredLabels);
    }
    if (!hasPermissionInSet(permissions, "policy:commission")) {
      row.sumComm = 0;
    }
    return row;
  });
  return {
    dateFrom: input.dateFrom?.toISOString() ?? null,
    dateTo: (input.dateTo ?? input.dateFrom ?? new Date()).toISOString(),
    groupBy: input.groupBy,
    rows: jsonRows,
  };
}

/**
 * Drill-down for village/area row click: one table per category (A–D, STAFF),
 * rows = policy grouping (SVKK, NVKK, RTY, OTHER).
 */
export async function getPolicyMemberReportDetail(
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
  input: {
    drillVillage: string | null;
    drillArea: string | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    categoryKeys: string[];
    policyGroupings: string[];
    sumInsureds: string[];
    periodMonthTexts: string[];
    policyStartMonths: number[];
    policyStartYears: number[];
    fiscalLabels: string[];
  },
) {
  const village = input.drillVillage?.trim() || null;
  const area = input.drillArea?.trim() || null;
  if (!village && !area) {
    throw new Error("drillVillage or drillArea is required");
  }
  if (village && area) {
    throw new Error("Provide only one of drillVillage or drillArea");
  }

  const scopeOnP = buildPolicyScopeSqlP(permissions, userId, scope, undefined);
  const { start, end, ageAsOf } = reportPeriodBoundsUTC(input.dateFrom, input.dateTo);
  const usePolicyStartFilter =
    input.policyStartMonths.length > 0 && input.policyStartYears.length > 0;
  const createdFrom = usePolicyStartFilter
    ? null
    : input.dateFrom
      ? asOfDayBoundsUTC(input.dateFrom).start
      : null;
  const createdTo = usePolicyStartFilter
    ? null
    : input.dateFrom && input.dateTo
      ? asOfDayBoundsUTC(input.dateTo).end
      : null;
  const restrictPolicyYearToAsOf = input.dateFrom != null && !usePolicyStartFilter;

  const baseQuery = {
    scopeOnP,
    periodStart: start,
    periodEnd: end,
    asOf: ageAsOf,
    ageAsOf,
    groupBy: "policy_grouping" as const,
    policyGroupings: input.policyGroupings,
    villages: village ? [village] : [],
    areas: area ? [area] : [],
    sumInsureds: input.sumInsureds,
    periodMonthTexts: usePolicyStartFilter ? [] : input.periodMonthTexts,
    policyStartMonths: input.policyStartMonths,
    policyStartYears: input.policyStartYears,
    createdFrom,
    createdTo,
    fiscalLabels: usePolicyStartFilter ? [] : input.fiscalLabels,
    restrictPolicyYearToAsOf,
  };

  const discovered = await queryDistinctPolicyCategoryKeys(prisma, baseQuery);
  const categories = resolveDrillCategoryKeys(discovered, input.categoryKeys);

  const sections: Array<{
    categoryKey: string;
    categoryLabel: string;
    rows: ReturnType<typeof toPolicyMemberJsonRow>[];
  }> = [];

  for (const categoryKey of categories) {
    const raw = await queryPolicyMemberReport(prisma, {
      ...baseQuery,
      categoryKeys: [categoryKey],
    });
    const byGrouping = new Map(
      raw.map((r) => [normalizeGroupingLabel(r.label), r]),
    );
    const rows = DRILL_GROUPING_ORDER.map((g) => {
      const hit = byGrouping.get(g);
      return toPolicyMemberJsonRow(hit ?? emptyPolicyMemberRow(g));
    });
    sections.push({
      categoryKey,
      categoryLabel: drillCategoryLabel(categoryKey),
      rows,
    });
  }

  const drillType = village ? ("village" as const) : ("area" as const);
  const drillLabel = village ?? area ?? "—";

  return {
    dateFrom: input.dateFrom?.toISOString() ?? null,
    dateTo: (input.dateTo ?? input.dateFrom ?? new Date()).toISOString(),
    drillType,
    drillLabel,
    sections,
  };
}
