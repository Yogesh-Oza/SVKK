import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { ClaimPolicyMatchStatus, ClaimStatus, CsvImportEntity, CsvJobStatus } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import {
  assertClaimInGeoScope,
  assertGeoFieldsOnWrite,
  buildMisVillageWhere,
  loadMisScope,
} from "../../services/mis-scope.service.js";
import { buildSampleClaimCsv } from "./claim-csv-format.js";
import {
  buildClaimListWhere,
  CLAIM_LIST_EXPORT_MAX_ROWS,
  distinctClaimFilterOptions,
  queryClaimListPaged,
  queryClaimsForExport,
  type ClaimListQuery,
} from "./claim.list.js";
import { buildClaimsExportCsv } from "./claim.export-csv.js";

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
  sort: z.string().optional(),
});

const claimListPagedQuerySchema = claimListFiltersSchema.extend({
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  svkkPublicId: z.string().optional(),
  policyYear: z.string().optional(),
  village: z.string().optional(),
});

function listFilterFromQuery(q: z.infer<typeof claimListPagedQuerySchema>): ClaimListQuery {
  return {
    search: q.search,
    villages: q.villages?.length ? q.villages : q.village ? [q.village] : undefined,
    policyYears: q.policyYears?.length ? q.policyYears : q.policyYear ? [q.policyYear] : undefined,
    statuses: q.statuses,
    claimTypes: q.claimTypes,
    matchStatuses: q.matchStatuses,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    sort: q.sort,
    page: q.page,
    pageSize: q.pageSize,
  };
}

export function createClaimRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/export-sample.csv", requirePermission("claim:import"), (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="claim-import-sample.csv"');
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

  r.get("/export.csv", requirePermission("claim:read"), async (req, res, next) => {
    try {
      const q = claimListFiltersSchema.parse(req.query);
      const listFilter: ClaimListQuery = {
        search: q.search,
        villages: q.villages,
        policyYears: q.policyYears,
        statuses: q.statuses,
        claimTypes: q.claimTypes,
        matchStatuses: q.matchStatuses,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        sort: q.sort,
      };
      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const where = buildClaimListWhere(scope, listFilter);
      const rows = await queryClaimsForExport(where, listFilter.sort, CLAIM_LIST_EXPORT_MAX_ROWS);
      const truncated = rows.length >= CLAIM_LIST_EXPORT_MAX_ROWS;
      if (truncated) {
        res.setHeader("X-Export-Truncated", "true");
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="claims-export.csv"');
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

      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");

      let policyArea: string | null = null;
      if (body.policyId) {
        const policy = await prisma.policy.findFirst({
          where: { id: body.policyId, deletedAt: null },
          select: { area: true },
        });
        if (!policy) {
          throw new AppError("NOT_FOUND", "Policy not found", 404);
        }
        policyArea = policy.area;
      }

      assertGeoFieldsOnWrite(
        { village: body.village, area: policyArea },
        scope,
        req.permissions!,
        "claim",
      );

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

      assertClaimInGeoScope(
        { village: row.village, policy: { area: policyArea } },
        req.permissions!,
        scope,
      );

      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

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

  r.patch("/:id", requirePermission("claim:update"), async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.nativeEnum(ClaimStatus).optional(),
          approvedAmount: z.number().nonnegative().optional().nullable(),
        })
        .parse(req.body);

      const scope = await loadMisScope(req.userId!, req.permissions!, "claim");
      const found = await prisma.claim.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, village: true, policy: { select: { area: true } } },
      });
      if (!found) {
        throw new AppError("NOT_FOUND", "Claim not found", 404);
      }
      assertClaimInGeoScope(found, req.permissions!, scope);

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
