import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/**
 * Inclusive day bounds in UTC for `asOfDate` (calendar date, UTC).
 */
export function asOfDayBoundsUTC(asOfDate: Date): { start: Date; end: Date } {
  const d = new Date(asOfDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
  return { start, end };
}

/** Policy-year overlap window and age-as-of date from optional created-date range. */
export function reportPeriodBoundsUTC(
  dateFrom: Date | null,
  dateTo: Date | null,
): { start: Date; end: Date; ageAsOf: Date } {
  const endAnchor = dateTo ?? dateFrom ?? new Date();
  const { end } = asOfDayBoundsUTC(endAnchor);
  if (dateFrom) {
    const { start } = asOfDayBoundsUTC(dateFrom);
    return { start, end, ageAsOf: endAnchor };
  }
  const single = asOfDayBoundsUTC(endAnchor);
  return { start: single.start, end: single.end, ageAsOf: endAnchor };
}

/**
 * Policy year is in the MIS as-of window when:
 * - start/end dates overlap the report day, OR
 * - both dates are unset (common on AD data entry), OR
 * - `yearLabel` is a fiscal label (e.g. 2026-27) whose Apr–Mar window contains as-of.
 */
export function policyYearActiveOnAsOfSql(
  periodStart: Date,
  periodEnd: Date,
  asOf: Date,
  yearAlias = "py",
): Prisma.Sql {
  const y = Prisma.raw(yearAlias);
  return Prisma.sql`(
    (${y}.policyStart IS NULL AND ${y}.policyEnd IS NULL)
    OR (
      (${y}.policyStart IS NULL OR ${y}.policyStart <= ${periodEnd})
      AND (${y}.policyEnd IS NULL OR ${y}.policyEnd >= ${periodStart})
    )
    OR (
      ${y}.yearLabel REGEXP '^[0-9]{4}-[0-9]{2}$'
      AND ${asOf} >= STR_TO_DATE(CONCAT(SUBSTRING(${y}.yearLabel, 1, 4), '-04-01'), '%Y-%m-%d')
      AND ${asOf} <= STR_TO_DATE(
        CONCAT(CAST(SUBSTRING(${y}.yearLabel, 1, 4) AS UNSIGNED) + 1, '-03-31'),
        '%Y-%m-%d'
      )
    )
  )`;
}

/** When false, all non-deleted policy years count (aligns with policy register when no from-date). */
export function policyYearInReportScopeSql(
  periodStart: Date,
  periodEnd: Date,
  asOf: Date,
  yearAlias = "py",
  restrictToAsOfWindow = true,
): Prisma.Sql {
  if (!restrictToAsOfWindow) {
    return Prisma.sql`1=1`;
  }
  return policyYearActiveOnAsOfSql(periodStart, periodEnd, asOf, yearAlias);
}

export type VillageAggregateRow = {
  village: string | null;
  totalPolicies: bigint;
  totalMembers: bigint;
  sumExpectedPremium: string | null;
};

/**
 * Village-level counts and expected premium (sum of `PolicyYear.expectedNetPremium` in window).
 * All raw MIS SQL is centralized here. `scopeOnP` must be a `Prisma.sql` fragment for alias `p` only.
 */
export async function queryVillageAggregates(
  prisma: PrismaClient,
  args: { scopeOnP: Prisma.Sql; asOfDate: Date },
): Promise<VillageAggregateRow[]> {
  const { start, end } = asOfDayBoundsUTC(args.asOfDate);
  const yearActive = policyYearActiveOnAsOfSql(start, end, args.asOfDate);
  return prisma.$queryRaw<VillageAggregateRow[]>`
    SELECT
      p.village AS village,
      COUNT(DISTINCT p.id) AS totalPolicies,
      COUNT(DISTINCT m.id) AS totalMembers,
      COALESCE(SUM(py.expectedNetPremium), 0) AS sumExpectedPremium
    FROM Policy p
    INNER JOIN PolicyYear py ON py.policyId = p.id AND py.deletedAt IS NULL
      AND ${yearActive}
    LEFT JOIN Member m ON m.policyYearId = py.id AND m.deletedAt IS NULL
    WHERE p.deletedAt IS NULL
      AND (${args.scopeOnP})
    GROUP BY p.village
    ORDER BY p.village
  `;
}

export type VillagePaymentRow = {
  village: string | null;
  totalPaid: string | null;
};

/**
 * Sum of completed payment amounts by village in scope.
 */
export async function queryVillagePaymentTotals(
  prisma: PrismaClient,
  args: { scopeOnP: Prisma.Sql },
): Promise<VillagePaymentRow[]> {
  return prisma.$queryRaw<VillagePaymentRow[]>`
    SELECT
      p.village AS village,
      COALESCE(SUM(pay.amount), 0) AS totalPaid
    FROM Payment pay
    INNER JOIN PolicyYear py ON pay.policyYearId = py.id AND py.deletedAt IS NULL
    INNER JOIN Policy p ON py.policyId = p.id AND p.deletedAt IS NULL
    WHERE pay.deletedAt IS NULL
      AND pay.status = 'COMPLETED'
      AND (${args.scopeOnP})
    GROUP BY p.village
    ORDER BY p.village
  `;
}

export type MonthlyPremiumBucketRow = {
  y: number;
  m: number;
  premium: string | null;
};

/**
 * Sum of expected net premium by calendar month of `PolicyYear.policyStart` (rolling window ending at as-of).
 */
export async function queryDashboardMonthlyPremium(
  prisma: PrismaClient,
  args: { scopeOnP: Prisma.Sql; asOfDate: Date },
): Promise<MonthlyPremiumBucketRow[]> {
  const { end } = asOfDayBoundsUTC(args.asOfDate);
  const d = new Date(args.asOfDate);
  const rangeStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1, 0, 0, 0, 0));
  return prisma.$queryRaw<MonthlyPremiumBucketRow[]>`
    SELECT
      YEAR(py.policyStart) AS y,
      MONTH(py.policyStart) AS m,
      COALESCE(SUM(py.expectedNetPremium), 0) AS premium
    FROM PolicyYear py
    INNER JOIN Policy p ON py.policyId = p.id AND p.deletedAt IS NULL
    WHERE py.deletedAt IS NULL
      AND py.policyStart IS NOT NULL
      AND py.policyStart >= ${rangeStart}
      AND py.policyStart <= ${end}
      AND (${args.scopeOnP})
    GROUP BY YEAR(py.policyStart), MONTH(py.policyStart)
    ORDER BY y ASC, m ASC
  `;
}

