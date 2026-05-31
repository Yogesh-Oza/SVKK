import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { sqlTable } from "../../lib/sql-tables.js";
import type { GeoScope } from "../../services/mis-scope.service.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";
import { expandPeriodMonthTextVariants } from "../policy/policy.list.js";
import { UNCATEGORIZED_CATEGORY_KEY } from "./mis.queries.js";

export type ClaimReportRow = {
  label: string;
  claimCount: bigint;
  sumClaimAmount: string | null;
  sumApprovedAmount: string | null;
  sumDeductionAmount: string | null;
};

export type ClaimReportFilters = {
  dateFrom: Date | null;
  dateTo: Date | null;
  villages: string[];
  matchStatus?: string;
  categoryKeys: string[];
  policyGroupings: string[];
  areas: string[];
  sumInsureds: string[];
  periodMonthTexts: string[];
  fiscalLabels: string[];
};

/** Avoid MySQL 1267 when claim/policy string columns use different collations than bind params. */
function sqlUtf8Ci(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${expr} COLLATE utf8mb4_unicode_ci`;
}

function claimVillageExpr(): Prisma.Sql {
  return Prisma.sql`COALESCE(${sqlUtf8Ci(Prisma.sql`c.village`)}, ${sqlUtf8Ci(Prisma.sql`p.village`)})`;
}

function villageEquals(village: string): Prisma.Sql {
  return Prisma.sql`(${claimVillageExpr()} = ${village})`;
}

function villageIn(villages: string[]): Prisma.Sql {
  return Prisma.sql`(${claimVillageExpr()} IN (${sqlInList(villages)}))`;
}

function sqlInList(values: string[]): Prisma.Sql {
  if (!values.length) return Prisma.sql`1 = 0`;
  return Prisma.join(values.map((v) => Prisma.sql`${v}`));
}

/** Build claim scope SQL for alias `c`. */
export function buildClaimScopeSqlC(
  permissions: Set<string>,
  scope: GeoScope,
  filterVillages: string[],
): Prisma.Sql {
  if (
    hasPermissionInSet(permissions, "claim:scope_all") ||
    hasPermissionInSet(permissions, "mis:scope_all")
  ) {
    if (filterVillages.length === 1) {
      return villageEquals(filterVillages[0]!);
    }
    if (filterVillages.length > 1) {
      return villageIn(filterVillages);
    }
    return Prisma.sql`1=1`;
  }

  if (scope.kind === "full") {
    if (filterVillages.length === 1) {
      return villageEquals(filterVillages[0]!);
    }
    if (filterVillages.length > 1) {
      return villageIn(filterVillages);
    }
    return Prisma.sql`1=1`;
  }

  const { villageValues, areaValues } = scope;
  if (villageValues.length === 0 && areaValues.length === 0) {
    return Prisma.sql`1=0`;
  }

  const parts: Prisma.Sql[] = [];
  if (villageValues.length > 0) {
    const villages = filterVillages.length
      ? filterVillages.filter((v) => villageValues.includes(v))
      : villageValues;
    if (villages.length) {
      parts.push(villageIn(villages));
    }
  }
  if (areaValues.length > 0) {
    parts.push(Prisma.sql`${sqlUtf8Ci(Prisma.sql`p.area`)} IN (${sqlInList(areaValues)})`);
  }
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`1=0`;
}

function dateFilterSql(filters: ClaimReportFilters): Prisma.Sql {
  if (filters.dateFrom && filters.dateTo) {
    return Prisma.sql`AND COALESCE(c.claimReceivedDate, c.admissionDate, c.createdAt) >= ${filters.dateFrom} AND COALESCE(c.claimReceivedDate, c.admissionDate, c.createdAt) <= ${filters.dateTo}`;
  }
  if (filters.dateFrom) {
    return Prisma.sql`AND COALESCE(c.claimReceivedDate, c.admissionDate, c.createdAt) >= ${filters.dateFrom}`;
  }
  if (filters.dateTo) {
    return Prisma.sql`AND COALESCE(c.claimReceivedDate, c.admissionDate, c.createdAt) <= ${filters.dateTo}`;
  }
  return Prisma.sql``;
}

function matchStatusFilter(filters: ClaimReportFilters): Prisma.Sql {
  if (!filters.matchStatus) return Prisma.sql``;
  return Prisma.sql`AND ${sqlUtf8Ci(Prisma.sql`CAST(c.matchStatus AS CHAR)`)} = ${filters.matchStatus}`;
}

function categoryKeysFilterSql(categoryKeys: string[]): Prisma.Sql {
  if (!categoryKeys.length) return Prisma.empty;
  if (categoryKeys.length === 1 && categoryKeys[0] === UNCATEGORIZED_CATEGORY_KEY) {
    return Prisma.sql` AND (p.categoryId IS NULL OR cat.id IS NULL)`;
  }
  return Prisma.sql` AND LOWER(cat.key) IN (${Prisma.join(
    categoryKeys.map((k) => Prisma.sql`LOWER(${k})`),
  )})`;
}

function policyGroupingsFilterSql(groupings: string[]): Prisma.Sql {
  if (!groupings.length) return Prisma.empty;
  return Prisma.sql` AND ${sqlUtf8Ci(Prisma.sql`p.policyGrouping`)} IN (${Prisma.join(groupings)})`;
}

function areasFilterSql(areas: string[]): Prisma.Sql {
  if (!areas.length) return Prisma.empty;
  return Prisma.sql` AND ${sqlUtf8Ci(Prisma.sql`p.area`)} IN (${Prisma.join(areas)})`;
}

function sumInsuredsFilterSql(sumInsureds: string[]): Prisma.Sql {
  if (!sumInsureds.length) return Prisma.empty;
  const amounts = sumInsureds
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!amounts.length) return Prisma.empty;
  return Prisma.sql` AND COALESCE(py.sumInsured, c.sumInsured) IN (${Prisma.join(amounts)})`;
}

function periodMonthTextsFilterSql(periodMonthTexts: string[]): Prisma.Sql {
  if (!periodMonthTexts.length) return Prisma.empty;
  const variants = expandPeriodMonthTextVariants(periodMonthTexts);
  if (!variants.length) return Prisma.empty;
  return Prisma.sql` AND ${sqlUtf8Ci(Prisma.sql`p.periodMonthText`)} IN (${Prisma.join(variants)})`;
}

function fiscalLabelsFilterSql(fiscalLabels: string[]): Prisma.Sql {
  if (!fiscalLabels.length) return Prisma.empty;
  return Prisma.sql` AND (
    ${sqlUtf8Ci(Prisma.sql`p.periodYearText`)} IN (${Prisma.join(fiscalLabels)})
    OR ${sqlUtf8Ci(Prisma.sql`py.yearLabel`)} IN (${Prisma.join(fiscalLabels)})
    OR ${sqlUtf8Ci(Prisma.sql`c.policyYear`)} IN (${Prisma.join(fiscalLabels)})
  )`;
}

function policySideFiltersSql(filters: ClaimReportFilters): Prisma.Sql {
  return Prisma.join(
    [
      categoryKeysFilterSql(filters.categoryKeys),
      policyGroupingsFilterSql(filters.policyGroupings),
      areasFilterSql(filters.areas),
      sumInsuredsFilterSql(filters.sumInsureds),
      periodMonthTextsFilterSql(filters.periodMonthTexts),
      fiscalLabelsFilterSql(filters.fiscalLabels),
    ],
    "",
  );
}

type GroupDimension = "category" | "village" | "sum_insured" | "policy_type";

function groupLabelSql(groupBy: GroupDimension): Prisma.Sql {
  switch (groupBy) {
    case "category":
      return Prisma.sql`COALESCE(cat.key, 'uncategorized')`;
    case "village":
      return Prisma.sql`COALESCE(${sqlUtf8Ci(Prisma.sql`c.village`)}, ${sqlUtf8Ci(Prisma.sql`p.village`)}, '—')`;
    case "sum_insured":
      return Prisma.sql`COALESCE(CAST(py.sumInsured AS CHAR), CAST(c.sumInsured AS CHAR), '—')`;
    case "policy_type":
      return Prisma.sql`COALESCE(${sqlUtf8Ci(Prisma.sql`pt.name`)}, ${sqlUtf8Ci(Prisma.sql`c.policyTypeText`)}, '—')`;
  }
}

/** Aggregate claims by dimension for Claim MIS report. */
export async function queryClaimReport(
  prisma: PrismaClient,
  args: {
    scopeSql: Prisma.Sql;
    filters: ClaimReportFilters;
    groupBy: GroupDimension;
  },
): Promise<ClaimReportRow[]> {
  const label = groupLabelSql(args.groupBy);
  return prisma.$queryRaw<ClaimReportRow[]>`
    SELECT
      ${label} AS label,
      COUNT(c.id) AS claimCount,
      COALESCE(SUM(c.claimAmount), 0) AS sumClaimAmount,
      COALESCE(SUM(c.approvedAmount), 0) AS sumApprovedAmount,
      COALESCE(SUM(c.deductionAmount), 0) AS sumDeductionAmount
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON c.policyYearId = py.id AND py.deletedAt IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON p.categoryId = cat.id
    LEFT JOIN ${sqlTable("policyType")} pt ON p.policyTypeId = pt.id
    WHERE ${args.scopeSql}
    ${dateFilterSql(args.filters)}
    ${matchStatusFilter(args.filters)}
    ${policySideFiltersSql(args.filters)}
    GROUP BY label
    ORDER BY label ASC
  `;
}

export type ClaimTrendPeriod = "month" | "quarter" | "year";

function trendLabelSql(period: ClaimTrendPeriod): Prisma.Sql {
  const dateExpr = Prisma.sql`COALESCE(c.claimReceivedDate, c.admissionDate, c.createdAt)`;
  switch (period) {
    case "month":
      return Prisma.sql`DATE_FORMAT(${dateExpr}, '%Y-%m')`;
    case "quarter":
      return Prisma.sql`CONCAT(YEAR(${dateExpr}), '-Q', QUARTER(${dateExpr}))`;
    case "year":
      return Prisma.sql`CAST(YEAR(${dateExpr}) AS CHAR)`;
  }
}

/** Aggregate claims over time for trend MIS. */
export async function queryClaimTrend(
  prisma: PrismaClient,
  args: {
    scopeSql: Prisma.Sql;
    filters: ClaimReportFilters;
    period: ClaimTrendPeriod;
  },
): Promise<ClaimReportRow[]> {
  const label = trendLabelSql(args.period);
  return prisma.$queryRaw<ClaimReportRow[]>`
    SELECT
      ${label} AS label,
      COUNT(c.id) AS claimCount,
      COALESCE(SUM(c.claimAmount), 0) AS sumClaimAmount,
      COALESCE(SUM(c.approvedAmount), 0) AS sumApprovedAmount,
      COALESCE(SUM(c.deductionAmount), 0) AS sumDeductionAmount
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON c.policyYearId = py.id AND py.deletedAt IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON p.categoryId = cat.id
    WHERE ${args.scopeSql}
    ${dateFilterSql(args.filters)}
    ${matchStatusFilter(args.filters)}
    ${policySideFiltersSql(args.filters)}
    GROUP BY label
    ORDER BY label ASC
  `;
}

export type ClaimDashboardTotalsRow = {
  claimCount: bigint;
  sumClaimAmount: string | null;
  sumApprovedAmount: string | null;
  sumDeductionAmount: string | null;
};

/** Single-row claim totals for dashboard KPI cards (same filters as Claim MIS). */
export async function queryDashboardClaimTotals(
  prisma: PrismaClient,
  args: {
    scopeSql: Prisma.Sql;
    filters: ClaimReportFilters;
  },
): Promise<ClaimDashboardTotalsRow> {
  const rows = await prisma.$queryRaw<ClaimDashboardTotalsRow[]>`
    SELECT
      COUNT(c.id) AS claimCount,
      COALESCE(SUM(c.claimAmount), 0) AS sumClaimAmount,
      COALESCE(SUM(c.approvedAmount), 0) AS sumApprovedAmount,
      COALESCE(SUM(c.deductionAmount), 0) AS sumDeductionAmount
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON c.policyId = p.id AND p.deletedAt IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON c.policyYearId = py.id AND py.deletedAt IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON p.categoryId = cat.id
    WHERE ${args.scopeSql}
    ${dateFilterSql(args.filters)}
    ${matchStatusFilter(args.filters)}
    ${policySideFiltersSql(args.filters)}
  `;
  const row = rows[0];
  return (
    row ?? {
      claimCount: BigInt(0),
      sumClaimAmount: "0",
      sumApprovedAmount: "0",
      sumDeductionAmount: "0",
    }
  );
}

/** Convert raw claim report row to JSON-friendly numbers. */
export function claimReportRowToJson(r: ClaimReportRow) {
  return {
    label: r.label,
    claimCount: Number(r.claimCount),
    sumClaimAmount: Number(r.sumClaimAmount ?? 0),
    sumApprovedAmount: Number(r.sumApprovedAmount ?? 0),
    sumDeductionAmount: Number(r.sumDeductionAmount ?? 0),
  };
}
