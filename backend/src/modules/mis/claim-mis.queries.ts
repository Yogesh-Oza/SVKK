import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { sqlCol, sqlTable } from "../../lib/sql-tables.js";
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

const UTF8_COLLATE = "utf8mb4_unicode_ci";

/** Qualified column normalized to utf8mb4 (handles legacy armscii8/latin1 tables). */
function sqlAliasCol(alias: string, column: string): Prisma.Sql {
  return Prisma.raw(`CONVERT(${alias}.\`${column}\` USING utf8mb4) COLLATE ${UTF8_COLLATE}`);
}

/** Arbitrary SQL fragment normalized to utf8mb4. */
function sqlExprUtf8Ci(expr: string): Prisma.Sql {
  return Prisma.raw(`CONVERT((${expr}) USING utf8mb4) COLLATE ${UTF8_COLLATE}`);
}

/** Bind parameter with the same collation as utf8mb4_unicode_ci columns. */
function sqlParamUtf8(value: string): Prisma.Sql {
  return Prisma.sql`CAST(${value} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci`;
}

/** JOIN … ON with mixed utf8mb4 collations (e.g. policy.policyTypeId vs policytype.id). */
function sqlJoinEqUtf8(leftExpr: string, rightExpr: string): Prisma.Sql {
  return Prisma.sql`${sqlExprUtf8Ci(leftExpr)} = ${sqlExprUtf8Ci(rightExpr)}`;
}

function joinPolicyTypeSql(): Prisma.Sql {
  return Prisma.sql`LEFT JOIN ${sqlTable("policyType")} pt ON ${sqlJoinEqUtf8("p.`policyTypeId`", "pt.`id`")}`;
}

function claimVillageExpr(): Prisma.Sql {
  return Prisma.sql`COALESCE(${sqlAliasCol("c", "village")}, ${sqlAliasCol("p", "village")})`;
}

function villageEquals(village: string): Prisma.Sql {
  return Prisma.sql`(${claimVillageExpr()} = ${sqlParamUtf8(village)})`;
}

function villageIn(villages: string[]): Prisma.Sql {
  return Prisma.sql`(${claimVillageExpr()} IN (${sqlInListUtf8(villages)}))`;
}

function sqlInListUtf8(values: string[]): Prisma.Sql {
  if (!values.length) return Prisma.sql`1 = 0`;
  return Prisma.join(values.map((v) => sqlParamUtf8(v)));
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
    parts.push(Prisma.sql`${sqlAliasCol("p", "area")} IN (${sqlInListUtf8(areaValues)})`);
  }
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`1=0`;
}

function claimActivityDateExpr(): Prisma.Sql {
  return Prisma.sql`COALESCE(${sqlCol("c", "claimReceivedDate")}, ${sqlCol("c", "admissionDate")}, ${sqlCol("c", "createdAt")})`;
}

function dateFilterSql(filters: ClaimReportFilters): Prisma.Sql {
  const dateExpr = claimActivityDateExpr();
  if (filters.dateFrom && filters.dateTo) {
    return Prisma.sql`AND ${dateExpr} >= ${filters.dateFrom} AND ${dateExpr} <= ${filters.dateTo}`;
  }
  if (filters.dateFrom) {
    return Prisma.sql`AND ${dateExpr} >= ${filters.dateFrom}`;
  }
  if (filters.dateTo) {
    return Prisma.sql`AND ${dateExpr} <= ${filters.dateTo}`;
  }
  return Prisma.sql``;
}

function matchStatusFilter(filters: ClaimReportFilters): Prisma.Sql {
  if (!filters.matchStatus) return Prisma.sql``;
  return Prisma.sql`AND ${sqlExprUtf8Ci("CAST(c.`matchStatus` AS CHAR)")} = ${sqlParamUtf8(filters.matchStatus)}`;
}

function categoryKeysFilterSql(categoryKeys: string[]): Prisma.Sql {
  if (!categoryKeys.length) return Prisma.empty;
  if (categoryKeys.length === 1 && categoryKeys[0] === UNCATEGORIZED_CATEGORY_KEY) {
    return Prisma.sql` AND (${sqlCol("p", "categoryId")} IS NULL OR cat.id IS NULL)`;
  }
  return Prisma.sql` AND LOWER(${sqlAliasCol("cat", "key")}) IN (${Prisma.join(
    categoryKeys.map((k) => Prisma.sql`LOWER(${sqlParamUtf8(k)})`),
  )})`;
}

function policyGroupingsFilterSql(groupings: string[]): Prisma.Sql {
  if (!groupings.length) return Prisma.empty;
  return Prisma.sql` AND ${sqlAliasCol("p", "policyGrouping")} IN (${sqlInListUtf8(groupings)})`;
}