export type MemberAgeBucketRow = {
  bucketLabel: string;
  memberCount: bigint;
};

/**
 * Member age buckets at `asOfDate` (MySQL `TIMESTAMPDIFF` vs `dob`). Scope on `p`.
 */
export async function queryMemberAgeBuckets(
  prisma: PrismaClient,
  args: { scopeOnP: Prisma.Sql; asOfDate: Date },
): Promise<MemberAgeBucketRow[]> {
  const d = new Date(args.asOfDate);
  return prisma.$queryRaw<MemberAgeBucketRow[]>`
    SELECT
      bucketLabel,
      COUNT(*) AS memberCount
    FROM (
      SELECT
        CASE
          WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 18 THEN '0-18'
          WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 19 AND 35 THEN '19-35'
          WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 36 AND 45 THEN '36-45'
          ELSE '46+'
        END AS bucketLabel
      FROM Member m
      INNER JOIN PolicyYear py ON m.policyYearId = py.id AND m.deletedAt IS NULL AND py.deletedAt IS NULL
      INNER JOIN Policy p ON py.policyId = p.id AND p.deletedAt IS NULL
      WHERE (${args.scopeOnP})
    ) t
    GROUP BY bucketLabel
    ORDER BY bucketLabel
  `;
}

/** Row for Policy & Member Report (MIS) — one dimension label with counts and financial sums. */
export type PolicyMemberReportRow = {
  label: string;
  totalPolicies: bigint;
  membersPlusPolicies: bigint;
  cntAshaKiran: bigint;
  cntFamilyFloater: bigint;
  cntIndividual: bigint;
  sumVkk: string | null;
  sumCo: string | null;
  sumGross: string | null;
  sumComm: string | null;
  sumTwoLac: string | null;
  sumPolHolder: string | null;
  sumGaam: string | null;
  sumRefund: string | null;
  sumCd: string | null;
  age0_18: bigint;
  age19_35: bigint;
  age36_45: bigint;
  age46_50: bigint;
  age51_55: bigint;
  age56_60: bigint;
  age61_65: bigint;
  age65p: bigint;
};

