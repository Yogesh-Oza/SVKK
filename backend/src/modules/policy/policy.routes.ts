import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import {
  createPolicyWithYear,
  allocateNextPolicyPublicId,
  allocateNextPolicyReferenceNo,
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
  type PaymentReplaceRow,
} from "./policy.schemas.js";
import {
  buildPolicyListWhere,
  distinctFilterOptions,
  POLICY_LIST_EXPORT_MAX_ROWS,
  queryPolicyList,
  type PolicyListQuery,
} from "./policy.list.js";
import {
  buildPoliciesExportCsv,
  queryPolicyListForExport,
} from "./policy.export-csv.js";
import { queryPolicyListGrouped } from "./policy.list-grouped.js";
import { AdProductVariant, ChequeStatus } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { resolveIdempotency, storeIdempotencyResult } from "../../services/idempotency.service.js";
import { maskInsuredParty } from "../../domain/pii.js";
import {
  assertPolicyReadable,
  buildPolicyReadWhere,
  loadMisScope,
} from "../../services/mis-scope.service.js";

/** Express may provide string | string[] for repeated query keys. */
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

const adVariantsQuery = z.preprocess((v) => {
  const arr = queryToStringArray(v);
  if (!arr?.length) return undefined;
  const parsed: AdProductVariant[] = [];
  for (const s of arr) {
    const r = z.nativeEnum(AdProductVariant).safeParse(s);
    if (r.success) parsed.push(r.data);
  }
  return parsed.length ? parsed : undefined;
}, z.array(z.nativeEnum(AdProductVariant)).optional());

const policyListFiltersSchema = z.object({
  search: z.string().optional(),
  village: z.string().optional(),
  villages: stringArrayQuery,
  yearLabel: z.string().optional(),
  periodYearText: z.string().optional(),
  periodYearTexts: stringArrayQuery,
  periodMonthText: z.string().optional(),
  periodMonthTexts: stringArrayQuery,
  categoryId: z.string().optional(),
  categoryIds: stringArrayQuery,
  categoryKey: z.string().optional(),
  policyTypeId: z.string().optional(),
  adProductVariant: z.nativeEnum(AdProductVariant).optional(),
  adProductVariants: adVariantsQuery,
  month: z.coerce.number().min(1).max(12).optional(),
  year: z.coerce.number().min(1990).max(2100).optional(),
  area: z.string().optional(),
  areas: stringArrayQuery,
  sumInsured: z.string().optional(),
  sumInsureds: stringArrayQuery,
  policyGrouping: z.string().trim().max(64).optional(),
  policyGroupings: stringArrayQuery,
  chequeStatus: z.nativeEnum(ChequeStatus).optional(),
  sort: z.string().optional(),
});

const policyListPagedQuerySchema = policyListFiltersSchema.extend({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  /** Default true: one row per SVKK ID with years[]. Set false for flat policy rows (search / carry-forward). */
  groupBySvkk: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v !== "false"),
});

function listFilterFromQuery(q: z.infer<typeof policyListFiltersSchema>): PolicyListQuery {
  return {
    search: q.search,
    village: q.village,
    villages: q.villages,
    yearLabel: q.yearLabel,
    periodYearText: q.periodYearText,
    periodYearTexts: q.periodYearTexts,
    periodMonthText: q.periodMonthText,
    periodMonthTexts: q.periodMonthTexts,
    categoryId: q.categoryId,
    categoryIds: q.categoryIds,
    categoryKey: q.categoryKey,
    policyTypeId: q.policyTypeId,
    adProductVariant: q.adProductVariant,
    adProductVariants: q.adProductVariants,
    month: q.month,
    year: q.year,
    area: q.area,
    areas: q.areas,
    sumInsuredStr: q.sumInsured,
    sumInsuredStrs: q.sumInsureds,
    policyGrouping: q.policyGrouping?.trim() || undefined,
    policyGroupings: q.policyGroupings,
    chequeStatus: q.chequeStatus,
    sort: q.sort,
  };
}

function preferredYearLabelsFromFilter(q: PolicyListQuery): string[] {
  const periodYearList =
    q.periodYearTexts != null && q.periodYearTexts.length > 0
      ? q.periodYearTexts
      : q.periodYearText?.trim()
        ? [q.periodYearText.trim()]
        : [];
  const yearLabelExtra = q.yearLabel?.trim() ? [q.yearLabel.trim()] : [];
  return [...new Set([...periodYearList, ...yearLabelExtra])];
}

