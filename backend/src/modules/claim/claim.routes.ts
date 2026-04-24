import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { ClaimStatus } from "@prisma/client";
export function createClaimRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post("/", requirePermission("claim:create"), async (req, res, next) => {
    try {
      const body = z
        .object({
          claimNo: z.string().min(1),
          svkkPublicId: z.string().min(1),
          policyYear: z.string().min(1),
          policyId: z.string().optional().nullable(),
          patientName: z.string().optional().nullable(),
          status: z.nativeEnum(ClaimStatus).default(ClaimStatus.PENDING),
          claimAmount: z.number().nonnegative().optional().nullable(),
          approvedAmount: z.number().nonnegative().optional().nullable(),
          village: z.string().optional().nullable(),
        })
        .parse(req.body);

      const party = await prisma.insuredParty.findFirst({
        where: { svkkPublicId: body.svkkPublicId },
      });

      const row = await prisma.claim.create({
        data: {
          claimNo: body.claimNo,
          svkkPublicId: body.svkkPublicId,
          insuredPartyId: party?.id,
          policyId: body.policyId ?? undefined,
          policyYear: body.policyYear,
          patientName: body.patientName ?? undefined,
          status: body.status,
          claimAmount: body.claimAmount ?? undefined,
          approvedAmount: body.approvedAmount ?? undefined,
          village: body.village ?? undefined,
          createdById: req.userId,
        },
      });
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  r.get("/", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
          svkkPublicId: z.string().optional(),
          policyYear: z.string().optional(),
        })
        .parse(req.query);

      const rows = await prisma.claim.findMany({
        where: {
          ...(q.svkkPublicId ? { svkkPublicId: q.svkkPublicId } : {}),
          ...(q.policyYear ? { policyYear: q.policyYear } : {}),
        },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
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

  r.get("/grouped", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          limit: z.coerce.number().min(1).max(100).default(50),
        })
        .parse(req.query);

      const grouped = await prisma.claim.groupBy({
        by: ["svkkPublicId"],
        _count: { id: true },
        _sum: { claimAmount: true, approvedAmount: true },
        orderBy: { svkkPublicId: "asc" },
        take: q.limit,
      });

      res.json({ items: grouped });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("claim:update"), async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.nativeEnum(ClaimStatus).optional(),
          approvedAmount: z.number().nonnegative().optional().nullable(),
        })
        .parse(req.body);

      const update: Record<string, unknown> = { ...body };
      if (body.status === ClaimStatus.APPROVED) {
        update.approvedById = req.userId;
      }

      const row = await prisma.claim.update({
        where: { id: String(req.params.id) },
        data: update as object,
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", requirePermission("claim:delete"), async (req, res, next) => {
    try {
      await prisma.claim.delete({ where: { id: String(req.params.id) } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