type PolicyMemberReportParams = {
  scopeOnP: Prisma.Sql;
  periodStart: Date;
  periodEnd: Date;
  asOf: Date;
  ageAsOf: Date;
  groupBy: "village" | "area" | "policy_type" | "sum_insured" | "age";
  categoryKeys: string[];
  policyGroupings: string[];
  villages: string[];
  areas: string[];
  sumInsureds: string[];
  months: number[];
  years: number[];
  createdFrom: Date | null;
  createdTo: Date | null;
  fiscalLabels: string[];
  /** When false, include every non-deleted policy year (policy register parity without from-date). */
  restrictPolicyYearToAsOf: boolean;
};

/** Member age band label — must match in SELECT and GROUP BY for ONLY_FULL_GROUP_BY. */
function memberAgeBucketSql(d: Date): Prisma.Sql {
  return Prisma.sql`(
    CASE
      WHEN m.dob IS NULL OR TIMESTAMPDIFF(YEAR, m.dob, ${d}) < 0 THEN '—'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 18 THEN '0–18'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 35 THEN '19–35'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 45 THEN '36–45'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 50 THEN '46–50'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 55 THEN '51–55'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 60 THEN '56–60'
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) <= 65 THEN '61–65'
      ELSE '65+'
    END
  )`;
}

function groupDimExpr(
  groupBy: PolicyMemberReportParams["groupBy"],
  d: Date,
  _start: Date,
  _end: Date,
): Prisma.Sql {
  if (groupBy === "village") {
    return Prisma.sql`COALESCE(p.village, '—')`;
  }
  if (groupBy === "area") {
    return Prisma.sql`COALESCE(p.area, '—')`;
  }
  if (groupBy === "policy_type") {
    return Prisma.sql`COALESCE(p.adProductVariant, 'UNASSIGNED')`;
  }
  if (groupBy === "sum_insured") {
    return Prisma.sql`(
      CASE
        WHEN py.sumInsured IS NULL THEN '—'
        ELSE CAST(CAST(py.sumInsured AS UNSIGNED) AS CHAR)
      END
    )`;
  }
  return memberAgeBucketSql(d);
}

function categoryKeysFilterSql(categoryKeys: string[]): Prisma.Sql {
  if (!categoryKeys.length) {
    return Prisma.empty;
  }
  return Prisma.sql` AND LOWER(${Prisma.raw("`cat`.`key`")}) IN (${Prisma.join(
    categoryKeys.map((k) => Prisma.sql`LOWER(${k})`),
  )})`;
}

function policyGroupingsFilterSql(groupings: string[]): Prisma.Sql {
  if (!groupings.length) {
    return Prisma.empty;
  }
  return Prisma.sql` AND p.policyGrouping IN (${Prisma.join(groupings)})`;
}

function villagesFilterSql(villages: string[]): Prisma.Sql {
  if (!villages.length) {
    return Prisma.empty;
  }
  return Prisma.sql` AND p.village IN (${Prisma.join(villages)})`;
}

function areasFilterSql(areas: string[]): Prisma.Sql {
  if (!areas.length) {
    return Prisma.empty;
  }
  return Prisma.sql` AND p.area IN (${Prisma.join(areas)})`;
}

