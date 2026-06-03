import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import {
  ClaimLinkMode,
  ClaimPolicyMatchStatus,
  CsvImportEntity,
  CsvImportMode,
  CsvJobStatus,
  CsvUpdateMode,
} from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { loadMisScope } from "../../services/mis-scope.service.js";
import { buildClaimErrorReportCsv, type ClaimCsvRowError } from "./claim-csv-errors.js";
import {
  applyStatusMap,
  claimImportMaxRows,
  evaluateClaimRow,
  importClaimRow,
  parseClaimRow,
} from "./claim-csv-import.js";
import {
  claimRowToMap,
  parseClaimFile,
} from "./claim-csv-parse.js";
import { buildClaimImportTypeCache } from "./claim-policy-match.js";
import {
  CLAIM_PREVIEW_ROW_LIMIT,
  createPreviewToken,
  emptyMatchStats,
  hashPreviewToken,
  verifyPreviewToken,
  type ClaimImportMatchStats,
} from "./claim-csv-preview.js";
import { loadClaimStatusMap } from "./claim-status-map.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const BATCH_SIZE = Number(process.env.CSV_IMPORT_BATCH_SIZE ?? 500) || 500;

/** Latest successful claim import for the same file checksum (SHA-256). */
async function findPriorCompletedClaimImport(checksum: string) {
  return prisma.csvImportJob.findFirst({
    where: {
      checksum,
      importEntity: CsvImportEntity.CLAIM,
      status: CsvJobStatus.COMPLETED,
    },
    orderBy: { createdAt: "desc" },
  });
}

function duplicateImportPayload(
  env: Env,
  prior: Awaited<ReturnType<typeof findPriorCompletedClaimImport>>,
) {
  if (!prior || env.CSV_DUPLICATE_MODE !== "block") {
    return null;
  }
  return {
    jobId: prior.id,
    completedAt: prior.completedAt?.toISOString() ?? prior.createdAt.toISOString(),
    fileName: prior.fileName ?? undefined,
  };
}

function parseClaimImportMode(_raw: unknown): CsvImportMode {
  return CsvImportMode.CREATE_ONLY;
}

function parseLinkMode(raw: unknown): ClaimLinkMode {
  const t = String(raw ?? "STRICT_MATCH").trim().toUpperCase();
  if (t === "ALLOW_UNLINKED") return ClaimLinkMode.ALLOW_UNLINKED;
  return ClaimLinkMode.STRICT_MATCH;
}

function parseDryRun(queryVal: unknown, bodyVal: unknown): boolean {
  if (queryVal === "true" || queryVal === true) return true;
  if (queryVal === "false" || queryVal === false) return false;
  return bodyVal === true || bodyVal === "true";
}

async function storeClaimUploadFile(
  env: Env,
  jobId: string,
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const dir = join(env.UPLOAD_DIR, "claims", jobId);
  await mkdir(dir, { recursive: true });
  const ext = fileName.toLowerCase().endsWith(".xlsx") ? ".xlsx" : ".csv";
  const filePath = join(dir, `original${ext}`);
  await writeFile(filePath, buffer);
  return filePath;
}

type ParsedImportContext = {
  header: string[];
  parsedRows: ReturnType<typeof parseClaimRow>[];
};

async function loadParsedRows(
  filePath: string,
  fileName: string,
  statusMap: Awaited<ReturnType<typeof loadClaimStatusMap>>,
): Promise<ParsedImportContext> {
  const buffer = await readFile(filePath);
  const { header, dataRows } = await parseClaimFile(buffer, fileName);
  if (!header.length) {
    throw new AppError("CSV_EMPTY", "File has no header row", 400);
  }
  const parsedRows = dataRows.map((row, i) =>
    parseClaimRow(i + 2, claimRowToMap(header, row), statusMap),
  );
  return { header, parsedRows };
}

function buildPreviewRows(
  parsedRows: ReturnType<typeof parseClaimRow>[],
  matches: Awaited<ReturnType<typeof evaluateClaimRow>>[],
) {
  const limit = Math.min(CLAIM_PREVIEW_ROW_LIMIT, parsedRows.length);
  const previewRows = [];
  for (let i = 0; i < limit; i++) {
    const row = parsedRows[i]!;
    const match = matches[i]!;
    previewRows.push({
      rowNumber: row.rowNumber,
      claimNo: row.claimNo,
      policyNo: row.policyNo,
      matchStatus: match.matchStatus,
      verificationWarnings: match.verificationWarnings,
      policyHolderName: row.policyHolderName,
      claimAmount: row.claimAmount,
    });
  }
  return previewRows;
}

