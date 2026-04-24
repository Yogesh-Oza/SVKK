import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { ChartMode, PolicyChartKind } from "@prisma/client";
import { invalidateChartCache } from "../premium/chart-cache.js";
import type { PremiumMatrixJson } from "../premium/premium.types.js";

export function createAdminRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post("/policy-types", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      const body = z
        .object({
          key: z.string().min(1),
          name: z.string().min(1),
          chartMode: z.nativeEnum(ChartMode),
          description: z.string().optional().nullable(),
        })
        .parse(req.body);

      const row = await prisma.policyType.create({ data: body });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  r.get("/policy-types", requirePermission("admin:policyTypes"), async (_req, res, next) => {
    try {
      const rows = await prisma.policyType.findMany({ orderBy: { name: "asc" } });
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  r.post("/policy-charts", requirePermission("admin:charts"), async (req, res, next) => {
    try {
      const body = z
        .object({
          policyTypeId: z.string().min(1),
          version: z.number().int().positive(),
          effectiveFrom: z.coerce.date(),
          chartKind: z.nativeEnum(PolicyChartKind).default(PolicyChartKind.COMBINED),
          premiumMatrix: z.custom<PremiumMatrixJson>((v) => v != null && typeof v === "object"),
        })
        .parse(req.body);

      const row = await prisma.policyChart.create({
        data: {
          policyTypeId: body.policyTypeId,
          version: body.version,
          effectiveFrom: body.effectiveFrom,
          chartKind: body.chartKind,
          premiumMatrix: body.premiumMatrix as object,
        },
      });
      invalidateChartCache(row.id);
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  r.get("/policy-charts", requirePermission("admin:charts"), async (req, res, next) => {
    try {
      const policyTypeId = z.string().optional().parse(req.query.policyTypeId);
      const rows = await prisma.policyChart.findMany({
        where: policyTypeId ? { policyTypeId } : undefined,
        orderBy: [{ policyTypeId: "asc" }, { version: "desc" }],
      });
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
