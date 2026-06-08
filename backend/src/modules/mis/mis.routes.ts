import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";
import {
  buildMisVillageWhere,
  loadMisScope,
  mergeDateRange,
} from "../../services/mis-scope.service.js";
import {
  buildPolicyMemberDrillDownCsv,
  drillDownExportFilename,
  POLICY_MEMBER_REPORT_METRIC_COLS,
} from "./mis.export-drill-down.js";
import {
  getDashboardCharts,
  getDashboardClaimMetrics,
  getDashboardMetrics,
  getDashboardRenewalBuckets,
  getPolicyMemberReport,
  getPolicyMemberReportDetail,
  getVillageReport,
  getClaimReport,
  getClaimTrend,
} from "./mis.service.js";

function resolveClaimScopeModule(permissions: Set<string>): "claim" | "mis" | "dashboard" {
  if (hasPermissionInSet(permissions, "claim:read")) return "claim";
  if (hasPermissionInSet(permissions, "mis:read")) return "mis";
  return "dashboard";
}

function parseAsOf(q: { asOfDate?: string }): Date {
  if (q.asOfDate) {
    const d = new Date(q.asOfDate);
    if (Number.isNaN(d.getTime())) {
      return new Date();
    }
    return d;
  }
  return new Date();
}

function queryToStringArray(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  const raw = Array.isArray(v) ? v : [v];
  const out = raw
    .flatMap((x) => String(x).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length ? [...new Set(out)] : undefined;
}

const stringArrayQuery = z.preprocess(queryToStringArray, z.array(z.string()).optional());

const intArrayQuery = z.preprocess((v) => {
  const arr = queryToStringArray(v);
  if (!arr?.length) return undefined;
  const nums = arr.map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n));
  return nums.length ? [...new Set(nums)] : undefined;
}, z.array(z.number().int()).optional());

function parseOptionalDate(s: string | undefined): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

const policyMemberReportQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  /** @deprecated use dateTo */
  asOfDate: z.string().optional(),
  /** @deprecated use villages[] */
  village: z.string().optional(),
  villages: stringArrayQuery,
  areas: stringArrayQuery,
  sumInsureds: stringArrayQuery,
  groupBy: z
    .enum(["village", "area", "policy_type", "sum_insured", "age"])
    .default("village"),
  categoryKeys: stringArrayQuery,
  /** @deprecated use categoryKeys[] */
  categoryKey: z.string().optional(),
  policyGroupings: stringArrayQuery,
  /** @deprecated use policyGroupings[] */
  policyGrouping: z.string().optional(),
  /** Policy SVKK Details month (`Policy.periodMonthText`, e.g. May). */
  periodMonthTexts: stringArrayQuery,
  fiscalLabels: stringArrayQuery,
  /** @deprecated use fiscalLabels[] */
  fiscalLabel: z.string().optional(),
  /** Calendar month of `PolicyYear.policyStart` (dashboard chart drill-down). */
  policyStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  policyStartYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

function normalizePolicyMemberReportQuery(q: z.infer<typeof policyMemberReportQuerySchema>) {
  const dateFrom = parseOptionalDate(q.dateFrom);
  const dateTo =
    parseOptionalDate(q.dateTo) ??
    parseOptionalDate(q.asOfDate) ??
    (dateFrom ? null : new Date());
  const villages = [
    ...(q.villages ?? []),
    ...(q.village?.trim() ? [q.village.trim()] : []),
  ];
  const categoryKeys = [
    ...(q.categoryKeys ?? []),
    ...(q.categoryKey?.trim() ? [q.categoryKey.trim()] : []),
  ];
  const policyGroupings = [
    ...(q.policyGroupings ?? []),
    ...(q.policyGrouping?.trim() ? [q.policyGrouping.trim()] : []),
  ];
  const periodMonthTexts = [...new Set(q.periodMonthTexts ?? [])];
  const fiscalLabels = [
    ...(q.fiscalLabels ?? []),
    ...(q.fiscalLabel?.trim() ? [q.fiscalLabel.trim()] : []),
  ];
  const policyStartMonths = q.policyStartMonth != null ? [q.policyStartMonth] : [];
  const policyStartYears = q.policyStartYear != null ? [q.policyStartYear] : [];
  return {
    dateFrom,
    dateTo,
    villages: [...new Set(villages)],
    areas: [...new Set(q.areas ?? [])],
    sumInsureds: [...new Set(q.sumInsureds ?? [])],
    groupBy: q.groupBy,
    categoryKeys: [...new Set(categoryKeys)],
    policyGroupings: [...new Set(policyGroupings)],
    periodMonthTexts,
    fiscalLabels: [...new Set(fiscalLabels)],
    policyStartMonths: [...new Set(policyStartMonths)],
    policyStartYears: [...new Set(policyStartYears)],
  };
}

