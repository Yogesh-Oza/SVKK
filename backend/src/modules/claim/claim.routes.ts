import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requireAnyPermission, requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { ClaimPolicyMatchStatus, ClaimStatus, CsvImportEntity, CsvJobStatus } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import {
  assertClaimInGeoScope,
  assertGeoFieldsOnWrite,
  buildMisVillageWhere,
  loadMisScope,
} from "../../services/mis-scope.service.js";
import { buildSampleClaimCsv, claimExportFilename } from "./claim-csv-format.js";
import {
  buildClaimListWhere,
  CLAIM_LIST_EXPORT_MAX_ROWS,
  CLAIM_LIST_PAGE_SIZE_MAX,
  distinctClaimFilterOptions,
  queryClaimListPaged,
  queryClaimsForExport,
  type ClaimListQuery,
} from "./claim.list.js";
import { queryClaimSummary } from "./claim.summary.js";
import { buildClaimsExportCsv } from "./claim.export-csv.js";
import { claimDetailSelect } from "./claim-detail.js";
import { resolveClaimManualPolicyLink, applyMatchedPolicySnapshots } from "./claim-policy-link.js";
import { claimUpdateBodySchema } from "./claim-update.schema.js";
import { parseClaimDate } from "./claim-csv-normalize.js";

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

const claimStatusesQuery = z.preprocess((v) => {
  const arr = queryToStringArray(v);
  if (!arr?.length) return undefined;
  const parsed: ClaimStatus[] = [];
  for (const s of arr) {
    const r = z.nativeEnum(ClaimStatus).safeParse(s);
    if (r.success) parsed.push(r.data);
  }
  return parsed.length ? parsed : undefined;
}, z.array(z.nativeEnum(ClaimStatus)).optional());

const matchStatusesQuery = z.preprocess((v) => {
  const arr = queryToStringArray(v);
  if (!arr?.length) return undefined;
  const parsed: ClaimPolicyMatchStatus[] = [];
  for (const s of arr) {
    const r = z.nativeEnum(ClaimPolicyMatchStatus).safeParse(s);
    if (r.success) parsed.push(r.data);
  }
  return parsed.length ? parsed : undefined;
}, z.array(z.nativeEnum(ClaimPolicyMatchStatus)).optional());

const claimListFiltersSchema = z.object({
  search: z.string().optional(),
  villages: stringArrayQuery,
  policyYears: stringArrayQuery,
  statuses: claimStatusesQuery,
  claimTypes: stringArrayQuery,
  matchStatuses: matchStatusesQuery,
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  admissionDateFrom: z.string().optional(),
  admissionDateTo: z.string().optional(),
  svkkPublicIds: stringArrayQuery,
  categoryKeys: stringArrayQuery,
  policyTypes: stringArrayQuery,
  policyGroupings: stringArrayQuery,
  insuranceCompanies: stringArrayQuery,
  areas: stringArrayQuery,
  statusTexts: stringArrayQuery,
  treatmentTypes: stringArrayQuery,
  diseaseCategories: stringArrayQuery,
  sort: z.string().optional(),
});

const claimListPagedQuerySchema = claimListFiltersSchema.extend({
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(CLAIM_LIST_PAGE_SIZE_MAX).default(20),
  limit: z.coerce.number().min(1).max(CLAIM_LIST_PAGE_SIZE_MAX).default(20),
  cursor: z.string().optional(),
  svkkPublicId: z.string().optional(),
  policyId: z.string().optional(),
  policyYear: z.string().optional(),
  village: z.string().optional(),
});

