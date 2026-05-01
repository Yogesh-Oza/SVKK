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
  return prisma.$queryRaw<VillageAggregateRow[]>`
    SELECT
      p.village AS village,
      COUNT(DISTINCT p.id) AS totalPolicies,
      COUNT(DISTINCT m.id) AS totalMembers,
      COALESCE(SUM(py.expectedNetPremium), 0) AS sumExpectedPremium
    FROM Policy p
    INNER JOIN PolicyYear py ON py.policyId = p.id AND py.deletedAt IS NULL
      AND (py.policyStart IS NULL OR py.policyStart <= ${end})
      AND (py.policyEnd IS NULL OR py.policyEnd >= ${start})
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
  asOfDate: Date;
  groupBy: "village" | "area" | "policy_type" | "sum_insured" | "age";
  categoryKey: string | null;
  policyGrouping: string | null;
  month: number | null;
  year: number | null;
  fiscalLabel: string | null;
};

function groupDimExpr(
  groupBy: PolicyMemberReportParams["groupBy"],
  d: Date,
  start: Date,
  end: Date,
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
        WHEN py.sumInsured IS NULL OR py.sumInsured < 300000 THEN '0–3L'
        WHEN py.sumInsured < 500000 THEN '3–5L'
        WHEN py.sumInsured < 1000000 THEN '5–10L'
        ELSE '10L+'
      END
    )`;
  }
  // age: member age bucket (rows = age bands)
  return Prisma.sql`(
    CASE
      WHEN TIMESTAMPDIFF(YEAR, m.dob, ${d}) < 0 THEN '—'
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

function categoryFilterSql(categoryKey: string | null): Prisma.Sql {
  if (!categoryKey) {
    return Prisma.empty;
  }
  // `key` is reserved in MySQL; qualify with alias
  return Prisma.sql` AND LOWER(${Prisma.raw("`cat`.`key`")}) = LOWER(${categoryKey})`;
}

function policyGroupingFilterSql(pg: string | null): Prisma.Sql {
  if (!pg) {
    return Prisma.empty;
  }
  return Prisma.sql` AND p.policyGrouping = ${pg}`;
}

function monthYearFilterSql(month: number | null, year: number | null): Prisma.Sql {
  if (month != null && year != null) {
    return Prisma.sql` AND MONTH(p.createdAt) = ${month} AND YEAR(p.createdAt) = ${year}`;
  }
  if (year != null) {
    return Prisma.sql` AND YEAR(p.createdAt) = ${year}`;
  }
  return Prisma.empty;
}

function fiscalFilterSql(fiscalLabel: string | null): Prisma.Sql {
  if (!fiscalLabel) {
    return Prisma.empty;
  }
  return Prisma.sql` AND (p.periodYearText = ${fiscalLabel} OR py.yearLabel = ${fiscalLabel})`;
}

function baseFromClause(
  args: { scopeOnP: Prisma.Sql; start: Date; end: Date },
  filters: { catF: Prisma.Sql; pgF: Prisma.Sql; myF: Prisma.Sql; fiscF: Prisma.Sql },
  includeMember: boolean,
  requireMember: boolean,
): Prisma.Sql {
  const mJoin = includeMember
    ? Prisma.sql`LEFT JOIN Member m ON m.policyYearId = py.id AND m.deletedAt IS NULL`
    : Prisma.empty;
  const mReq = requireMember ? Prisma.sql` AND m.id IS NOT NULL` : Prisma.empty;
  return Prisma.sql`
    FROM Policy p
    LEFT JOIN Category cat ON p.categoryId = cat.id
    INNER JOIN PolicyYear py ON py.policyId = p.id
      AND py.deletedAt IS NULL
      AND (py.policyStart IS NULL OR py.policyStart <= ${args.end})
      AND (py.policyEnd IS NULL OR py.policyEnd >= ${args.start})
    ${mJoin}
    WHERE p.deletedAt IS NULL
      AND (${args.scopeOnP})
      ${filters.catF}
      ${filters.pgF}
      ${filters.myF}
      ${filters.fiscF}
      ${mReq}
  `;
}

/** Policy & Member report: one row per `groupBy` dimension. Financial sums from policy years; age counts from members. */
export async function queryPolicyMemberReport(
  prisma: PrismaClient,
  args: PolicyMemberReportParams,
): Promise<PolicyMemberReportRow[]> {
  const { start, end } = asOfDayBoundsUTC(args.asOfDate);
  const d = args.asOfDate;
  const dim = groupDimExpr(args.groupBy, d, start, end);
  const catF = categoryFilterSql(args.categoryKey);
  const pgF = policyGroupingFilterSql(args.policyGrouping);
  const myF = monthYearFilterSql(args.month, args.year);
  const fiscF = fiscalFilterSql(args.fiscalLabel);
  const filters = { catF, pgF, myF, fiscF };
  const fArgs = { scopeOnP: args.scopeOnP, start, end };

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
            AND (x.policyStart IS NULL OR x.policyStart <= ${end})
            AND (x.policyEnd IS NULL OR x.policyEnd >= ${start})), 0)) AS refundOnce,
        MAX(COALESCE(p.cdAmount, 0) / NULLIF(
          (SELECT COUNT(*) FROM PolicyYear x WHERE x.policyId = p.id AND x.deletedAt IS NULL
            AND (x.policyStart IS NULL OR x.policyStart <= ${end})
            AND (x.policyEnd IS NULL OR x.policyEnd >= ${start})), 0)) AS cdOnce
      FROM Policy p
      LEFT JOIN Category cat ON p.categoryId = cat.id
      INNER JOIN PolicyYear py ON py.policyId = p.id
        AND py.deletedAt IS NULL
        AND (py.policyStart IS NULL OR py.policyStart <= ${end})
        AND (py.policyEnd IS NULL OR py.policyEnd >= ${start})
      INNER JOIN Member m ON m.policyYearId = py.id AND m.deletedAt IS NULL
      WHERE p.deletedAt IS NULL
        AND (${args.scopeOnP})
        ${catF}
        ${pgF}
        ${myF}
        ${fiscF}
      GROUP BY ${dim}, p.id, p.adProductVariant, py.id
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
            AND (x.policyStart IS NULL OR x.policyStart <= ${end})
            AND (x.policyEnd IS NULL OR x.policyEnd >= ${start})), 0) AS refundOnce,
        COALESCE(p.cdAmount, 0) / NULLIF(
          (SELECT COUNT(*) FROM PolicyYear x WHERE x.policyId = p.id AND x.deletedAt IS NULL
            AND (x.policyStart IS NULL OR x.policyStart <= ${end})
            AND (x.policyEnd IS NULL OR x.policyEnd >= ${start})), 0) AS cdOnce
      FROM Policy p
      LEFT JOIN Category cat ON p.categoryId = cat.id
      INNER JOIN PolicyYear py ON py.policyId = p.id
        AND py.deletedAt IS NULL
        AND (py.policyStart IS NULL OR py.policyStart <= ${end})
        AND (py.policyEnd IS NULL OR py.policyEnd >= ${start})
      WHERE p.deletedAt IS NULL
        AND (${args.scopeOnP})
        ${catF}
        ${pgF}
        ${myF}
        ${fiscF}
    ) t
    GROUP BY t.dim
  `);

  const people = await prisma.$queryRaw<
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
