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
    hasPermissionInSet(permissions, "mis:claim:scope_all")
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
    return Prisma.sql` AND (
      (${sqlCol("p", "categoryId")} IS NULL OR cat.id IS NULL)
      AND (c.\`categoryText\` IS NULL OR TRIM(c.\`categoryText\`) = '')
    )`;
  }
  return Prisma.sql` AND (
    LOWER(${sqlAliasCol("cat", "key")}) IN (${Prisma.join(
      categoryKeys.map((k) => Prisma.sql`LOWER(${sqlParamUtf8(k)})`),
    )})
    OR LOWER(${sqlAliasCol("c", "categoryText")}) IN (${Prisma.join(
      categoryKeys.map((k) => Prisma.sql`LOWER(${sqlParamUtf8(k)})`),
    )})
  )`;
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

/**
 * Cashless test for a lodge-type column expression.
 * Matches "cashless"/"cash less" but excludes "non cash less"/"non-cash" so
 * reimbursement rows (e.g. "Non Cash Less") are not miscounted as cashless.
 */
function cashlessFromExpr(expr: Prisma.Sql): Prisma.Sql {
  const lo = Prisma.sql`LOWER(COALESCE(${expr}, ''))`;
  return Prisma.sql`(
    (${lo} LIKE '%cashless%' OR ${lo} LIKE '%cash less%')
    AND ${lo} NOT LIKE '%non cashless%'
    AND ${lo} NOT LIKE '%non cash less%'
    AND ${lo} NOT LIKE '%non-cash%'
  )`;
}

/**
 * Prefer the definitive `Actual Lodge Type` classifier; fall back to
 * `Claim LodgeType` only when Actual Lodge Type is blank.
 */
function isCashlessSql(): Prisma.Sql {
  const actual = sqlAliasCol("c", "actualLodgeType");
  const claimType = sqlAliasCol("c", "claimType");
  return Prisma.sql`(
    (COALESCE(${actual}, '') <> '' AND ${cashlessFromExpr(actual)})
    OR (COALESCE(${actual}, '') = '' AND ${cashlessFromExpr(claimType)})
  )`;
}

function isDeniedSql(): Prisma.Sql {
  return Prisma.sql`(
    c.status = 'REJECTED'
    OR LOWER(COALESCE(${sqlAliasCol("c", "statusText")}, '')) LIKE '%denied%'
    OR LOWER(COALESCE(${sqlAliasCol("c", "statusText")}, '')) LIKE '%reject%'
    OR LOWER(COALESCE(${sqlAliasCol("c", "statusText")}, '')) LIKE '%repudiat%'
    OR LOWER(COALESCE(${sqlAliasCol("c", "statusText")}, '')) LIKE '%close%'
  )`;
}

function categoryLabelSql(): Prisma.Sql {
  return Prisma.sql`UPPER(COALESCE(
    NULLIF(TRIM(${sqlAliasCol("c", "categoryText")}), ''),
    ${sqlAliasCol("cat", "key")},
    ${sqlParamUtf8("OTHER")}
  ))`;
}

export type ClaimCategorySummaryRow = {
  category: string;
  cashNo: bigint;
  cashLodge: string | null;
  cashSettled: string | null;
  reimNo: bigint;
  reimLodge: string | null;
  reimSettled: string | null;
  cashDeniedNo: bigint;
  cashDeniedLodge: string | null;
  remDeniedNo: bigint;
  remDeniedLodge: string | null;
  totalNo: bigint;
  totalLodge: string | null;
  totalSettled: string | null;
  totalDeduction: string | null;
};

/** Category A/B/C/D matrix with cashless/reimbursement/denied breakdown. */
export async function queryClaimCategorySummary(
  prisma: PrismaClient,
  args: {
    scopeSql: Prisma.Sql;
    filters: ClaimReportFilters;
  },
): Promise<ClaimCategorySummaryRow[]> {
  const cat = categoryLabelSql();
  const cash = isCashlessSql();
  const denied = isDeniedSql();
  return prisma.$queryRaw<ClaimCategorySummaryRow[]>`
    SELECT
      ${cat} AS category,
      SUM(CASE WHEN ${cash} AND NOT (${denied}) THEN 1 ELSE 0 END) AS cashNo,
      COALESCE(SUM(CASE WHEN ${cash} AND NOT (${denied}) THEN ${sqlCol("c", "claimAmount")} ELSE 0 END), 0) AS cashLodge,
      COALESCE(SUM(CASE WHEN ${cash} AND NOT (${denied}) THEN ${sqlCol("c", "approvedAmount")} ELSE 0 END), 0) AS cashSettled,
      SUM(CASE WHEN NOT (${cash}) AND NOT (${denied}) THEN 1 ELSE 0 END) AS reimNo,
      COALESCE(SUM(CASE WHEN NOT (${cash}) AND NOT (${denied}) THEN ${sqlCol("c", "claimAmount")} ELSE 0 END), 0) AS reimLodge,
      COALESCE(SUM(CASE WHEN NOT (${cash}) AND NOT (${denied}) THEN ${sqlCol("c", "approvedAmount")} ELSE 0 END), 0) AS reimSettled,
      SUM(CASE WHEN ${cash} AND ${denied} THEN 1 ELSE 0 END) AS cashDeniedNo,
      COALESCE(SUM(CASE WHEN ${cash} AND ${denied} THEN ${sqlCol("c", "claimAmount")} ELSE 0 END), 0) AS cashDeniedLodge,
      SUM(CASE WHEN NOT (${cash}) AND ${denied} THEN 1 ELSE 0 END) AS remDeniedNo,
      COALESCE(SUM(CASE WHEN NOT (${cash}) AND ${denied} THEN ${sqlCol("c", "claimAmount")} ELSE 0 END), 0) AS remDeniedLodge,
      COUNT(${sqlCol("c", "id")}) AS totalNo,
      COALESCE(SUM(${sqlCol("c", "claimAmount")}), 0) AS totalLodge,
      COALESCE(SUM(${sqlCol("c", "approvedAmount")}), 0) AS totalSettled,
      COALESCE(SUM(${sqlCol("c", "deductionAmount")}), 0) AS totalDeduction
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON ${sqlCol("c", "policyId")} = ${sqlCol("p", "id")} AND ${sqlCol("p", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON ${sqlCol("c", "policyYearId")} = ${sqlCol("py", "id")} AND ${sqlCol("py", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON ${sqlCol("p", "categoryId")} = cat.id
    WHERE ${args.scopeSql}
    ${dateFilterSql(args.filters)}
    ${matchStatusFilter(args.filters)}
    ${policySideFiltersSql(args.filters)}
    GROUP BY category
    ORDER BY category ASC
  `;
}

