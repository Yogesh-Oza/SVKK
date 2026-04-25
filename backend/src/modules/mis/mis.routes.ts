import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import {
  buildMisVillageWhere,
  loadMisScope,
  mergeDateRange,
} from "../../services/mis-scope.service.js";
import {
  getDashboardMetrics,
  getPolicyMemberReport,
  getVillageReport,
} from "./mis.service.js";

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

        const scope = await loadMisScope(req.userId!, req.userRole!);
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
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            village: z.string().optional(),
            asOfDate: z.string().optional(),
          })
          .parse(req.query);
        const scope = await loadMisScope(req.userId!, req.userRole!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const m = await getDashboardMetrics(
          req.userId!,
          req.userRole!,
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
    "/village-report",
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = z
          .object({ village: z.string().optional(), asOfDate: z.string().optional() })
          .parse(req.query);
        const scope = await loadMisScope(req.userId!, req.userRole!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const rep = await getVillageReport(
          req.userId!,
          req.userRole!,
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
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const q = z
          .object({
            asOfDate: z.string().optional(),
            village: z.string().optional(),
            groupBy: z
              .enum(["village", "area", "policy_type", "sum_insured", "age"])
              .default("village"),
            categoryKey: z.string().optional(),
            policyGrouping: z.string().optional(),
            month: z.coerce.number().int().min(1).max(12).optional(),
            year: z.coerce.number().int().min(2000).max(2100).optional(),
            fiscalLabel: z.string().optional(),
          })
          .parse(req.query);
        const scope = await loadMisScope(req.userId!, req.userRole!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const rep = await getPolicyMemberReport(
          req.userId!,
          req.userRole!,
          scope,
          asOf,
          q.village,
          {
            groupBy: q.groupBy,
            categoryKey: q.categoryKey?.trim() || null,
            policyGrouping: q.policyGrouping?.trim() || null,
            month: q.month ?? null,
            year: q.year ?? null,
            fiscalLabel: q.fiscalLabel?.trim() || null,
          },
        );
        res.json(rep);
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
        const q = z
          .object({
            asOfDate: z.string().optional(),
            village: z.string().optional(),
            groupBy: z
              .enum(["village", "area", "policy_type", "sum_insured", "age"])
              .default("village"),
            categoryKey: z.string().optional(),
            policyGrouping: z.string().optional(),
            month: z.coerce.number().int().min(1).max(12).optional(),
            year: z.coerce.number().int().min(2000).max(2100).optional(),
            fiscalLabel: z.string().optional(),
          })
          .parse(req.query);
        const scope = await loadMisScope(req.userId!, req.userRole!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const rep = await getPolicyMemberReport(
          req.userId!,
          req.userRole!,
          scope,
          asOf,
          q.village,
          {
            groupBy: q.groupBy,
            categoryKey: q.categoryKey?.trim() || null,
            policyGrouping: q.policyGrouping?.trim() || null,
            month: q.month ?? null,
            year: q.year ?? null,
            fiscalLabel: q.fiscalLabel?.trim() || null,
          },
        );
        const cols = [
          "label",
          "totalPolicies",
          "membersPlusPolicies",
          "cntAshaKiran",
          "cntFamilyFloater",
          "cntIndividual",
          "sumVkk",
          "sumCo",
          "sumGross",
          "sumComm",
          "sumTwoLac",
          "sumPolHolder",
          "sumGaam",
          "sumRefund",
          "sumCd",
          "age0_18",
          "age19_35",
          "age36_45",
          "age46_50",
          "age51_55",
          "age56_60",
          "age61_65",
          "age65p",
        ] as const;
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
        const scope = await loadMisScope(req.userId!, req.userRole!);
        const asOf = parseAsOf({ asOfDate: q.asOfDate });
        const rep = await getVillageReport(
          req.userId!,
          req.userRole!,
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

      const scope = await loadMisScope(req.userId!, req.userRole!);
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

  return r;
}
