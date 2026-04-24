import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import {
  createPolicyWithYear,
  updatePolicySections,
  type PolicySectionPatch,
  type PolicyYearSectionPatch,
} from "./policy.service.js";
import { createPolicyBodySchema, patchPolicyBodySchema } from "./policy.schemas.js";
import { AppError } from "../../errors/app-error.js";
import {
  assertPolicyReadable,
  buildPolicyReadWhere,
  loadMisScope,
} from "../../services/mis-scope.service.js";

function patchBodyToInput(
  body: z.infer<typeof patchPolicyBodySchema>,
): { policy: PolicySectionPatch; year?: PolicyYearSectionPatch } {
  const policy: PolicySectionPatch = {};
  if (body.policyNo !== undefined) policy.policyNo = body.policyNo;
  if (body.village !== undefined) policy.village = body.village;
  if (body.pod !== undefined) policy.pod = body.pod;
  if (body.addressLine1 !== undefined) policy.addressLine1 = body.addressLine1;
  if (body.addressLine2 !== undefined) policy.addressLine2 = body.addressLine2;
  if (body.city !== undefined) policy.city = body.city;
  if (body.state !== undefined) policy.state = body.state;
  if (body.pincode !== undefined) policy.pincode = body.pincode;
  if (body.contactPhone !== undefined) policy.contactPhone = body.contactPhone;
  if (body.nomineeName !== undefined) policy.nomineeName = body.nomineeName;
  if (body.nomineeRelation !== undefined) policy.nomineeRelation = body.nomineeRelation;
  if (body.loanRef !== undefined) policy.loanRef = body.loanRef;
  if (body.courierTracking !== undefined) policy.courierTracking = body.courierTracking;
  if (body.remarks !== undefined) policy.remarks = body.remarks;

  const y = {
    yearLabel: body.yearLabel,
    policyStart: body.policyStart,
    policyEnd: body.policyEnd,
    sumInsured: body.sumInsured,
    paymentMode: body.paymentMode,
    paymentType: body.paymentType,
    amountReceived: body.amountReceived,
    bankName: body.bankName,
    bankAccountLast4: body.bankAccountLast4,
    utrRef: body.utrRef,
    yearRemarks: body.yearRemarks,
  };
  const hasYear = y.yearLabel && Object.entries(y).some(([k, v]) => k !== "yearLabel" && v !== undefined);
  if (!hasYear) {
    return { policy };
  }
  const year: PolicyYearSectionPatch = { yearLabel: y.yearLabel! };
  if (y.policyStart !== undefined) year.policyStart = y.policyStart;
  if (y.policyEnd !== undefined) year.policyEnd = y.policyEnd;
  if (y.sumInsured !== undefined) year.sumInsured = y.sumInsured;
  if (y.paymentMode !== undefined) year.paymentMode = y.paymentMode;
  if (y.paymentType !== undefined) year.paymentType = y.paymentType;
  if (y.amountReceived !== undefined) year.amountReceived = y.amountReceived;
  if (y.bankName !== undefined) year.bankName = y.bankName;
  if (y.bankAccountLast4 !== undefined) year.bankAccountLast4 = y.bankAccountLast4;
  if (y.utrRef !== undefined) year.utrRef = y.utrRef;
  if (y.yearRemarks !== undefined) year.yearRemarks = y.yearRemarks;
  return { policy, year };
}

export function createPolicyRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post("/", requirePermission("policy:create"), async (req, res, next) => {
    try {
      const body = createPolicyBodySchema.parse(req.body);
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
          village: z.string().optional(),
        })
        .parse(req.query);

      const scope = await loadMisScope(req.userId!, req.userRole!);
      const scopeWhere = buildPolicyReadWhere(
        scope,
        q.village,
        req.userId!,
        req.userRole!,
      );
      const searchWhere = q.search
        ? {
            OR: [
              { policyNo: { contains: q.search } },
              { insuredParty: { svkkPublicId: { contains: q.search } } },
              { insuredParty: { name: { contains: q.search } } },
              { insuredParty: { mobile: { contains: q.search } } },
            ],
          }
        : undefined;
      const where = searchWhere ? { AND: [scopeWhere, searchWhere] } : scopeWhere;

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
      const scope = await loadMisScope(req.userId!, req.userRole!);
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
      assertPolicyReadable(row, req.userId!, req.userRole!, scope);
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("policy:update"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.userRole!);
      const existing = await prisma.policy.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, village: true, createdById: true },
      });
      if (!existing) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(existing, req.userId!, req.userRole!, scope);

      const parsed = patchPolicyBodySchema.parse(req.body);
      const { policy, year } = patchBodyToInput(parsed);
      const row = await updatePolicySections({
        actorUserId: req.userId!,
        policyId: String(req.params.id),
        policy,
        year,
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", requirePermission("policy:delete"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.userRole!);
      const existing = await prisma.policy.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, village: true, createdById: true },
      });
      if (!existing) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(existing, req.userId!, req.userRole!, scope);

      await prisma.policy.delete({ where: { id: String(req.params.id) } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