function recordMatchStats(
  stats: ClaimImportMatchStats,
  matchStatus?: ClaimPolicyMatchStatus,
  warnings?: string[],
): void {
  if (matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT) stats.matchedExact++;
  else if (matchStatus === ClaimPolicyMatchStatus.UNLINKED) stats.unlinked++;
  else if (matchStatus === ClaimPolicyMatchStatus.CONFLICT) stats.conflicts++;
  if (warnings && warnings.length > 0) stats.verificationWarnings++;
}

async function runClaimImport(
  env: Env,
  opts: {
    filePath: string;
    fileName: string;
    checksum: string;
    userId: string;
    permissions: Set<string>;
    linkMode: ClaimLinkMode;
    importMode: CsvImportMode;
    dryRun: boolean;
    force: boolean;
    previewToken?: string;
  },
) {
  const maxRows = claimImportMaxRows();
  const statusMap = await loadClaimStatusMap();
  const { parsedRows } = await loadParsedRows(opts.filePath, opts.fileName, statusMap);

  if (parsedRows.length > maxRows) {
    throw new AppError(
      "TOO_MANY_ROWS",
      `Import exceeds maximum of ${maxRows} rows`,
      413,
    );
  }

  const prior = await findPriorCompletedClaimImport(opts.checksum);

  if (prior && env.CSV_DUPLICATE_MODE === "block" && !opts.force) {
    throw new AppError("DUPLICATE_CSV_IMPORT", "This file was already imported successfully", 409);
  }

  const startedAt = performance.now();
  const job = await prisma.csvImportJob.create({
    data: {
      s3Key: opts.filePath,
      checksum: opts.checksum,
      updateMode: CsvUpdateMode.FULL,
      importMode: opts.importMode,
      importEntity: CsvImportEntity.CLAIM,
      linkMode: opts.linkMode,
      dryRun: opts.dryRun,
      duplicateOfJobId: prior?.id,
      forceApplied: opts.force,
      fileName: opts.fileName,
      originalFilePath: opts.filePath,
      previewTokenHash: opts.previewToken ? hashPreviewToken(opts.previewToken) : undefined,
      createdById: opts.userId,
      status: CsvJobStatus.PROCESSING,
      rowCount: parsedRows.length,
    },
  });

  const typeCache = await buildClaimImportTypeCache();
  const scope = await loadMisScope(opts.userId, opts.permissions, "claim");
  const stats = emptyMatchStats();
  stats.totalRows = parsedRows.length;

  let created = 0;
  let updated = 0;
  let failed = 0;
  const rowErrors: ClaimCsvRowError[] = [];

  for (let batchStart = 0; batchStart < parsedRows.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, parsedRows.length);
    for (let i = batchStart; i < batchEnd; i++) {
      const row = applyStatusMap(parsedRows[i]!, statusMap);
      try {
        const outcome = await importClaimRow(row, {
          typeCache,
          linkMode: opts.linkMode,
          importMode: opts.importMode,
          dryRun: opts.dryRun,
          userId: opts.userId,
          permissions: opts.permissions,
          scope,
          importJobId: job.id,
          statusMap,
        });

        if (outcome.matchStatus) {
          recordMatchStats(stats, outcome.matchStatus, outcome.verificationWarnings);
        } else if (outcome.error?.matchStatus) {
          recordMatchStats(stats, outcome.error.matchStatus, outcome.error.verificationWarnings);
        }

        if (outcome.result === "created") created++;
        else if (outcome.result === "updated") updated++;
        else if (outcome.error) {
          failed++;
          rowErrors.push(outcome.error);
        }
      } catch (e) {
        failed++;
        rowErrors.push({
          row: row.rowNumber,
          error: e instanceof Error ? e.message : "Import failed",
          claimNo: row.claimNo,
          policyNo: row.policyNo,
        });
      }
    }
  }

  stats.created = created;
  stats.updated = updated;
  stats.failed = failed;

  let errorReportPath: string | undefined;
  if (rowErrors.length > 0) {
    const report = buildClaimErrorReportCsv(rowErrors);
    errorReportPath = join(env.UPLOAD_DIR, "claims", job.id, "errors.csv");
    await writeFile(errorReportPath, report, "utf8");
  }

  const durationMs = Math.round(performance.now() - startedAt);
  await prisma.csvImportJob.update({
    where: { id: job.id },
    data: {
      status: CsvJobStatus.COMPLETED,
      successCount: created + updated,
      failCount: failed,
      createdCount: created,
      updatedCount: updated,
      durationMs,
      matchStatsJson: JSON.stringify(stats),
      errorReportS3Key: errorReportPath,
      completedAt: new Date(),
      progressPercent: 100,
    },
  });

  await writeActivityLog({
    userId: opts.userId,
    module: "claim",
    action: "import",
    entityType: "CsvImportJob",
    entityId: job.id,
    afterData: { created, updated, failed },
  });

  return {
    jobId: job.id,
    created,
    updated,
    failed,
    dryRun: opts.dryRun,
    matchStats: stats,
    errorReportUrl: errorReportPath ? `/api/v1/upload/claim-csv/${job.id}/errors.csv` : undefined,
  };
}