function patchBodyToInput(
  body: z.infer<typeof patchPolicyBodySchema>,
): {
  expectedUpdatedAt?: Date;
  policy: PolicySectionPatch;
  year?: PolicyYearSectionPatch;
  insuredParty?: InsuredPartySectionPatch;
  replaceMembers?: { yearLabel: string; members: PolicyMemberReplaceRow[] };
  replacePayments?: { yearLabel: string; payments: PaymentReplaceRow[] };
} {
  const {
    expectedUpdatedAt,
    insuredParty: partyBody,
    members: membersBody,
    payments: paymentsBody,
    ...rest
  } = body;
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
  if (rest.whatsappNo !== undefined) policy.whatsappNo = rest.whatsappNo;
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
  if (rest.holderGender !== undefined) policy.holderGender = rest.holderGender;
  if (rest.holderAge !== undefined) policy.holderAge = rest.holderAge;
  if (rest.holderJoiningDate !== undefined) policy.holderJoiningDate = rest.holderJoiningDate;
  if (rest.holderAddOns !== undefined) policy.holderAddOns = rest.holderAddOns;
  if (rest.personsInsuredCount !== undefined) policy.personsInsuredCount = rest.personsInsuredCount;
  if (rest.area !== undefined) policy.area = rest.area;
  if (rest.referenceNo !== undefined) policy.referenceNo = rest.referenceNo;
  if (rest.mobileSecondary !== undefined) policy.mobileSecondary = rest.mobileSecondary;
  if (rest.policyGrouping !== undefined) policy.policyGrouping = rest.policyGrouping;
  if (rest.policyUrl !== undefined) policy.policyUrl = rest.policyUrl;
  if (rest.policyUrl2 !== undefined) policy.policyUrl2 = rest.policyUrl2;
  if (rest.loanStatus !== undefined) policy.loanStatus = rest.loanStatus;
  if (rest.loanAmount !== undefined) policy.loanAmount = rest.loanAmount;
  if (rest.refundChequeAmount !== undefined) policy.refundChequeAmount = rest.refundChequeAmount;
  if (rest.refundChequeNo !== undefined) policy.refundChequeNo = rest.refundChequeNo;
  if (rest.refundChequeDate !== undefined) policy.refundChequeDate = rest.refundChequeDate;
  if (rest.previousPolicyNo !== undefined) policy.previousPolicyNo = rest.previousPolicyNo;
  if (rest.previousEndDate !== undefined) policy.previousEndDate = rest.previousEndDate;
  if (rest.policyGroup !== undefined) policy.policyGroup = rest.policyGroup;
  if (rest.cdAccountUsed !== undefined) policy.cdAccountUsed = rest.cdAccountUsed;
  if (rest.cdAmount !== undefined) policy.cdAmount = rest.cdAmount;
  if (rest.courierStatus !== undefined) policy.courierStatus = rest.courierStatus;
  if (rest.courierDate !== undefined) policy.courierDate = rest.courierDate;
  if (rest.courierCompany !== undefined) policy.courierCompany = rest.courierCompany;
  if (rest.podNumber !== undefined) policy.podNumber = rest.podNumber;
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

  const replacePayments =
    paymentsBody !== undefined && rest.yearLabel
      ? { yearLabel: rest.yearLabel, payments: paymentsBody }
      : undefined;

  const raw = rest as Record<string, unknown>;
  const hasYear =
    Boolean(rest.yearLabel) && yearValueKeys.some((k) => raw[k] !== undefined);
  if (!hasYear) {
    return {
      policy,
      ...(insuredParty ? { insuredParty } : {}),
      ...(replaceMembers ? { replaceMembers } : {}),
      ...(replacePayments ? { replacePayments } : {}),
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
    ...(replacePayments ? { replacePayments } : {}),
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
        const scope = await loadMisScope(req.userId!, req.permissions!);
        const fq = z
          .object({
            village: z.string().optional(),
            villages: stringArrayQuery,
          })
          .parse(req.query);
        const scopeWhere = buildPolicyReadWhere(
          scope,
          fq.village,
          req.userId!,
          req.permissions!,
          fq.villages,
        );
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
        const scope = await loadMisScope(req.userId!, req.permissions!);
        for (const id of body.ids) {
          const existing = await prisma.policy.findUnique({
            where: { id, deletedAt: null },
            select: { id: true, village: true, createdById: true },
          });
          if (!existing) {
            throw new AppError("NOT_FOUND", `Policy not found: ${id}`, 404);
          }
          assertPolicyReadable(existing, req.userId!, req.permissions!, scope);
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
      const q = policyListPagedQuerySchema.parse(req.query);

      const usePage = q.page != null;
      const listFilter = listFilterFromQuery(q);

      const scope = await loadMisScope(req.userId!, req.permissions!);
      const where = buildPolicyListWhere(scope, req.userId!, req.permissions!, listFilter);
      const listArgs = {
        where,
        sort: listFilter.sort,
        page: usePage ? q.page : undefined,
        pageSize: q.pageSize,
        usePage,
        cursor: q.cursor,
        limit: q.limit,
      };
      const out = q.groupBySvkk
        ? await queryPolicyListGrouped(listArgs)
        : await queryPolicyList(listArgs);
      const mapItem = (r: (typeof out.items)[number]) => ({
        ...r,
        insuredParty: maskInsuredParty(req.permissions!, r.insuredParty),
      });
      if ("nextCursor" in out) {
        res.json({
          items: out.items.map(mapItem),
          nextCursor: out.nextCursor,
        });
      } else {
        res.json({
          items: out.items.map(mapItem),
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

  r.get("/export.csv", requirePermission("policy:read"), async (req, res, next) => {
    try {
      const q = policyListFiltersSchema.parse(req.query);
      const listFilter = listFilterFromQuery(q);
      const scope = await loadMisScope(req.userId!, req.permissions!);
      const where = buildPolicyListWhere(scope, req.userId!, req.permissions!, listFilter);
      const rows = await queryPolicyListForExport({ where, sort: listFilter.sort });
      if (rows.length === POLICY_LIST_EXPORT_MAX_ROWS) {
        const totalMatching = await prisma.policy.count({ where });
        if (totalMatching > POLICY_LIST_EXPORT_MAX_ROWS) {
          res.setHeader("X-Export-Truncated", "true");
        }
      }
      const csv = buildPoliciesExportCsv(
        rows,
        req.permissions!,
        preferredYearLabelsFromFilter(listFilter),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="policies-export.csv"');
      res.send(csv);
    } catch (e) {
      next(e);
    }
  });

  r.get("/next-svkk-id", requirePermission("policy:create"), async (req, res, next) => {
    try {
      const q = z
        .object({
          policyGrouping: z.string().trim().min(1),
          month: z.string().trim().min(1),
        })
        .parse(req.query);
      const svkkPublicId = await allocateNextPolicyPublicId({
        policyGrouping: q.policyGrouping,
        month: q.month,
      });
      res.json({ svkkPublicId });
    } catch (e) {
      next(e);
    }
  });

  r.get("/next-reference-no", requirePermission("policy:create"), async (req, res, next) => {
    try {
      const q = z
        .object({
          policyGrouping: z.string().trim().min(1),
          month: z.string().trim().min(1),
          year: z.string().trim().min(1),
        })
        .parse(req.query);
      const referenceNo = await allocateNextPolicyReferenceNo({
        policyGrouping: q.policyGrouping,
        month: q.month,
        year: q.year,
      });
      res.json({ referenceNo });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", requirePermission("policy:read"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.permissions!);
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
              receipts: { orderBy: { createdAt: "desc" }, take: 1, select: { receiptNo: true } },
            },
          },
        },
      });
      if (!row) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(row, req.userId!, req.permissions!, scope);
      res.json({
        ...row,
        insuredParty: maskInsuredParty(req.permissions!, row.insuredParty),
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("policy:update"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.permissions!);
      const existing = await prisma.policy.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, village: true, createdById: true },
      });
      if (!existing) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(existing, req.userId!, req.permissions!, scope);

      const parsed = patchPolicyBodySchema.parse(req.body);
      const { policy, year, expectedUpdatedAt, insuredParty, replaceMembers, replacePayments } =
        patchBodyToInput(parsed);
      const row = await updatePolicySections({
        actorUserId: req.userId!,
        policyId: String(req.params.id),
        expectedUpdatedAt: expectedUpdatedAt ?? undefined,
        policy,
        year,
        insuredParty,
        replaceMembers,
        replacePayments,
      });
      res.json({
        ...row,
        insuredParty: maskInsuredParty(req.permissions!, row.insuredParty),
      });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", requirePermission("policy:delete"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.permissions!);
      const existing = await prisma.policy.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, village: true, createdById: true },
      });
      if (!existing) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(existing, req.userId!, req.permissions!, scope);

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
