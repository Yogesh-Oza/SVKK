import { PaymentStatus, type UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { MisScope } from "../../services/mis-scope.service.js";
import { buildPolicyReadWhere } from "../../services/mis-scope.service.js";
import { buildPolicyScopeSqlP } from "./mis.scope-sql.js";
import {
  asOfDayBoundsUTC,
  queryVillageAggregates,
  queryVillagePaymentTotals,
  queryMemberAgeBuckets,
  queryPolicyMemberReport,
  type PolicyMemberReportRow,
} from "./mis.queries.js";

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
  role: UserRole,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
) {
  const pWhere = buildPolicyReadWhere(scope, filterVillage, userId, role);
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

export async function getVillageReport(
  userId: string,
  role: UserRole,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
) {
  const scopeOnP = buildPolicyScopeSqlP(role, userId, scope, filterVillage);
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
  | "age";

/**
 * Policy & Member report (filters + as-of). Rows are one per `groupBy` dimension; amounts are
 * for policy-years in the as-of window.
 */
export async function getPolicyMemberReport(
  userId: string,
  role: UserRole,
  scope: MisScope,
  asOfDate: Date,
  filterVillage: string | undefined,
  input: {
    groupBy: PolicyMemberReportGroupBy;
    categoryKey: string | null;
    policyGrouping: string | null;
    month: number | null;
    year: number | null;
    fiscalLabel: string | null;
  },
) {
  const scopeOnP = buildPolicyScopeSqlP(role, userId, scope, filterVillage);
  const rows = await queryPolicyMemberReport(prisma, {
    scopeOnP,
    asOfDate,
    groupBy: input.groupBy,
    categoryKey: input.categoryKey,
    policyGrouping: input.policyGrouping,
    month: input.month,
    year: input.year,
    fiscalLabel: input.fiscalLabel,
  });
  return {
    asOfDate: asOfDate.toISOString(),
    groupBy: input.groupBy,
    rows: rows.map(toPolicyMemberJsonRow),
  };
}
