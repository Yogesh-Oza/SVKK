import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import {
  createPolicyWithYear,
  updatePolicySections,
  softDeletePolicy,
  type InsuredPartySectionPatch,
  type PolicySectionPatch,
  type PolicyYearSectionPatch,
} from "./policy.service.js";
import {
  createPolicyBodySchema,
  patchPolicyBodySchema,
  yearValueKeys,
  type PolicyMemberReplaceRow,
} from "./policy.schemas.js";
import {
  buildPolicyListWhere,
  distinctFilterOptions,
  queryPolicyList,
  type PolicyListQuery,
} from "./policy.list.js";
import { AdProductVariant, ChequeStatus, PolicyGrouping } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { resolveIdempotency, storeIdempotencyResult } from "../../services/idempotency.service.js";
import { maskInsuredParty } from "../../domain/pii.js";
import {
  assertPolicyReadable,
  buildPolicyReadWhere,
  loadMisScope,
} from "../../services/mis-scope.service.js";

function patchBodyToInput(
  body: z.infer<typeof patchPolicyBodySchema>,
): {
  expectedUpdatedAt?: Date;
  policy: PolicySectionPatch;
  year?: PolicyYearSectionPatch;
  insuredParty?: InsuredPartySectionPatch;
  replaceMembers?: { yearLabel: string; members: PolicyMemberReplaceRow[] };
} {
  const { expectedUpdatedAt, insuredParty: partyBody, members: membersBody, ...rest } = body;
  const policy: PolicySectionPatch = {};
  if (rest.policyNo !== undefined) policy.policyNo = rest.policyNo;
  if (rest.categoryId !== undefined) policy.categoryId = rest.categoryId;
  if (rest.village !== undefined) policy.village = rest.village;
  if (rest.pod !== undefined) policy.pod = rest.pod;
  if (rest.addressLine1 !== undefined) policy.addressLine1 = rest.addressLine1;
  if (rest.addressLine2 !== undefined) policy.addressLine2 = rest.addressLine2;
  if (rest.addressLine3 !== undefined) policy.addressLine3 = rest.addressLine3;
  if (rest.addressLine4 !== undefined) policy.addressLine4 = rest.addressLine4;
  if (rest.city !== undefined) policy.city = rest.city;
  if (rest.state !== undefined) policy.state = rest.state;
  if (rest.pincode !== undefined) policy.pincode = rest.pincode;
  if (rest.contactPhone !== undefined) policy.contactPhone = rest.contactPhone;
  if (rest.nomineeName !== undefined) policy.nomineeName = rest.nomineeName;
  if (rest.nomineeRelation !== undefined) policy.nomineeRelation = rest.nomineeRelation;
  if (rest.loanRef !== undefined) policy.loanRef = rest.loanRef;
  if (rest.courierTracking !== undefined) policy.courierTracking = rest.courierTracking;
  if (rest.remarks !== undefined) policy.remarks = rest.remarks;
  if (rest.adProductVariant !== undefined) policy.adProductVariant = rest.adProductVariant;
  if (rest.insuranceCompany !== undefined) policy.insuranceCompany = rest.insuranceCompany;
  if (rest.tpa !== undefined) policy.tpa = rest.tpa;
  if (rest.categoryText !== undefined) policy.categoryText = rest.categoryText;
  if (rest.holderRelationship !== undefined) policy.holderRelationship = rest.holderRelationship;
  if (rest.holderAge !== undefined) policy.holderAge = rest.holderAge;
  if (rest.personsInsuredCount !== undefined) policy.personsInsuredCount = rest.personsInsuredCount;
  if (rest.area !== undefined) policy.area = rest.area;
  if (rest.referenceNo !== undefined) policy.referenceNo = rest.referenceNo;
  if (rest.mobileSecondary !== undefined) policy.mobileSecondary = rest.mobileSecondary;
  if (rest.policyGrouping !== undefined) policy.policyGrouping = rest.policyGrouping;
  if (rest.policyUrl !== undefined) policy.policyUrl = rest.policyUrl;
  if (rest.loanStatus !== undefined) policy.loanStatus = rest.loanStatus;
  if (rest.loanAmount !== undefined) policy.loanAmount = rest.loanAmount;
  if (rest.refundChequeAmount !== undefined) policy.refundChequeAmount = rest.refundChequeAmount;
  if (rest.refundChequeNo !== undefined) policy.refundChequeNo = rest.refundChequeNo;
  if (rest.refundChequeDate !== undefined) policy.refundChequeDate = rest.refundChequeDate;
  if (rest.cdAccountUsed !== undefined) policy.cdAccountUsed = rest.cdAccountUsed;
  if (rest.cdAmount !== undefined) policy.cdAmount = rest.cdAmount;
  if (rest.courierStatus !== undefined) policy.courierStatus = rest.courierStatus;
  if (rest.courierDate !== undefined) policy.courierDate = rest.courierDate;
  if (rest.courierAddress !== undefined) policy.courierAddress = rest.courierAddress;
  if (rest.periodYearText !== undefined) policy.periodYearText = rest.periodYearText;
  if (rest.periodMonthText !== undefined) policy.periodMonthText = rest.periodMonthText;

  let insuredParty: InsuredPartySectionPatch | undefined;
  if (partyBody) {
    const entries = Object.entries(partyBody).filter(([, v]) => v !== undefined);
    if (entries.length > 0) {
      insuredParty = Object.fromEntries(entries) as InsuredPartySectionPatch;
    }
  }

  const replaceMembers =
    membersBody != null && membersBody.length > 0 && rest.yearLabel
      ? { yearLabel: rest.yearLabel, members: membersBody }
      : undefined;

  const raw = rest as Record<string, unknown>;
  const hasYear =
    Boolean(rest.yearLabel) && yearValueKeys.some((k) => raw[k] !== undefined);
  if (!hasYear) {
    return {
      policy,
      ...(insuredParty ? { insuredParty } : {}),
      ...(replaceMembers ? { replaceMembers } : {}),
      ...(expectedUpdatedAt != null ? { expectedUpdatedAt } : {}),
    };
  }
  const year: PolicyYearSectionPatch = { yearLabel: rest.yearLabel! };
  for (const k of yearValueKeys) {
    const v = raw[k];
    if (v !== undefined) {
      Object.assign(year, { [k]: v });
    }
  }
  return {
    policy,
    year,
    ...(insuredParty ? { insuredParty } : {}),
    ...(replaceMembers ? { replaceMembers } : {}),
    ...(expectedUpdatedAt != null ? { expectedUpdatedAt } : {}),
  };
}