function sumInsuredsFilterSql(sumInsureds: string[]): Prisma.Sql {
  if (!sumInsureds.length) {
    return Prisma.empty;
  }
  const amounts = sumInsureds
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!amounts.length) {
    return Prisma.empty;
  }
  return Prisma.sql` AND py.sumInsured IN (${Prisma.join(amounts)})`;
}

function monthsYearsFilterSql(months: number[], years: number[]): Prisma.Sql {
  if (months.length && years.length) {
    return Prisma.sql` AND MONTH(p.createdAt) IN (${Prisma.join(months)}) AND YEAR(p.createdAt) IN (${Prisma.join(years)})`;
  }
  if (months.length) {
    return Prisma.sql` AND MONTH(p.createdAt) IN (${Prisma.join(months)})`;
  }
  if (years.length) {
    return Prisma.sql` AND YEAR(p.createdAt) IN (${Prisma.join(years)})`;
  }
  return Prisma.empty;
}

function createdAtRangeFilterSql(createdFrom: Date | null, createdTo: Date | null): Prisma.Sql {
  if (createdFrom && createdTo) {
    return Prisma.sql` AND p.createdAt >= ${createdFrom} AND p.createdAt <= ${createdTo}`;
  }
  if (createdFrom) {
    return Prisma.sql` AND p.createdAt >= ${createdFrom}`;
  }
  if (createdTo) {
    return Prisma.sql` AND p.createdAt <= ${createdTo}`;
  }
  return Prisma.empty;
}

function fiscalLabelsFilterSql(fiscalLabels: string[]): Prisma.Sql {
  if (!fiscalLabels.length) {
    return Prisma.empty;
  }
  return Prisma.sql` AND (
    p.periodYearText IN (${Prisma.join(fiscalLabels)})
    OR py.yearLabel IN (${Prisma.join(fiscalLabels)})
  )`;
}

function baseFromClause(
  args: { scopeOnP: Prisma.Sql; start: Date; end: Date; asOf: Date; restrictPolicyYearToAsOf: boolean },
  filters: {
    catF: Prisma.Sql;
    pgF: Prisma.Sql;
    villF: Prisma.Sql;
    areaF: Prisma.Sql;
    sumF: Prisma.Sql;
    myF: Prisma.Sql;
    createdF: Prisma.Sql;
    fiscF: Prisma.Sql;
  },
  includeMember: boolean,
  requireMember: boolean,
): Prisma.Sql {
  const mJoin = includeMember
    ? Prisma.sql`LEFT JOIN Member m ON m.policyYearId = py.id AND m.deletedAt IS NULL`
    : Prisma.empty;
  const mReq = requireMember ? Prisma.sql` AND m.id IS NOT NULL` : Prisma.empty;
  const yearActive = policyYearInReportScopeSql(
    args.start,
    args.end,
    args.asOf,
    "py",
    args.restrictPolicyYearToAsOf,
  );
  return Prisma.sql`
    FROM Policy p
    LEFT JOIN Category cat ON p.categoryId = cat.id
    INNER JOIN PolicyYear py ON py.policyId = p.id
      AND py.deletedAt IS NULL
      AND ${yearActive}
    ${mJoin}
    WHERE p.deletedAt IS NULL
      AND (${args.scopeOnP})
      ${filters.catF}
      ${filters.pgF}
      ${filters.villF}
      ${filters.areaF}
      ${filters.sumF}
      ${filters.myF}
      ${filters.createdF}
      ${filters.fiscF}
      ${mReq}
  `;
}

