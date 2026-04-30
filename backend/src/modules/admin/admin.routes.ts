import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { CategoryType, ChartMode, PolicyChartKind } from "@prisma/client";
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

  r.patch("/policy-types/:id", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      const body = z
        .object({
          key: z.string().min(1).optional(),
          name: z.string().min(1).optional(),
          chartMode: z.nativeEnum(ChartMode).optional(),
          description: z.string().optional().nullable(),
        })
        .parse(req.body);
      const row = await prisma.policyType.update({
        where: { id },
        data: body,
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.delete("/policy-types/:id", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      await prisma.policyType.delete({
        where: { id: String(req.params.id) },
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.get("/categories", requirePermission("admin:policyTypes"), async (_req, res, next) => {
    try {
      const rows = await prisma.category.findMany({
        orderBy: [{ type: "asc" }, { key: "asc" }],
      });
      res.json({ items: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/categories", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      const body = z
        .object({
          key: z.string().trim().min(1).max(32),
          name: z.string().trim().min(1).max(128),
          type: z.nativeEnum(CategoryType),
        })
        .parse(req.body);
      const row = await prisma.category.create({ data: body });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  r.patch("/categories/:id", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      const body = z
        .object({
          key: z.string().trim().min(1).max(32).optional(),
          name: z.string().trim().min(1).max(128).optional(),
          type: z.nativeEnum(CategoryType).optional(),
        })
        .parse(req.body);
      const row = await prisma.category.update({
        where: { id },
        data: body,
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.delete("/categories/:id", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      await prisma.category.delete({
        where: { id: String(req.params.id) },
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.get("/policy-groupings", requirePermission("admin:policyTypes"), async (_req, res, next) => {
    try {
      const rows = await prisma.policyGroupingOption.findMany({
        orderBy: { name: "asc" },
      });
      res.json({ items: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/policy-groupings", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(1).max(64),
        })
        .parse(req.body);
      const row = await prisma.policyGroupingOption.create({
        data: { name: body.name },
      });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  r.delete("/policy-groupings/:id", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      await prisma.policyGroupingOption.delete({
        where: { id: String(req.params.id) },
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.patch("/policy-groupings/:id", requirePermission("admin:policyTypes"), async (req, res, next) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      const body = z
        .object({
          name: z.string().trim().min(1).max(64),
        })
        .parse(req.body);
      const row = await prisma.policyGroupingOption.update({
        where: { id },
        data: { name: body.name },
      });
      res.json(row);
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