/** Claim CSV/XLSX upload routes (preview + confirm). */
export function createClaimUploadRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post(
    "/claim-csv/preview",
    requirePermission("claim:import"),
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError("FILE_REQUIRED", "CSV or XLSX file required", 400);
        }

        const linkMode = parseLinkMode(req.body.linkMode ?? req.query.linkMode);
        const importMode = parseClaimImportMode(req.body.importMode ?? req.query.importMode);
        const checksum = createHash("sha256").update(req.file.buffer).digest("hex");
        const fileName = req.file.originalname ?? "upload.csv";

        await mkdir(join(env.UPLOAD_DIR, "claims", "preview"), { recursive: true });
        const previewId = createHash("sha256")
          .update(`${checksum}-${Date.now()}-${req.userId}`)
          .digest("hex")
          .slice(0, 24);
        const filePath = await storeClaimUploadFile(
          env,
          `preview/${previewId}`,
          req.file.buffer,
          fileName,
        );

        const statusMap = await loadClaimStatusMap();
        const { parsedRows } = await loadParsedRows(filePath, fileName, statusMap);
        const maxRows = claimImportMaxRows();
        if (parsedRows.length > maxRows) {
          throw new AppError("TOO_MANY_ROWS", `File exceeds maximum of ${maxRows} rows`, 413);
        }

        const typeCache = await buildClaimImportTypeCache();
        const stats = emptyMatchStats();
        stats.totalRows = parsedRows.length;

        const matches = [];
        for (const row of parsedRows) {
          matches.push(await evaluateClaimRow(row, typeCache, stats));
        }

        const prior = await findPriorCompletedClaimImport(checksum);
        const previewToken = createPreviewToken(env, {
          userId: req.userId!,
          checksum,
          filePath,
          linkMode,
          importMode,
          fileName,
        });

        res.json({
          previewToken,
          previewRows: buildPreviewRows(parsedRows, matches),
          summary: stats,
          duplicateImport: duplicateImportPayload(env, prior),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    "/claim-csv/confirm",
    requirePermission("claim:import"),
    async (req, res, next) => {
      try {
        const body = z
          .object({
            previewToken: z.string().min(1),
            dryRun: z.boolean().optional(),
            force: z.boolean().optional().default(false),
          })
          .parse(req.body);

        const payload = verifyPreviewToken(env, body.previewToken, req.userId!);
        const dryRun = body.dryRun ?? false;

        const result = await runClaimImport(env, {
          filePath: payload.filePath,
          fileName: payload.fileName,
          checksum: payload.checksum,
          userId: req.userId!,
          permissions: req.permissions!,
          linkMode: payload.linkMode,
          importMode: payload.importMode,
          dryRun,
          force: body.force,
          previewToken: body.previewToken,
        });

        res.json(result);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/claim-csv/:jobId",
    requirePermission("claim:import"),
    async (req, res, next) => {
      try {
        const job = await prisma.csvImportJob.findFirst({
          where: {
            id: String(req.params.jobId),
            importEntity: CsvImportEntity.CLAIM,
          },
        });
        if (!job) {
          throw new AppError("NOT_FOUND", "Import job not found", 404);
        }
        res.json({
          id: job.id,
          status: job.status,
          progressPercent: job.progressPercent ?? 0,
          matchStats: job.matchStatsJson ? JSON.parse(job.matchStatsJson) : null,
          createdCount: job.createdCount,
          updatedCount: job.updatedCount,
          failCount: job.failCount,
          fileName: job.fileName,
          completedAt: job.completedAt,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/claim-csv/:jobId/errors.csv",
    requirePermission("claim:import"),
    async (req, res, next) => {
      try {
        const job = await prisma.csvImportJob.findFirst({
          where: {
            id: String(req.params.jobId),
            importEntity: CsvImportEntity.CLAIM,
          },
        });
        if (!job?.errorReportS3Key) {
          throw new AppError("NOT_FOUND", "Error report not found", 404);
        }
        const content = await readFile(job.errorReportS3Key, "utf8");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="claim-import-errors-${job.id}.csv"`);
        res.send(content);
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