/** Policy & Member report: one row per `groupBy` dimension. Financial sums from policy years; age counts from members. */
export async function queryPolicyMemberReport(
  prisma: PrismaClient,
  args: PolicyMemberReportParams,
): Promise<PolicyMemberReportRow[]> {
  const start = args.periodStart;
  const end = args.periodEnd;
  const d = args.ageAsOf;
  const asOf = args.asOf;
  const yearActive = policyYearInReportScopeSql(start, end, asOf, "py", args.restrictPolicyYearToAsOf);
  const yearActiveX = policyYearInReportScopeSql(start, end, asOf, "x", args.restrictPolicyYearToAsOf);
  const dim = groupDimExpr(args.groupBy, d, start, end);
  const catF = categoryKeysFilterSql(args.categoryKeys);
  const pgF = policyGroupingsFilterSql(args.policyGroupings);
  const villF = villagesFilterSql(args.villages);
  const areaF = areasFilterSql(args.areas);
  const sumF = sumInsuredsFilterSql(args.sumInsureds);
  const myF = monthsYearsFilterSql(args.months, args.years);
  const createdF = createdAtRangeFilterSql(args.createdFrom, args.createdTo);
  const fiscF = fiscalLabelsFilterSql(args.fiscalLabels);
  const filters = { catF, pgF, villF, areaF, sumF, myF, createdF, fiscF };
  const fArgs = {
    scopeOnP: args.scopeOnP,
    start,
    end,
    asOf,
    restrictPolicyYearToAsOf: args.restrictPolicyYearToAsOf,
  };

  const fromMember = baseFromClause(fArgs, filters, true, args.groupBy === "age");

  type FinRow = {
    label: string;
    totalPolicies: bigint;
    cntAshaKiran: bigint;
    cntFamilyFloater: bigint;
    cntIndividual: bigint;
    sumVkk: string | null;
    sumCo: string | null;
    sumGross: string | null;
    sumComm: string | null;
    sumTwoLac: string | null;
    sumPolHolder: string | null;
    sumGaam: string | null;
    sumRefund: string | null;
    sumCd: string | null;
  };

  // Age dimension requires Member for `dim`; dedupe (dim,p,py) before summing money.
  const financials =
    args.groupBy === "age"
      ? await prisma.$queryRaw<FinRow[]>(Prisma.sql`
    SELECT
      t.dim AS label,
      COUNT(DISTINCT t.pid) AS totalPolicies,
      COUNT(DISTINCT CASE WHEN t.adVar = 'ASHA_KIRAN' THEN t.pid END) AS cntAshaKiran,
      COUNT(DISTINCT CASE WHEN t.adVar = 'FAMILY_FLOATER' THEN t.pid END) AS cntFamilyFloater,
      COUNT(DISTINCT CASE WHEN t.adVar = 'INDIVIDUAL' THEN t.pid END) AS cntIndividual,
      COALESCE(SUM(t.sVkk), 0) AS sumVkk,
      COALESCE(SUM(t.sCo), 0) AS sumCo,
      COALESCE(SUM(t.sGross), 0) AS sumGross,
      COALESCE(SUM(t.sComm), 0) AS sumComm,
      COALESCE(SUM(t.sTwoLac), 0) AS sumTwoLac,
      COALESCE(SUM(t.sPolH), 0) AS sumPolHolder,
      COALESCE(SUM(t.sGaam), 0) AS sumGaam,
      COALESCE(SUM(t.refundOnce), 0) AS sumRefund,
      COALESCE(SUM(t.cdOnce), 0) AS sumCd
    FROM (
      SELECT
        ${dim} AS dim,
        p.id AS pid,
        p.adProductVariant AS adVar,
        MAX(COALESCE(py.vkkPremium, 0)) AS sVkk,
        MAX(COALESCE(py.expectedNetPremium, 0)) AS sCo,
        MAX(COALESCE(py.grossPremium, 0)) AS sGross,
        MAX(COALESCE(py.commissionAmount, 0)) AS sComm,
        MAX(COALESCE(py.twoLacFloater, 0)) AS sTwoLac,
        MAX(COALESCE(py.yearPolicyHolderPremium, 0)) AS sPolH,
        MAX(COALESCE(py.gaamMahajanVkk, 0)) AS sGaam,
        MAX(COALESCE(p.refundChequeAmount, 0) / NULLIF(
          (SELECT COUNT(*) FROM PolicyYear x WHERE x.policyId = p.id AND x.deletedAt IS NULL
            AND ${yearActiveX}), 0)) AS refundOnce,
        MAX(COALESCE(p.cdAmount, 0) / NULLIF(
          (SELECT COUNT(*) FROM PolicyYear x WHERE x.policyId = p.id AND x.deletedAt IS NULL
            AND ${yearActiveX}), 0)) AS cdOnce
      FROM Policy p
      LEFT JOIN Category cat ON p.categoryId = cat.id
      INNER JOIN PolicyYear py ON py.policyId = p.id
        AND py.deletedAt IS NULL
        AND ${yearActive}
      INNER JOIN Member m ON m.policyYearId = py.id AND m.deletedAt IS NULL
      WHERE p.deletedAt IS NULL
        AND (${args.scopeOnP})
        ${catF}
        ${pgF}
        ${villF}
        ${areaF}
        ${sumF}
        ${myF}
        ${createdF}
        ${fiscF}
      GROUP BY ${dim}, p.id, p.adProductVariant, py.id, m.id
    ) t
    GROUP BY t.dim
  `)
      : await prisma.$queryRaw<FinRow[]>(Prisma.sql`
    SELECT
      t.dim AS label,
      COUNT(DISTINCT t.pid) AS totalPolicies,
      COUNT(DISTINCT CASE WHEN t.adVar = 'ASHA_KIRAN' THEN t.pid END) AS cntAshaKiran,
      COUNT(DISTINCT CASE WHEN t.adVar = 'FAMILY_FLOATER' THEN t.pid END) AS cntFamilyFloater,
      COUNT(DISTINCT CASE WHEN t.adVar = 'INDIVIDUAL' THEN t.pid END) AS cntIndividual,
      COALESCE(SUM(t.sVkk), 0) AS sumVkk,
      COALESCE(SUM(t.sCo), 0) AS sumCo,
      COALESCE(SUM(t.sGross), 0) AS sumGross,
      COALESCE(SUM(t.sComm), 0) AS sumComm,
      COALESCE(SUM(t.sTwoLac), 0) AS sumTwoLac,
      COALESCE(SUM(t.sPolH), 0) AS sumPolHolder,
      COALESCE(SUM(t.sGaam), 0) AS sumGaam,
      COALESCE(SUM(t.refundOnce), 0) AS sumRefund,
      COALESCE(SUM(t.cdOnce), 0) AS sumCd
    FROM (
      SELECT
        ${dim} AS dim,
        p.id AS pid,
        p.adProductVariant AS adVar,
        COALESCE(py.vkkPremium, 0) AS sVkk,
        COALESCE(py.expectedNetPremium, 0) AS sCo,
        COALESCE(py.grossPremium, 0) AS sGross,
        COALESCE(py.commissionAmount, 0) AS sComm,
        COALESCE(py.twoLacFloater, 0) AS sTwoLac,
        COALESCE(py.yearPolicyHolderPremium, 0) AS sPolH,
        COALESCE(py.gaamMahajanVkk, 0) AS sGaam,
        COALESCE(p.refundChequeAmount, 0) / NULLIF(
          (SELECT COUNT(*) FROM PolicyYear x WHERE x.policyId = p.id AND x.deletedAt IS NULL
            AND ${yearActiveX}), 0) AS refundOnce,
        COALESCE(p.cdAmount, 0) / NULLIF(
          (SELECT COUNT(*) FROM PolicyYear x WHERE x.policyId = p.id AND x.deletedAt IS NULL
            AND ${yearActiveX}), 0) AS cdOnce
      FROM Policy p
      LEFT JOIN Category cat ON p.categoryId = cat.id
      INNER JOIN PolicyYear py ON py.policyId = p.id
        AND py.deletedAt IS NULL
        AND ${yearActive}
      WHERE p.deletedAt IS NULL
        AND (${args.scopeOnP})
        ${catF}
        ${pgF}
        ${villF}
        ${areaF}
        ${sumF}
        ${myF}
        ${createdF}
        ${fiscF}
    ) t
    GROUP BY t.dim
  `);

  const people =
    args.groupBy === "age"
      ? await prisma.$queryRaw<
          {
            label: string;
            totalMemberRows: bigint;
            mpp: bigint;
            a0: bigint;
            a1: bigint;
            a2: bigint;
            a3: bigint;
            a4: bigint;
            a5: bigint;
            a6: bigint;
            a7: bigint;
          }[]
        >(Prisma.sql`
    SELECT
      x.label,
      COUNT(x.mid) AS totalMemberRows,
      (COUNT(DISTINCT x.mid) + COUNT(DISTINCT x.pid)) AS mpp,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 0 AND 18 THEN x.mid END) AS a0,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 19 AND 35 THEN x.mid END) AS a1,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 36 AND 45 THEN x.mid END) AS a2,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 46 AND 50 THEN x.mid END) AS a3,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 51 AND 55 THEN x.mid END) AS a4,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 56 AND 60 THEN x.mid END) AS a5,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears BETWEEN 61 AND 65 THEN x.mid END) AS a6,
      COUNT(DISTINCT CASE WHEN x.mid IS NOT NULL AND x.ageYears > 65 THEN x.mid END) AS a7
    FROM (
      SELECT
        ${dim} AS label,
        m.id AS mid,
        p.id AS pid,
        TIMESTAMPDIFF(YEAR, m.dob, ${d}) AS ageYears
      ${fromMember}
    ) x
    GROUP BY x.label
  `)
      : await prisma.$queryRaw<
          {
            label: string;
            totalMemberRows: bigint;
            mpp: bigint;
            a0: bigint;
            a1: bigint;
            a2: bigint;
            a3: bigint;
            a4: bigint;
            a5: bigint;
            a6: bigint;
            a7: bigint;
          }[]
        >(Prisma.sql`
    SELECT
      ${dim} AS label,
      COUNT(m.id) AS totalMemberRows,
      (COUNT(DISTINCT m.id) + COUNT(DISTINCT p.id)) AS mpp,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 0 AND 18 THEN m.id END) AS a0,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 19 AND 35 THEN m.id END) AS a1,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 36 AND 45 THEN m.id END) AS a2,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 46 AND 50 THEN m.id END) AS a3,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 51 AND 55 THEN m.id END) AS a4,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 56 AND 60 THEN m.id END) AS a5,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) BETWEEN 61 AND 65 THEN m.id END) AS a6,
      COUNT(DISTINCT CASE WHEN m.id IS NOT NULL AND TIMESTAMPDIFF(YEAR, m.dob, ${d}) > 65 THEN m.id END) AS a7
    ${fromMember}
    GROUP BY ${dim}
  `);

  const fMap = new Map(financials.map((f) => [f.label, f]));
  const pMap = new Map(people.map((r) => [r.label, r]));
  const allLabels = new Set<string>([...fMap.keys(), ...pMap.keys()]);

  const emptyFin: FinRow = {
    label: "",
    totalPolicies: 0n,
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
  };

  return [...allLabels].map((label) => {
    const f = fMap.get(label) ?? { ...emptyFin, label };
    const p = pMap.get(label);
    return {
      label,
      totalPolicies: f.totalPolicies,
      membersPlusPolicies: p?.mpp ?? 0n,
      cntAshaKiran: f.cntAshaKiran,
      cntFamilyFloater: f.cntFamilyFloater,
      cntIndividual: f.cntIndividual,
      sumVkk: f.sumVkk,
      sumCo: f.sumCo,
      sumGross: f.sumGross,
      sumComm: f.sumComm,
      sumTwoLac: f.sumTwoLac,
      sumPolHolder: f.sumPolHolder,
      sumGaam: f.sumGaam,
      sumRefund: f.sumRefund,
      sumCd: f.sumCd,
      age0_18: p?.a0 ?? 0n,
      age19_35: p?.a1 ?? 0n,
      age36_45: p?.a2 ?? 0n,
      age46_50: p?.a3 ?? 0n,
      age51_55: p?.a4 ?? 0n,
      age56_60: p?.a5 ?? 0n,
      age61_65: p?.a6 ?? 0n,
      age65p: p?.a7 ?? 0n,
    };
  });
}