function listFilterFromQuery(
  q: z.infer<typeof claimListFiltersSchema> & {
    page?: number;
    pageSize?: number;
    policyId?: string;
    svkkPublicId?: string;
    policyYear?: string;
    village?: string;
  },
): ClaimListQuery {
  return {
    search: q.search,
    villages: q.villages?.length ? q.villages : q.village ? [q.village] : undefined,
    policyYears: q.policyYears?.length ? q.policyYears : q.policyYear ? [q.policyYear] : undefined,
    statuses: q.statuses,
    claimTypes: q.claimTypes,
    matchStatuses: q.matchStatuses,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    admissionDateFrom: q.admissionDateFrom,
    admissionDateTo: q.admissionDateTo,
    svkkPublicIds: q.svkkPublicIds,
    categoryKeys: q.categoryKeys,
    policyTypes: q.policyTypes,
    policyGroupings: q.policyGroupings,
    insuranceCompanies: q.insuranceCompanies,
    areas: q.areas,
    statusTexts: q.statusTexts,
    treatmentTypes: q.treatmentTypes,
    diseaseCategories: q.diseaseCategories,
    sort: q.sort,
    page: q.page,
    pageSize: q.pageSize,
    policyId: q.policyId,
    svkkPublicId: q.svkkPublicId,
  };
}