function areasFilterSql(areas: string[]): Prisma.Sql {
  if (!areas.length) return Prisma.empty;
  return Prisma.sql` AND ${sqlAliasCol("p", "area")} IN (${sqlInListUtf8(areas)})`;
}

function sumInsuredsFilterSql(sumInsureds: string[]): Prisma.Sql {
  if (!sumInsureds.length) return Prisma.empty;
  const amounts = sumInsureds
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!amounts.length) return Prisma.empty;
  return Prisma.sql` AND COALESCE(${sqlCol("py", "sumInsured")}, ${sqlCol("c", "sumInsured")}) IN (${Prisma.join(amounts)})`;
}

function periodMonthTextsFilterSql(periodMonthTexts: string[]): Prisma.Sql {
  if (!periodMonthTexts.length) return Prisma.empty;
  const variants = expandPeriodMonthTextVariants(periodMonthTexts);
  if (!variants.length) return Prisma.empty;
  return Prisma.sql` AND ${sqlAliasCol("p", "periodMonthText")} IN (${sqlInListUtf8(variants)})`;
}

function fiscalLabelsFilterSql(fiscalLabels: string[]): Prisma.Sql {
  if (!fiscalLabels.length) return Prisma.empty;
  return Prisma.sql` AND (
    ${sqlAliasCol("p", "periodYearText")} IN (${sqlInListUtf8(fiscalLabels)})
    OR ${sqlAliasCol("py", "yearLabel")} IN (${sqlInListUtf8(fiscalLabels)})
    OR ${sqlAliasCol("c", "policyYear")} IN (${sqlInListUtf8(fiscalLabels)})
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
  const dash = sqlParamUtf8("—");
  switch (groupBy) {
    case "category":
      return Prisma.sql`COALESCE(${sqlAliasCol("cat", "key")}, ${sqlParamUtf8("uncategorized")})`;
    case "village":
      return Prisma.sql`COALESCE(${sqlAliasCol("c", "village")}, ${sqlAliasCol("p", "village")}, ${dash})`;
    case "sum_insured":
      return Prisma.sql`COALESCE(${sqlExprUtf8Ci("CAST(py.`sumInsured` AS CHAR)")}, ${sqlExprUtf8Ci("CAST(c.`sumInsured` AS CHAR)")}, ${dash})`;
    case "policy_type":
      return Prisma.sql`COALESCE(${sqlAliasCol("pt", "name")}, ${sqlAliasCol("c", "policyTypeText")}, ${dash})`;
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
      COUNT(${sqlCol("c", "id")}) AS claimCount,
      COALESCE(SUM(${sqlCol("c", "claimAmount")}), 0) AS sumClaimAmount,
      COALESCE(SUM(${sqlCol("c", "approvedAmount")}), 0) AS sumApprovedAmount,
      COALESCE(SUM(${sqlCol("c", "deductionAmount")}), 0) AS sumDeductionAmount
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON ${sqlCol("c", "policyId")} = ${sqlCol("p", "id")} AND ${sqlCol("p", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON ${sqlCol("c", "policyYearId")} = ${sqlCol("py", "id")} AND ${sqlCol("py", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON ${sqlCol("p", "categoryId")} = cat.id
    ${joinPolicyTypeSql()}
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
  const dateExpr = claimActivityDateExpr();
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
      COUNT(${sqlCol("c", "id")}) AS claimCount,
      COALESCE(SUM(${sqlCol("c", "claimAmount")}), 0) AS sumClaimAmount,
      COALESCE(SUM(${sqlCol("c", "approvedAmount")}), 0) AS sumApprovedAmount,
      COALESCE(SUM(${sqlCol("c", "deductionAmount")}), 0) AS sumDeductionAmount
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON ${sqlCol("c", "policyId")} = ${sqlCol("p", "id")} AND ${sqlCol("p", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON ${sqlCol("c", "policyYearId")} = ${sqlCol("py", "id")} AND ${sqlCol("py", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON ${sqlCol("p", "categoryId")} = cat.id
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
      COUNT(${sqlCol("c", "id")}) AS claimCount,
      COALESCE(SUM(${sqlCol("c", "claimAmount")}), 0) AS sumClaimAmount,
      COALESCE(SUM(${sqlCol("c", "approvedAmount")}), 0) AS sumApprovedAmount,
      COALESCE(SUM(${sqlCol("c", "deductionAmount")}), 0) AS sumDeductionAmount
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON ${sqlCol("c", "policyId")} = ${sqlCol("p", "id")} AND ${sqlCol("p", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON ${sqlCol("c", "policyYearId")} = ${sqlCol("py", "id")} AND ${sqlCol("py", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON ${sqlCol("p", "categoryId")} = cat.id
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