export function createMisRouter(_env: Env) {
  const r = Router();
  r.use(requireAuth(_env));

  r.get(
    "/summary",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            village: z.string().optional(),
            from: z.coerce.date().optional(),
            to: z.coerce.date().optional(),
            asOfDate: z.coerce.date().optional(),
            limit: z.coerce.number().min(1).max(100).default(1),
          })
          .parse(req.query);

        const scope = await loadMisScope(req.userId!, req.permissions!);
        const villageWheres = buildMisVillageWhere(scope, q.village);
        const { policy: pWhere, claim: cWhere } = mergeDateRange(villageWheres, q.from, q.to);

        const asOf = q.asOfDate ?? new Date();
        const [policyCount, claimAgg] = await prisma.$transaction([
          prisma.policy.count({ where: pWhere }),
          prisma.claim.aggregate({
            where: cWhere,
            _count: { id: true },
            _sum: { claimAmount: true, approvedAmount: true },
          }),
        ]);

        res.json({
          asOfDate: asOf.toISOString(),
          totalPolicies: policyCount,
          totalClaims: claimAgg._count.id,
          totalClaimAmount: claimAgg._sum.claimAmount ?? 0,
          totalApprovedAmount: claimAgg._sum.approvedAmount ?? 0,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/dashboard",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            village: z.string().optional(),
            asOfDate: z.string().optional(),
          })
          .parse(req.query);
        const module = hasPermissionInSet(req.permissions!, "mis:read") ? "mis" : "dashboard";
        const scope = await loadMisScope(req.userId!, req.permissions!, module);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const m = await getDashboardMetrics(
          req.userId!,
          req.permissions!,
          scope,
          asOf,
          q.village,
        );
        res.json(m);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/dashboard-charts",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            village: z.string().optional(),
            asOfDate: z.string().optional(),
          })
          .parse(req.query);
        const module = hasPermissionInSet(req.permissions!, "mis:read") ? "mis" : "dashboard";
        const scope = await loadMisScope(req.userId!, req.permissions!, module);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const [charts, renewal] = await Promise.all([
          getDashboardCharts(req.userId!, req.permissions!, scope, asOf, q.village),
          getDashboardRenewalBuckets(req.userId!, req.permissions!, scope, asOf, q.village),
        ]);
        res.json({ ...charts, renewal });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/dashboard-claims",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
          })
          .parse(req.query);
        const dateFrom = parseOptionalDate(q.dateFrom);
        const dateTo =
          parseOptionalDate(q.dateTo) ?? (dateFrom ? null : new Date());
        const scope = await loadMisScope(
          req.userId!,
          req.permissions!,
          resolveClaimScopeModule(req.permissions!),
        );
        const metrics = await getDashboardClaimMetrics(req.permissions!, scope, {
          dateFrom,
          dateTo,
        });
        res.json(metrics);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/village-report",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = z
          .object({ village: z.string().optional(), asOfDate: z.string().optional() })
          .parse(req.query);
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const rep = await getVillageReport(
          req.userId!,
          req.permissions!,
          scope,
          asOf,
          q.village,
        );
        res.json(rep);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/policy-member-report",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = policyMemberReportQuerySchema.parse(req.query);
        const module = hasPermissionInSet(req.permissions!, "mis:read") ? "mis" : "dashboard";
        const scope = await loadMisScope(req.userId!, req.permissions!, module);
        const rep = await getPolicyMemberReport(
          req.userId!,
          req.permissions!,
          scope,
          normalizePolicyMemberReportQuery(q),
        );
        res.json(rep);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/policy-member-report/detail",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = policyMemberReportQuerySchema
          .extend({
            drillVillage: z.string().optional(),
            drillArea: z.string().optional(),
          })
          .parse(req.query);
        const normalized = normalizePolicyMemberReportQuery(q);
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const rep = await getPolicyMemberReportDetail(
          req.userId!,
          req.permissions!,
          scope,
          {
            drillVillage: q.drillVillage?.trim() || null,
            drillArea: q.drillArea?.trim() || null,
            dateFrom: normalized.dateFrom,
            dateTo: normalized.dateTo,
            categoryKeys: normalized.categoryKeys,
            policyGroupings: normalized.policyGroupings,
            sumInsureds: normalized.sumInsureds,
            periodMonthTexts: normalized.periodMonthTexts,
            policyStartMonths: normalized.policyStartMonths,
            policyStartYears: normalized.policyStartYears,
            fiscalLabels: normalized.fiscalLabels,
          },
        );
        res.json(rep);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/export/policy-member-report-detail.csv",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = policyMemberReportQuerySchema
          .extend({
            drillVillage: z.string().optional(),
            drillArea: z.string().optional(),
          })
          .parse(req.query);
        const normalized = normalizePolicyMemberReportQuery(q);
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const rep = await getPolicyMemberReportDetail(
          req.userId!,
          req.permissions!,
          scope,
          {
            drillVillage: q.drillVillage?.trim() || null,
            drillArea: q.drillArea?.trim() || null,
            dateFrom: normalized.dateFrom,
            dateTo: normalized.dateTo,
            categoryKeys: normalized.categoryKeys,
            policyGroupings: normalized.policyGroupings,
            sumInsureds: normalized.sumInsureds,
            periodMonthTexts: normalized.periodMonthTexts,
            policyStartMonths: normalized.policyStartMonths,
            policyStartYears: normalized.policyStartYears,
            fiscalLabels: normalized.fiscalLabels,
          },
        );
        const csv = buildPolicyMemberDrillDownCsv(rep);
        const filename = drillDownExportFilename(rep.drillType, rep.drillLabel);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        // BOM helps Excel open ₹ and en-IN formatting correctly on Windows.
        res.send(`\uFEFF${csv}`);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/export/policy-member-report.csv",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = policyMemberReportQuerySchema.parse(req.query);
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const rep = await getPolicyMemberReport(
          req.userId!,
          req.permissions!,
          scope,
          normalizePolicyMemberReportQuery(q),
        );
        const cols = POLICY_MEMBER_REPORT_METRIC_COLS;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="policy-member-report.csv"');
        res.write(`${cols.join(",")}\n`);
        for (const r0 of rep.rows) {
          const line = cols.map((c) => {
            const v = r0[c];
            if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
              return `"${v.replaceAll('"', '""')}"`;
            }
            return String(v);
          });
          res.write(`${line.join(",")}\n`);
        }
        res.end();
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/export/villages.csv",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = z
          .object({ village: z.string().optional(), asOfDate: z.string().optional() })
          .parse(req.query);
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const rep = await getVillageReport(
          req.userId!,
          req.permissions!,
          scope,
          asOf,
          q.village,
        );
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="mis-villages.csv"');
        res.write("village,totalPolicies,totalMembers,sumExpectedPremium,totalPaid\n");
        for (const v of rep.villages) {
          const line = [
            JSON.stringify(v.village ?? ""),
            v.totalPolicies,
            v.totalMembers,
            v.sumExpectedPremium,
            v.totalPaid,
          ].join(",");
          res.write(`${line}\n`);
        }
        res.end();
      } catch (e) {
        next(e);
      }
    },
  );

  r.get("/policies", requirePermission("mis:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
          village: z.string().optional(),
        })
        .parse(req.query);

      const scope = await loadMisScope(req.userId!, req.permissions!);
      const { policy: villageWhere } = buildMisVillageWhere(scope, q.village);

      const rows = await prisma.policy.findMany({
        where: villageWhere,
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          policyNo: true,
          village: true,
          createdAt: true,
          insuredParty: { select: { svkkPublicId: true, name: true, mobile: true } },
          policyType: { select: { name: true } },
        },
      });

      let nextCursor: string | undefined;
      if (rows.length > q.limit) {
        const last = rows.pop();
        nextCursor = last?.id;
      }
      res.json({ items: rows, nextCursor });
    } catch (e) {
      next(e);
    }
  });

  const claimReportQuerySchema = z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    /** @deprecated use dateTo */
    asOfDate: z.string().optional(),
    villages: stringArrayQuery,
    matchStatus: z.enum(["MATCHED_EXACT", "UNLINKED", "CONFLICT"]).optional(),
    groupBy: z.enum(["category", "village", "sum_insured", "policy_type"]).default("village"),
    categoryKeys: stringArrayQuery,
    policyGroupings: stringArrayQuery,
    areas: stringArrayQuery,
    sumInsureds: stringArrayQuery,
    periodMonthTexts: stringArrayQuery,
    fiscalLabels: stringArrayQuery,
  });

  function normalizeClaimReportQuery(q: z.infer<typeof claimReportQuerySchema>) {
    const dateFrom = parseOptionalDate(q.dateFrom);
    const dateTo =
      parseOptionalDate(q.dateTo) ??
      parseOptionalDate(q.asOfDate) ??
      (dateFrom ? null : new Date());
    return {
      dateFrom,
      dateTo,
      villages: [...new Set(q.villages ?? [])],
      matchStatus: q.matchStatus,
      groupBy: q.groupBy,
      categoryKeys: [...new Set(q.categoryKeys ?? [])],
      policyGroupings: [...new Set(q.policyGroupings ?? [])],
      areas: [...new Set(q.areas ?? [])],
      sumInsureds: [...new Set(q.sumInsureds ?? [])],
      periodMonthTexts: [...new Set(q.periodMonthTexts ?? [])],
      fiscalLabels: [...new Set(q.fiscalLabels ?? [])],
    };
  }

  r.get(
    "/claim-report",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = claimReportQuerySchema.parse(req.query);
        const normalized = normalizeClaimReportQuery(q);
        const module = hasPermissionInSet(req.permissions!, "mis:read") ? "mis" : "dashboard";
        const scope = await loadMisScope(req.userId!, req.permissions!, module);
        const report = await getClaimReport(req.permissions!, scope, normalized);
        res.json(report);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/claim-report/detail",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = claimReportQuerySchema
          .extend({ drillVillage: z.string().optional() })
          .parse(req.query);
        const drillVillage = q.drillVillage?.trim() || null;
        if (!drillVillage) {
          res.status(400).json({ success: false, message: "drillVillage is required" });
          return;
        }
        const normalized = normalizeClaimReportQuery({ ...q, groupBy: "category" });
        const module = hasPermissionInSet(req.permissions!, "mis:read") ? "mis" : "dashboard";
        const scope = await loadMisScope(req.userId!, req.permissions!, module);
        const report = await getClaimReport(req.permissions!, scope, {
          ...normalized,
          groupBy: "category",
          villages: [drillVillage],
        });
        res.json({ drillVillage, rows: report.rows });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/claim-trend",
    requireAnyPermission(["mis:read", "dashboard:read"]),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            asOfDate: z.string().optional(),
            villages: stringArrayQuery,
            matchStatus: z.enum(["MATCHED_EXACT", "UNLINKED", "CONFLICT"]).optional(),
            period: z.enum(["month", "quarter", "year"]).default("month"),
            categoryKeys: stringArrayQuery,
            policyGroupings: stringArrayQuery,
            areas: stringArrayQuery,
            sumInsureds: stringArrayQuery,
            periodMonthTexts: stringArrayQuery,
            fiscalLabels: stringArrayQuery,
          })
          .parse(req.query);
        const normalized = normalizeClaimReportQuery({
          ...q,
          groupBy: "village",
        });
        const module = hasPermissionInSet(req.permissions!, "mis:read") ? "mis" : "dashboard";
        const scope = await loadMisScope(req.userId!, req.permissions!, module);
        const report = await getClaimTrend(req.permissions!, scope, {
          ...normalized,
          period: q.period,
        });
        res.json(report);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/export/claim-report.csv",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = claimReportQuerySchema.parse(req.query);
        const normalized = normalizeClaimReportQuery(q);
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const report = await getClaimReport(req.permissions!, scope, normalized);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="claim-mis-report.csv"');
        res.write("label,claimCount,sumClaimAmount,sumApprovedAmount,sumDeductionAmount\n");
        for (const row of report.rows) {
          res.write(
            [
              JSON.stringify(row.label),
              row.claimCount,
              row.sumClaimAmount,
              row.sumApprovedAmount,
              row.sumDeductionAmount,
            ].join(",") + "\n",
          );
        }
        res.end();
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
