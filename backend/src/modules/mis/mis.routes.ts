import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";

export function createMisRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/summary", requirePermission("mis:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          village: z.string().optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
          limit: z.coerce.number().min(1).max(100).default(1),
        })
        .parse(req.query);

      const policyWhere =
        q.village || q.from || q.to
          ? {
              ...(q.village ? { village: q.village } : {}),
              ...(q.from || q.to
                ? {
                    createdAt: {
                      ...(q.from ? { gte: q.from } : {}),
                      ...(q.to ? { lte: q.to } : {}),
                    },
                  }
                : {}),
            }
          : undefined;

      const [policyCount, claimAgg] = await prisma.$transaction([
        prisma.policy.count({ where: policyWhere }),
        prisma.claim.aggregate({
          _count: { id: true },
          _sum: { claimAmount: true, approvedAmount: true },
        }),
      ]);

      res.json({
        totalPolicies: policyCount,
        totalClaims: claimAgg._count.id,
        totalClaimAmount: claimAgg._sum.claimAmount ?? 0,
        totalApprovedAmount: claimAgg._sum.approvedAmount ?? 0,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/policies", requirePermission("mis:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
        })
        .parse(req.query);

      const rows = await prisma.policy.findMany({
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