export function createClaimRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/export-sample.csv", requirePermission("claim:import"), (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="SVKK_Claim_Sample_Template.csv"',
    );
    res.send(buildSampleClaimCsv());
  });

  r.get("/filters", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const { claim: scopeWhere } = buildMisVillageWhere(scope, undefined);
      const options = await distinctClaimFilterOptions(scopeWhere);
      res.json(options);
    } catch (e) {
      next(e);
    }
  });

  r.get("/summary", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const q = claimListFiltersSchema.parse(req.query);
      const listFilter = listFilterFromQuery(q);
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const where = buildClaimListWhere(scope, listFilter);
      const summary = await queryClaimSummary(where);
      res.json(summary);
    } catch (e) {
      next(e);
    }
  });

  r.get("/export.csv", requirePermission("claim:export"), async (req, res, next) => {
    try {
      const q = claimListFiltersSchema.parse(req.query);
      const listFilter = listFilterFromQuery(q);
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const where = buildClaimListWhere(scope, listFilter);
      const rows = await queryClaimsForExport(where, listFilter.sort, CLAIM_LIST_EXPORT_MAX_ROWS);
      const truncated = rows.length >= CLAIM_LIST_EXPORT_MAX_ROWS;
      if (truncated) {
        res.setHeader("X-Export-Truncated", "true");
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${claimExportFilename()}"`,
      );
      res.send(buildClaimsExportCsv(rows));
    } catch (e) {
      next(e);
    }
  });

  r.get("/import-stats", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const q = z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
        })
        .parse(req.query);

      const from = q.from ? new Date(q.from) : undefined;
      const to = q.to ? new Date(q.to) : undefined;

      const jobs = await prisma.csvImportJob.findMany({
        where: {
          importEntity: CsvImportEntity.CLAIM,
          status: CsvJobStatus.COMPLETED,
          ...(from || to
            ? {
                completedAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { completedAt: "desc" },
        take: 100,
      });

      const totals = {
        jobs: jobs.length,
        totalRows: 0,
        matchedExact: 0,
        unlinked: 0,
        conflicts: 0,
        verificationWarnings: 0,
        created: 0,
        updated: 0,
        failed: 0,
      };

      for (const job of jobs) {
        totals.created += job.createdCount ?? 0;
        totals.updated += job.updatedCount ?? 0;
        totals.failed += job.failCount ?? 0;
        totals.totalRows += job.rowCount ?? 0;
        if (job.matchStatsJson) {
          try {
            const s = JSON.parse(job.matchStatsJson) as typeof totals;
            totals.matchedExact += s.matchedExact ?? 0;
            totals.unlinked += s.unlinked ?? 0;
            totals.conflicts += s.conflicts ?? 0;
            totals.verificationWarnings += s.verificationWarnings ?? 0;
          } catch {
            /* ignore malformed stats */
          }
        }
      }

      res.json({ totals, jobs: jobs.map((j) => ({
        id: j.id,
        fileName: j.fileName,
        completedAt: j.completedAt,
        matchStats: j.matchStatsJson ? JSON.parse(j.matchStatsJson) : null,
      })) });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("claim:create"), async (req, res, next) => {
    try {
      const body = z
        .object({
          claimNo: z.string().min(1),
          // Ignored: policy link is derived from policyNoText via matchPolicyForClaim.
          policyId: z.string().optional().nullable(),
        })
        .merge(claimUpdateBodySchema.partial())
        .extend({
          svkkPublicId: z.string().max(64).optional().default(""),
          policyYear: z.string().max(20).optional().default(""),
        })
        .parse(req.body);

      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");

      const link = await resolveClaimManualPolicyLink({
        policyNo: body.policyNoText,
        svkkPublicId: body.svkkPublicId,
        policyHolderName: body.policyHolderName,
        policyTypeText: body.policyTypeText,
        policyStartDate: body.policyStartDate,
        policyEndDate: body.policyEndDate,
        sumInsured: body.sumInsured,
        insuranceCompany: body.insuranceCompany,
        admissionDate: body.admissionDate,
        lodgeDate: body.lodgeDate,
        claimReceivedDate: body.claimReceivedDate,
      });
      const policyArea = link.policyArea;
      const snapshots = applyMatchedPolicySnapshots(
        {
          svkkPublicId: body.svkkPublicId,
          policyYear: body.policyYear,
          village: body.village,
          policyHolderName: body.policyHolderName,
          policyTypeText: body.policyTypeText,
          policyGroupingText: body.policyGroupingText,
          categoryText: body.categoryText,
        },
        link,
      );
      const village = snapshots.village ?? body.village ?? null;
      assertGeoFieldsOnWrite(
        { village, area: policyArea },
        scope,
        req.permissions!,
        "claim",
      );

      const resolvedSvkk = (snapshots.svkkPublicId ?? body.svkkPublicId).trim();
      const resolvedYear = (snapshots.policyYear ?? body.policyYear).trim();
      if (!resolvedSvkk) {
        throw new AppError(
          "SVKK_REQUIRED",
          "SVKK ID is required unless a matching Policy Number fills it from the policy",
          400,
        );
      }
      if (!resolvedYear) {
        throw new AppError(
          "POLICY_YEAR_REQUIRED",
          "Policy year is required unless a matching Policy Number fills it from the policy",
          400,
        );
      }

      const party = link.insuredPartyId
        ? null
        : await prisma.insuredParty.findFirst({
            where: { svkkPublicId: resolvedSvkk },
          });

      const { claimNo, policyId: _ignoredPolicyId, svkkPublicId, policyYear, ...rest } = body;
      const row = await prisma.claim.create({
        data: {
          claimNo,
          svkkPublicId: (snapshots.svkkPublicId ?? svkkPublicId) || resolvedSvkk,
          insuredPartyId: link.insuredPartyId ?? party?.id ?? null,
          policyId: link.policyId,
          policyYearId: link.policyYearId,
          policyYear: (snapshots.policyYear ?? policyYear) || resolvedYear,
          matchStatus: link.matchStatus,
          verificationWarnings:
            link.verificationWarnings.length > 0 ? link.verificationWarnings : undefined,
          status: body.status ?? ClaimStatus.PENDING,
          createdById: req.userId,
          ...rest,
          ...(snapshots.village != null ? { village: snapshots.village } : {}),
          ...(snapshots.policyHolderName != null ? { policyHolderName: snapshots.policyHolderName } : {}),
          ...(snapshots.policyTypeText != null ? { policyTypeText: snapshots.policyTypeText } : {}),
          ...(snapshots.policyGroupingText != null
            ? { policyGroupingText: snapshots.policyGroupingText }
            : {}),
          ...(snapshots.categoryText != null ? { categoryText: snapshots.categoryText } : {}),
        },
      });

      assertClaimInGeoScope(
        { village: row.village, policy: { area: policyArea } },
        req.permissions!,
        scope,
      );

      res.status(201).json({ ...row, policyLinkWarning: link.linkWarning });
    } catch (e) {
      next(e);
    }
  });

  r.post(
    "/match-preview",
    requireAnyPermission(["claim:read", "claim:create", "claim:update"]),
    async (req, res, next) => {
      try {
        const body = z
          .object({
            policyNoText: z.string().max(120).optional().nullable(),
            svkkPublicId: z.string().max(64).optional().nullable(),
            policyHolderName: z.string().max(200).optional().nullable(),
            policyTypeText: z.string().max(200).optional().nullable(),
            policyStartDate: z.string().optional().nullable(),
            policyEndDate: z.string().optional().nullable(),
            sumInsured: z.number().nonnegative().optional().nullable(),
            insuranceCompany: z.string().max(200).optional().nullable(),
            admissionDate: z.string().optional().nullable(),
            lodgeDate: z.string().optional().nullable(),
            claimReceivedDate: z.string().optional().nullable(),
          })
          .parse(req.body);

        const link = await resolveClaimManualPolicyLink({
          policyNo: body.policyNoText,
          svkkPublicId: body.svkkPublicId,
          policyHolderName: body.policyHolderName,
          policyTypeText: body.policyTypeText,
          policyStartDate: parseClaimDate(body.policyStartDate ?? ""),
          policyEndDate: parseClaimDate(body.policyEndDate ?? ""),
          sumInsured: body.sumInsured ?? null,
          insuranceCompany: body.insuranceCompany,
          admissionDate: parseClaimDate(body.admissionDate ?? ""),
          lodgeDate: parseClaimDate(body.lodgeDate ?? ""),
          claimReceivedDate: parseClaimDate(body.claimReceivedDate ?? ""),
        });

        res.json({
          matchStatus: link.matchStatus,
          matchReason: link.matchReason,
          linked: Boolean(link.policyId),
          matchedPolicyNo: link.matchedPolicyNo,
          yearLabel: link.yearLabel,
          svkkPublicId: link.svkkPublicId,
          holderName: link.holderName,
          village: link.village,
          policyTypeName: link.policyTypeName,
          policyGrouping: link.policyGrouping,
          categoryText: link.categoryText,
          verificationWarnings: link.verificationWarnings,
          linkWarning: link.linkWarning,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get("/", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const q = claimListPagedQuerySchema.parse(req.query);
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const listFilter = listFilterFromQuery(q);
      const where = buildClaimListWhere(scope, listFilter);

      if (q.page != null) {
        const out = await queryClaimListPaged(where, listFilter);
        res.json(out);
        return;
      }

      const rows = await prisma.claim.findMany({
        where,
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
          village: z.string().optional(),
        })
        .parse(req.query);

      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const { claim: claimWhere } = buildMisVillageWhere(scope, q.village);

      const grouped = await prisma.claim.groupBy({
        by: ["svkkPublicId"],
        where: claimWhere,
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

  r.post(
    "/bulk-delete",
    requirePermission("claim:delete"),
    async (req, res, next) => {
      try {
        const body = z
          .object({ ids: z.array(z.string().min(1)).min(1).max(500) })
          .parse(req.body);
        const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
        for (const id of body.ids) {
          const found = await prisma.claim.findUnique({
            where: { id },
            select: { id: true, village: true, policy: { select: { area: true } } },
          });
          if (!found) {
            throw new AppError("NOT_FOUND", `Claim not found: ${id}`, 404);
          }
          assertClaimInGeoScope(found, req.permissions!, scope);
        }
        await prisma.claim.deleteMany({ where: { id: { in: body.ids } } });
        res.json({ ok: true, count: body.ids.length });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get("/:id", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const row = await prisma.claim.findUnique({
        where: { id: String(req.params.id) },
        select: {
          ...claimDetailSelect,
          policy: {
            select: {
              policyNo: true,
              area: true,
              policyType: { select: { id: true, key: true, name: true } },
            },
          },
        },
      });
      if (!row) {
        throw new AppError("NOT_FOUND", "Claim not found", 404);
      }
      assertClaimInGeoScope(
        { village: row.village, policy: { area: row.policy?.area ?? null } },
        req.permissions!,
        scope,
      );
      const { policy, ...detail } = row;
      res.json({
        ...detail,
        policy: policy
          ? {
              policyNo: policy.policyNo,
              policyType: policy.policyType,
            }
          : null,
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("claim:update"), async (req, res, next) => {
    try {
      const body = claimUpdateBodySchema.parse(req.body);

      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const found = await prisma.claim.findUnique({
        where: { id: String(req.params.id) },
        select: {
          id: true,
          village: true,
          svkkPublicId: true,
          policyYear: true,
          policyHolderName: true,
          policyTypeText: true,
          policyGroupingText: true,
          categoryText: true,
          policyStartDate: true,
          policyEndDate: true,
          sumInsured: true,
          insuranceCompany: true,
          admissionDate: true,
          lodgeDate: true,
          claimReceivedDate: true,
          insuredPartyId: true,
          policy: { select: { area: true } },
        },
      });
      if (!found) {
        throw new AppError("NOT_FOUND", "Claim not found", 404);
      }
      assertClaimInGeoScope(found, req.permissions!, scope);

      const update: Record<string, unknown> = { ...body };
      let policyLinkWarning: string | null = null;
      let policyArea = found.policy?.area ?? null;

      // Rematch whenever policyNoText is present in the body (including null = clear).
      if (body.policyNoText !== undefined) {
        const sumInsured =
          body.sumInsured !== undefined
            ? body.sumInsured
            : found.sumInsured != null
              ? Number(found.sumInsured)
              : null;
        const link = await resolveClaimManualPolicyLink({
          policyNo: body.policyNoText,
          svkkPublicId: body.svkkPublicId ?? found.svkkPublicId,
          policyHolderName: body.policyHolderName ?? found.policyHolderName,
          policyTypeText: body.policyTypeText ?? found.policyTypeText,
          policyStartDate:
            body.policyStartDate !== undefined ? body.policyStartDate : found.policyStartDate,
          policyEndDate:
            body.policyEndDate !== undefined ? body.policyEndDate : found.policyEndDate,
          sumInsured,
          insuranceCompany: body.insuranceCompany ?? found.insuranceCompany,
          admissionDate:
            body.admissionDate !== undefined ? body.admissionDate : found.admissionDate,
          lodgeDate: body.lodgeDate !== undefined ? body.lodgeDate : found.lodgeDate,
          claimReceivedDate:
            body.claimReceivedDate !== undefined
              ? body.claimReceivedDate
              : found.claimReceivedDate,
        });
        policyLinkWarning = link.linkWarning;
        policyArea = link.policyArea;
        // Always overwrite link FKs so an invalid/cleared number cannot keep a stale policyId.
        update.policyId = link.policyId;
        update.policyYearId = link.policyYearId;
        update.matchStatus = link.matchStatus;
        update.verificationWarnings =
          link.verificationWarnings.length > 0 ? link.verificationWarnings : null;
        if (link.insuredPartyId) {
          update.insuredPartyId = link.insuredPartyId;
        } else if (body.svkkPublicId !== undefined) {
          const party = await prisma.insuredParty.findFirst({
            where: { svkkPublicId: body.svkkPublicId },
          });
          update.insuredPartyId = party?.id ?? null;
        }
        Object.assign(
          update,
          applyMatchedPolicySnapshots(
            {
              svkkPublicId: body.svkkPublicId ?? found.svkkPublicId,
              policyYear: body.policyYear ?? found.policyYear,
              village: body.village !== undefined ? body.village : found.village,
              policyHolderName: body.policyHolderName ?? found.policyHolderName,
              policyTypeText: body.policyTypeText ?? found.policyTypeText,
              policyGroupingText: body.policyGroupingText ?? found.policyGroupingText,
              categoryText: body.categoryText ?? found.categoryText,
            },
            link,
          ),
        );
        // When unlinked and SVKK unchanged, keep existing insuredPartyId.
      }

      const nextVillage =
        update.village !== undefined
          ? (update.village as string | null)
          : body.village !== undefined
            ? body.village
            : found.village;
      assertGeoFieldsOnWrite(
        { village: nextVillage, area: policyArea },
        scope,
        req.permissions!,
        "claim",
      );

      if (body.status === ClaimStatus.APPROVED) {
        update.approvedById = req.userId;
      }

      const row = await prisma.claim.update({
        where: { id: String(req.params.id) },
        data: update as object,
        select: claimDetailSelect,
      });
      res.json({ ...row, policyLinkWarning });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", requirePermission("claim:delete"), async (req, res, next) => {
    try {
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const found = await prisma.claim.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, village: true, policy: { select: { area: true } } },
      });
      if (!found) {
        throw new AppError("NOT_FOUND", "Claim not found", 404);
      }
      assertClaimInGeoScope(found, req.permissions!, scope);

      await prisma.claim.delete({ where: { id: String(req.params.id) } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