export function claimCategorySummaryRowToJson(r: ClaimCategorySummaryRow) {
  return {
    category: r.category,
    cashNo: Number(r.cashNo),
    cashLodge: Number(r.cashLodge ?? 0),
    cashSettled: Number(r.cashSettled ?? 0),
    reimNo: Number(r.reimNo),
    reimLodge: Number(r.reimLodge ?? 0),
    reimSettled: Number(r.reimSettled ?? 0),
    cashDeniedNo: Number(r.cashDeniedNo),
    cashDeniedLodge: Number(r.cashDeniedLodge ?? 0),
    remDeniedNo: Number(r.remDeniedNo),
    remDeniedLodge: Number(r.remDeniedLodge ?? 0),
    totalNo: Number(r.totalNo),
    totalLodge: Number(r.totalLodge ?? 0),
    totalSettled: Number(r.totalSettled ?? 0),
    totalDeduction: Number(r.totalDeduction ?? 0),
  };
}

export type ClaimFieldReportRow = {
  svkkPublicId: string;
  policyTypeText: string | null;
  policyHolderName: string | null;
  patientName: string | null;
  patientGender: string | null;
  categoryText: string | null;
  village: string | null;
  insuranceCompany: string | null;
  hospitalName: string | null;
  hospitalArea: string | null;
  illness: string | null;
  diseaseCategory: string | null;
  treatmentType: string | null;
  claimType: string | null;
  actualLodgeType: string | null;
  statusText: string | null;
  policyYear: string;
  networkType: string | null;
  roomCategory: string | null;
  claimAmount: string | null;
  reportedLodgeAmount: string | null;
  approvedAmount: string | null;
  deductionAmount: string | null;
  discountAmount: string | null;
  claimReceivedDate: Date | null;
  admissionDate: Date | null;
  dischargeDate: Date | null;
};

const FIELD_REPORT_MAX_ROWS = 50_000;

/** Fetch claim rows for field-wise MIS reports. */
export async function queryClaimsForFieldReports(
  prisma: PrismaClient,
  args: {
    scopeSql: Prisma.Sql;
    filters: ClaimReportFilters;
  },
): Promise<ClaimFieldReportRow[]> {
  return prisma.$queryRaw<ClaimFieldReportRow[]>`
    SELECT
      c.svkkPublicId,
      c.policyTypeText,
      c.policyHolderName,
      c.patientName,
      c.patientGender,
      c.categoryText,
      c.village,
      c.insuranceCompany,
      c.hospitalName,
      c.hospitalArea,
      c.illness,
      c.diseaseCategory,
      c.treatmentType,
      c.claimType,
      c.actualLodgeType,
      c.statusText,
      c.policyYear,
      c.networkType,
      c.roomCategory,
      CAST(c.claimAmount AS CHAR) AS claimAmount,
      CAST(c.reportedLodgeAmount AS CHAR) AS reportedLodgeAmount,
      CAST(c.approvedAmount AS CHAR) AS approvedAmount,
      CAST(c.deductionAmount AS CHAR) AS deductionAmount,
      CAST(c.discountAmount AS CHAR) AS discountAmount,
      c.claimReceivedDate,
      c.admissionDate,
      c.dischargeDate
    FROM ${sqlTable("claim")} c
    LEFT JOIN ${sqlTable("policy")} p ON ${sqlCol("c", "policyId")} = ${sqlCol("p", "id")} AND ${sqlCol("p", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("policyYear")} py ON ${sqlCol("c", "policyYearId")} = ${sqlCol("py", "id")} AND ${sqlCol("py", "deletedAt")} IS NULL
    LEFT JOIN ${sqlTable("category")} cat ON ${sqlCol("p", "categoryId")} = cat.id
    WHERE ${args.scopeSql}
    ${dateFilterSql(args.filters)}
    ${matchStatusFilter(args.filters)}
    ${policySideFiltersSql(args.filters)}
    LIMIT ${FIELD_REPORT_MAX_ROWS}
  `;
}