export function createPolicyRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post("/", requirePermission("policy:create"), async (req, res, next) => {
    try {
      const idemKey = req.header("idempotency-key")?.trim();
      if (idemKey) {
        const idem = await resolveIdempotency(req.userId!, idemKey, req.body);
        if (idem.hit === "conflict") {
          return res.status(409).json({
            success: false,
            code: "IDEMPOTENCY_CONFLICT",
            message: "Idempotency-Key was reused with a different request body",
          });
        }
        if (idem.hit === "same" && idem.responseJson) {
          return res.status(idem.httpStatus ?? 201).type("json").send(idem.responseJson);
        }
      }

      const body = createPolicyBodySchema.parse(req.body);
      const out = await createPolicyWithYear({
        actorUserId: req.userId!,
        ...body,
      });
      const json = JSON.stringify(out);
      if (idemKey) {
        await storeIdempotencyResult(req.userId!, idemKey, req.body, json, 201);
      }
      res.status(201).type("json").send(json);
    } catch (e) {
      next(e);
    }
  });

  r.get(
    "/filters",
    requirePermission("policy:read"),
    async (req, res, next) => {
      try {
        const scope = await loadMisScope(req.userId!, req.userRole!);
        const q = z.object({ village: z.string().optional() }).parse(req.query);
        const scopeWhere = buildPolicyReadWhere(scope, q.village, req.userId!, req.userRole!);
        const options = await distinctFilterOptions(scopeWhere);
        res.json(options);
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    "/bulk-delete",
    requirePermission("policy:delete"),
    async (req, res, next) => {
      try {
        const body = z
          .object({ ids: z.array(z.string().min(1)).min(1).max(200) })
          .parse(req.body);
        const scope = await loadMisScope(req.userId!, req.userRole!);
        for (const id of body.ids) {
          const existing = await prisma.policy.findUnique({
            where: { id, deletedAt: null },
            select: { id: true, village: true, createdById: true },
          });
          if (!existing) {
            throw new AppError("NOT_FOUND", `Policy not found: ${id}`, 404);
          }
          assertPolicyReadable(existing, req.userId!, req.userRole!, scope);
        }
        for (const id of body.ids) {
          await softDeletePolicy({ actorUserId: req.userId!, policyId: id });
        }
        res.json({ ok: true, count: body.ids.length });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get("/", requirePermission("policy:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          cursor: z.string().optional(),
          limit: z.coerce.number().min(1).max(100).default(20),
          page: z.coerce.number().int().min(1).optional(),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
          village: z.string().optional(),
          yearLabel: z.string().optional(),
          periodYearText: z.string().optional(),
          periodMonthText: z.string().optional(),
          categoryId: z.string().optional(),
          categoryKey: z.string().optional(),
          policyTypeId: z.string().optional(),
          adProductVariant: z.nativeEnum(AdProductVariant).optional(),
          month: z.coerce.number().min(1).max(12).optional(),
          year: z.coerce.number().min(1990).max(2100).optional(),
          area: z.string().optional(),
          sumInsured: z.string().optional(),
          policyGrouping: z.nativeEnum(PolicyGrouping).optional(),
          chequeStatus: z.nativeEnum(ChequeStatus).optional(),
          sort: z.string().optional(),
        })
        .parse(req.query);

      const usePage = q.page != null;
      const listFilter: PolicyListQuery = {
        search: q.search,
        village: q.village,
        yearLabel: q.yearLabel,
        periodYearText: q.periodYearText,
        periodMonthText: q.periodMonthText,
        categoryId: q.categoryId,
        categoryKey: q.categoryKey,
        policyTypeId: q.policyTypeId,
        adProductVariant: q.adProductVariant,
        month: q.month,
        year: q.year,
        area: q.area,
        sumInsuredStr: q.sumInsured,
        policyGrouping: q.policyGrouping,
        chequeStatus: q.chequeStatus,
        sort: q.sort,
      };

      const scope = await loadMisScope(req.userId!, req.userRole!);
      const where = buildPolicyListWhere(scope, req.userId!, req.userRole!, listFilter);
      const out = await queryPolicyList({
        where,
        sort: listFilter.sort,
        page: usePage ? q.page : undefined,
        pageSize: q.pageSize,
        usePage,
        cursor: q.cursor,
        limit: q.limit,
      });
      if ("nextCursor" in out) {
        res.json({
          items: out.items.map((r) => ({
            ...r,
            insuredParty: maskInsuredParty(req.userRole!, r.insuredParty),
          })),
          nextCursor: out.nextCursor,
        });
      } else {
        res.json({
          items: out.items.map((r) => ({
            ...r,
            insuredParty: maskInsuredParty(req.userRole!, r.insuredParty),
          })),
          total: out.total,
          page: out.page,
          pageSize: out.pageSize,
          totalPages: out.totalPages,
        });
      }
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", requirePermission("policy:read"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.userRole!);
      const row = await prisma.policy.findFirst({
        where: { id: String(req.params.id), deletedAt: null },
        include: {
          insuredParty: true,
          policyType: true,
          category: true,
          years: {
            where: { deletedAt: null },
            orderBy: { yearLabel: "desc" },
            include: {
              members: { where: { deletedAt: null } },
              policyChart: true,
              payments: { where: { deletedAt: null }, include: { cheque: true } },
            },
          },
        },
      });
      if (!row) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(row, req.userId!, req.userRole!, scope);
      res.json({
        ...row,
        insuredParty: maskInsuredParty(req.userRole!, row.insuredParty),
      });
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
      const { policy, year, expectedUpdatedAt, insuredParty, replaceMembers } = patchBodyToInput(parsed);
      const row = await updatePolicySections({
        actorUserId: req.userId!,
        policyId: String(req.params.id),
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        policy,
        year,
        insuredParty,
        replaceMembers,
      });
      res.json({
        ...row,
        insuredParty: maskInsuredParty(req.userRole!, row.insuredParty),
      });
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

      await softDeletePolicy({
        actorUserId: req.userId!,
        policyId: String(req.params.id),
      });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
