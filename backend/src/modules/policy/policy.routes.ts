import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { createPolicyWithYear } from "./policy.service.js";
import { AppError } from "../../errors/app-error.js";

export function createPolicyRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post("/", requirePermission("policy:create"), async (req, res, next) => {
    try {
      const body = z
        .object({
          mobile: z.string().min(1),
          partyName: z.string().min(1),
          email: z.string().email().optional().nullable(),
          policyTypeId: z.string().min(1),
          yearLabel: z.string().min(1),
          policyChartId: z.string().min(1),
          policyStart: z.coerce.date().optional().nullable(),
          policyEnd: z.coerce.date().optional().nullable(),
          sumInsured: z.number().positive(),
          policyNo: z.string().optional().nullable(),
          village: z.string().optional().nullable(),
          members: z
            .array(
              z.object({
                name: z.string().min(1),
                dob: z.coerce.date(),
                relationship: z.string().min(1),
                gender: z.string().min(1),
                riderAmount: z.number().nonnegative().optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body);

      const out = await createPolicyWithYear({
        actorUserId: req.userId!,
        ...body,
      });
      res.status(201).json(out);
    } catch (e) {
      next(e);
    }
  });

  r.get("/", requirePermission("policy:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          cursor: z.string().optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          search: z.string().optional(),
        })
        .parse(req.query);

      const where = q.search
        ? {
            OR: [
              { policyNo: { contains: q.search } },
              { insuredParty: { svkkPublicId: { contains: q.search } } },
              { insuredParty: { name: { contains: q.search } } },
              { insuredParty: { mobile: { contains: q.search } } },
            ],
          }
        : {};

      const rows = await prisma.policy.findMany({
        where,
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          insuredParty: true,
          policyType: true,
          years: { take: 3, orderBy: { yearLabel: "desc" } },
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

  r.get("/:id", requirePermission("policy:read"), async (req, res, next) => {
    try {
      const row = await prisma.policy.findUnique({
        where: { id: String(req.params.id) },
        include: {
          insuredParty: true,
          policyType: true,
          years: {
            orderBy: { yearLabel: "desc" },
            include: { members: true, policyChart: true },
          },
        },
      });
      if (!row) throw new AppError("NOT_FOUND", "Policy not found", 404);
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("policy:update"), async (req, res, next) => {
    try {
      const body = z
        .object({
          policyNo: z.string().optional().nullable(),
          village: z.string().optional().nullable(),
        })
        .parse(req.body);

      const row = await prisma.policy.update({
        where: { id: String(req.params.id) },
        data: body,
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", requirePermission("policy:delete"), async (req, res, next) => {
    try {
      await prisma.policy.delete({ where: { id: String(req.params.id) } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
