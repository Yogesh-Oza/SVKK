import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { CsvJobStatus, CsvImportMode, CsvUpdateMode } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { normalizeMobile } from "../../domain/phone.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { uploadBufferToGoogleDrive } from "../../services/google-drive.service.js";
import {
  downloadOneDriveFileById,
  downloadOneDriveFileBySharingUrl,
  isOneDriveSharingPageUrl,
  uploadBufferToOneDrive,
} from "../../services/one-drive.service.js";
import { updatePolicySections } from "../policy/policy.service.js";
import { isLegacyPolicyCsvFormat, parseCsvWithOptionalVersion } from "../policy/policy-csv-format.js";
import {
  processLegacyPolicyCsvRow,
  validateLegacyPolicyCsvRow,
} from "../policy/policy-csv-import.js";
import { buildPolicyTypeCache } from "../policy/policy-csv-resolve.js";
import { buildErrorReportCsv, type CsvRowError } from "../policy/policy-csv-errors.js";
import { collectDeprecatedHeaderWarnings } from "../policy/policy-csv-slots.js";
import { parseCsv } from "../policy/policy-csv-parse.js";
import {
  assertPolicyReadable,
  loadMisScope,
  type GeoScope,
} from "../../services/mis-scope.service.js";
import { createClaimUploadRouter } from "../claim/claim-upload.routes.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadDrive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

const CSV_IMPORT_BATCH_SIZE = Number(process.env.CSV_IMPORT_BATCH_SIZE ?? 500) || 500;

const MAX_POLICY_URLS = 5;

function parseImportMode(raw: unknown): CsvImportMode {
  const t = String(raw ?? "UPSERT").trim().toUpperCase();
  if (t === "UPDATE_ONLY") return CsvImportMode.UPDATE_ONLY;
  if (t === "CREATE_ONLY") return CsvImportMode.CREATE_ONLY;
  return CsvImportMode.UPSERT;
}

function parseDryRun(queryVal: unknown, bodyVal: unknown): boolean {
  if (queryVal === "true" || queryVal === true) return true;
  if (queryVal === "false" || queryVal === false) return false;
  return bodyVal === true || bodyVal === "true";
}

function parsePolicyUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.filter((u: unknown) => typeof u === "string" && u);
    } catch { /* fall through to legacy single-URL */ }
  }
  return trimmed ? [trimmed] : [];
}

function appendPolicyUrl(existing: string | null | undefined, newUrl: string): string {
  const urls = parsePolicyUrls(existing);
  if (!urls.includes(newUrl)) urls.push(newUrl);
  return JSON.stringify(urls.slice(0, MAX_POLICY_URLS));
}

export function createUploadRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post(
    "/csv",
    requirePermission("upload:csv"),
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError("FILE_REQUIRED", "CSV file required", 400);
        }

        const dryRun = parseDryRun(req.query.dryRun, req.body.dryRun);
        const importMode = parseImportMode(req.query.mode ?? req.body.mode);

        const body = z
          .object({
            updateMode: z.nativeEnum(CsvUpdateMode),
            force: z
              .union([z.literal("true"), z.literal("false"), z.boolean()])
              .transform((v) => v === true || v === "true")
              .optional()
              .default(false),
          })
          .parse({
            updateMode: req.body.updateMode,
            force: req.body.force,
          });

        const checksum = createHash("sha256").update(req.file.buffer).digest("hex");

        const prior = await prisma.csvImportJob.findFirst({
          where: {
            checksum,
            updateMode: body.updateMode,
            status: CsvJobStatus.COMPLETED,
            dryRun: false,
          },
          orderBy: { createdAt: "desc" },
        });

        if (prior && env.CSV_DUPLICATE_MODE === "block" && !body.force) {
          throw new AppError(
            "DUPLICATE_CSV_IMPORT",
            "This file was already imported successfully",
            409,
          );
        }

        await mkdir(env.UPLOAD_DIR, { recursive: true });

        const startedAt = performance.now();
        const fileName = req.file.originalname ?? "upload.csv";

        const job = await prisma.csvImportJob.create({
          data: {
            s3Key: "",
            checksum,
            updateMode: body.updateMode,
            importMode,
            dryRun,
            duplicateOfJobId: prior?.id,
            forceApplied: body.force,
            fileName,
            createdById: req.userId,
            status: CsvJobStatus.PENDING,
          },
        });

        const diskPath = join(env.UPLOAD_DIR, `${job.id}.csv`);
        await writeFile(diskPath, req.file.buffer);

        await prisma.csvImportJob.update({
          where: { id: job.id },
          data: { s3Key: diskPath },
        });

        const text = req.file.buffer.toString("utf8");
        const allRows = parseCsv(text);
        const { csvVersion, header, dataRows } = parseCsvWithOptionalVersion(allRows);
        if (!header.length) {
          throw new AppError("CSV_EMPTY", "CSV has no header row", 400);
        }

        let created = 0;
        let updated = 0;
        let fail = 0;
        const errors: string[] = [];
        const rowErrors: CsvRowError[] = [];
        const warnings = collectDeprecatedHeaderWarnings(header);

        const policyScope = await loadMisScope(req.userId!, req.permissions!, "policy");
        const legacyFormat = isLegacyPolicyCsvFormat(header);
        const typeCache = legacyFormat ? await buildPolicyTypeCache(prisma) : null;

        for (let batchStart = 0; batchStart < dataRows.length; batchStart += CSV_IMPORT_BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + CSV_IMPORT_BATCH_SIZE, dataRows.length);
          const headerOffset = allRows[0]?.[0]?.trim().toUpperCase() === "CSV_VERSION" ? 3 : 2;
          for (let i = batchStart; i < batchEnd; i++) {
            const row = dataRows[i]!;
            const rowNum = i + headerOffset;
            const svkkIdx = header.findIndex((h) => h.trim().toLowerCase() === "svkk id");
            const policyIdx = header.findIndex((h) => h.trim().toLowerCase() === "policy no");
            const refIdx = header.findIndex((h) => h.trim().toLowerCase() === "ref no");
            const svkkId = svkkIdx >= 0 ? (row[svkkIdx] ?? "") : "";
            const policyNo = policyIdx >= 0 ? (row[policyIdx] ?? "") : "";
            const refNo = refIdx >= 0 ? (row[refIdx] ?? "") : "";

            try {
              if (dryRun) {
                if (legacyFormat && typeCache) {
                  const outcome = await processLegacyPolicyCsvRow(header, row, {
                    userId: req.userId!,
                    permissions: req.permissions!,
                    scope: policyScope,
                    importMode,
                    typeCache,
                    dryRun: true,
                  });
                  if (outcome === "created") created++;
                  else updated++;
                } else {
                  validateRow(body.updateMode, header, row);
                  updated++;
                }
                continue;
              }

              if (legacyFormat && typeCache) {
                const outcome = await processLegacyPolicyCsvRow(header, row, {
                  userId: req.userId!,
                  permissions: req.permissions!,
                  scope: policyScope,
                  importMode,
                  typeCache,
                });
                if (outcome === "created") created++;
                else updated++;
              } else {
                await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                  await applyRow(tx, body.updateMode, header, row, {
                    userId: req.userId!,
                    permissions: req.permissions!,
                    scope: policyScope,
                  });
                });
                updated++;
              }
            } catch (err) {
              fail++;
              const message = err instanceof Error ? err.message : String(err);
              errors.push(`row ${rowNum}: ${message}`);
              rowErrors.push({
                row: rowNum,
                error: message,
                svkkId: svkkId || undefined,
                policyNo: policyNo || undefined,
                refNo: refNo || undefined,
              });
            }
          }
        }

        const durationMs = Math.round(performance.now() - startedAt);
        const valid = created + updated;
        const status = fail > 0 && valid === 0 ? CsvJobStatus.FAILED : CsvJobStatus.COMPLETED;

        let errorReportPath: string | undefined;
        if (rowErrors.length > 0) {
          errorReportPath = join(env.UPLOAD_DIR, `errors-${job.id}.csv`);
          await writeFile(errorReportPath, buildErrorReportCsv(rowErrors), "utf8");
        }

        await prisma.csvImportJob.update({
          where: { id: job.id },
          data: {
            status,
            rowCount: dataRows.length,
            successCount: valid,
            failCount: fail,
            createdCount: created,
            updatedCount: updated,
            durationMs,
            csvVersion,
            warningsJson: warnings.length ? JSON.stringify(warnings) : undefined,
            errorReportS3Key: errorReportPath,
            completedAt: new Date(),
          },
        });

        await writeActivityLog({
          userId: req.userId,
          module: "upload",
          action: dryRun ? "CSV_VALIDATED" : "CSV_IMPORTED",
          entityType: "CsvImportJob",
          entityId: job.id,
          afterData: { created, updated, fail, dryRun, durationMs, importMode },
        });

        res.status(201).json({
          jobId: job.id,
          mode: importMode,
          dryRun,
          rowCount: dataRows.length,
          created,
          updated,
          failed: fail,
          valid,
          invalid: fail,
          successCount: valid,
          failCount: fail,
          durationMs,
          csvVersion,
          errors: errors.slice(0, 50),
          warnings,
          errorReportUrl: errorReportPath ? `/upload/csv/${job.id}/errors.csv` : undefined,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /** Stream OneDrive file bytes for receipt header/footer (embed in print HTML). */
  r.get(
    "/one-drive/by-share/content",
    requirePermission("policy:read"),
    async (req, res, next) => {
      try {
        const url = z.string().url().parse(req.query.url);
        if (!isOneDriveSharingPageUrl(url)) {
          throw new AppError("VALIDATION", "Not a OneDrive sharing URL", 400);
        }
        const { buffer, mimeType } = await downloadOneDriveFileBySharingUrl(env, url);
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(buffer);
      } catch (e) {
        next(e);
      }
    },
  );

  r.get(
    "/one-drive/:fileId/content",
    requirePermission("policy:read"),
    async (req, res, next) => {
      try {
        const fileId = z.string().min(1).parse(req.params.fileId);
        const { buffer, mimeType } = await downloadOneDriveFileById(env, fileId);
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(buffer);
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * Multipart: `file` (required), optional `policyId`, optional `expectedUpdatedAt` (ISO, for optimistic PATCH).
   * Uploads to the shared Drive folder and returns a view link. When `policyId` is set, updates `policy.policyUrl`.
   */
  r.post(
    "/one-drive",
    requirePermission("upload:one-drive"),
    uploadDrive.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError("FILE_REQUIRED", "file is required", 400);
        }

        const policyId =
          typeof req.body.policyId === "string" && req.body.policyId.trim()
            ? req.body.policyId.trim()
            : undefined;
        const expectedRaw =
          typeof req.body.expectedUpdatedAt === "string" ? req.body.expectedUpdatedAt.trim() : "";
        const expectedUpdatedAt = expectedRaw ? new Date(expectedRaw) : undefined;
        if (expectedRaw && Number.isNaN(expectedUpdatedAt?.getTime())) {
          throw new AppError("VALIDATION", "expectedUpdatedAt must be a valid ISO date", 400);
        }

        const { webViewLink, fileId } = await uploadBufferToOneDrive(env, {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype || "application/octet-stream",
          fileName: req.file.originalname || "policy-document",
        });

        let updatedAt: string | undefined;

        if (policyId) {
          const scope = await loadMisScope(req.userId!, req.permissions!, "policy");
          const existing = await prisma.policy.findUnique({
            where: { id: policyId },
            select: {
              id: true,
              village: true,
              area: true,
              createdById: true,
              policyUrl: true,
              referenceNo: true,
              policyNo: true,
              insuredParty: { select: { name: true, svkkPublicId: true } },
            },
          });
          if (!existing) {
            throw new AppError("NOT_FOUND", "Policy not found", 404);
          }
          assertPolicyReadable(existing, req.userId!, req.permissions!, scope);

          const mergedUrls = appendPolicyUrl(existing.policyUrl, webViewLink);

          const updated = await updatePolicySections({
            actorUserId: req.userId!,
            policyId,
            expectedUpdatedAt:
              expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
                ? expectedUpdatedAt
                : undefined,
            policy: { policyUrl: mergedUrls },
          });
          updatedAt = updated.updatedAt.toISOString();

          await writeActivityLog({
            userId: req.userId!,
            module: "upload",
            action: "POLICY_ONEDRIVE_DOC_ATTACHED",
            entityType: "Policy",
            entityId: policyId,
            afterData: {
              referenceNo: existing.referenceNo,
              policyNo: existing.policyNo,
              holderName: existing.insuredParty.name,
              svkkPublicId: existing.insuredParty.svkkPublicId,
              village: existing.village,
              oneDriveFileId: fileId,
              policyUrl: webViewLink,
            },
          });
        }

        res.status(201).json({
          fileId,
          webViewLink,
          policyUrl: webViewLink,
          policyUpdated: Boolean(policyId),
          updatedAt,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    "/google-drive",
    requirePermission("upload:google-drive"),
    uploadDrive.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError("FILE_REQUIRED", "file is required", 400);
        }

        const policyId =
          typeof req.body.policyId === "string" && req.body.policyId.trim()
            ? req.body.policyId.trim()
            : undefined;
        const expectedRaw =
          typeof req.body.expectedUpdatedAt === "string" ? req.body.expectedUpdatedAt.trim() : "";
        const expectedUpdatedAt = expectedRaw ? new Date(expectedRaw) : undefined;
        if (expectedRaw && Number.isNaN(expectedUpdatedAt?.getTime())) {
          throw new AppError("VALIDATION", "expectedUpdatedAt must be a valid ISO date", 400);
        }

        const { webViewLink, fileId } = await uploadBufferToGoogleDrive(env, {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype || "application/octet-stream",
          fileName: req.file.originalname || "policy-document",
        });

        let updatedAt: string | undefined;

        if (policyId) {
          const scope = await loadMisScope(req.userId!, req.permissions!, "policy");
          const existing = await prisma.policy.findUnique({
            where: { id: policyId },
            select: {
              id: true,
              village: true,
              area: true,
              createdById: true,
              policyUrl: true,
              referenceNo: true,
              policyNo: true,
              insuredParty: { select: { name: true, svkkPublicId: true } },
            },
          });
          if (!existing) {
            throw new AppError("NOT_FOUND", "Policy not found", 404);
          }
          assertPolicyReadable(existing, req.userId!, req.permissions!, scope);

          const mergedUrls = appendPolicyUrl(existing.policyUrl, webViewLink);

          const updated = await updatePolicySections({
            actorUserId: req.userId!,
            policyId,
            expectedUpdatedAt:
              expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
                ? expectedUpdatedAt
                : undefined,
            policy: { policyUrl: mergedUrls },
          });
          updatedAt = updated.updatedAt.toISOString();

          await writeActivityLog({
            userId: req.userId!,
            module: "upload",
            action: "POLICY_DRIVE_DOC_ATTACHED",
            entityType: "Policy",
            entityId: policyId,
            afterData: {
              referenceNo: existing.referenceNo,
              policyNo: existing.policyNo,
              holderName: existing.insuredParty.name,
              svkkPublicId: existing.insuredParty.svkkPublicId,
              village: existing.village,
              driveFileId: fileId,
              policyUrl: webViewLink,
            },
          });
        }

        res.status(201).json({
          fileId,
          webViewLink,
          policyUrl: webViewLink,
          policyUpdated: Boolean(policyId),
          updatedAt,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get("/csv/:jobId/errors.csv", requirePermission("upload:csv"), async (req, res, next) => {
    try {
      const job = await prisma.csvImportJob.findUnique({
        where: { id: String(req.params.jobId) },
      });
      if (!job?.errorReportS3Key) {
        throw new AppError("NOT_FOUND", "Error report not found for this job", 404);
      }
      const { readFile } = await import("fs/promises");
      const content = await readFile(job.errorReportS3Key, "utf8");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="import-errors-${job.id}.csv"`,
      );
      res.send(content);
    } catch (e) {
      next(e);
    }
  });

  r.get("/csv/:jobId", requirePermission("upload:csv"), async (req, res, next) => {
    try {
      const job = await prisma.csvImportJob.findUnique({
        where: { id: String(req.params.jobId) },
      });
      if (!job) throw new AppError("NOT_FOUND", "Job not found", 404);
      res.json({
        ...job,
        errorReportUrl: job.errorReportS3Key ? `/upload/csv/${job.id}/errors.csv` : undefined,
      });
    } catch (e) {
      next(e);
    }
  });

  r.use(createClaimUploadRouter(env));

  return r;
}

function colIndex(header: string[], name: string): number {
  const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`missing column ${name}`);
  return i;
}

function validateRow(mode: CsvUpdateMode, header: string[], row: string[]) {
  if (mode === CsvUpdateMode.POD_ONLY) {
    colIndex(header, "policyNo");
    colIndex(header, "pod");
  } else if (mode === CsvUpdateMode.POLICY_ONLY) {
    colIndex(header, "oldPolicyNo");
    colIndex(header, "newPolicyNo");
  } else {
    colIndex(header, "policyNo");
    colIndex(header, "mobile");
  }
}

async function assertCsvPolicyInScope(
  tx: Prisma.TransactionClient,
  policyNo: string,
  ctx: { userId: string; permissions: Set<string>; scope: GeoScope },
): Promise<void> {
  const policy = await tx.policy.findFirst({
    where: { policyNo, deletedAt: null },
    select: { village: true, area: true, createdById: true },
  });
  if (!policy) {
    throw new Error(`policy ${policyNo} not found`);
  }
  assertPolicyReadable(policy, ctx.userId, ctx.permissions, ctx.scope);
}

async function applyRow(
  tx: Prisma.TransactionClient,
  mode: CsvUpdateMode,
  header: string[],
  row: string[],
  ctx?: { userId: string; permissions: Set<string>; scope: GeoScope },
) {
  if (mode === CsvUpdateMode.POD_ONLY) {
    const iNo = colIndex(header, "policyNo");
    const iPod = colIndex(header, "pod");
    const policyNo = row[iNo];
    const pod = row[iPod];
    if (!policyNo) throw new Error("policyNo empty");
    if (ctx) await assertCsvPolicyInScope(tx, policyNo, ctx);
    await tx.policy.updateMany({ where: { policyNo }, data: { pod } });
    return;
  }
  if (mode === CsvUpdateMode.POLICY_ONLY) {
    const iOld = colIndex(header, "oldPolicyNo");
    const iNew = colIndex(header, "newPolicyNo");
    const oldPolicyNo = row[iOld];
    const newPolicyNo = row[iNew];
    if (!oldPolicyNo || !newPolicyNo) throw new Error("oldPolicyNo/newPolicyNo required");
    if (ctx) await assertCsvPolicyInScope(tx, oldPolicyNo, ctx);
    await tx.policy.updateMany({
      where: { policyNo: oldPolicyNo },
      data: { policyNo: newPolicyNo },
    });
    return;
  }
  const iNo = colIndex(header, "policyNo");
  const iMob = colIndex(header, "mobile");
  const iPod = header.findIndex((h) => h.toLowerCase() === "pod");
  const policyNo = row[iNo];
  const mobileRaw = row[iMob];
  if (!policyNo || !mobileRaw) throw new Error("policyNo/mobile required");
  const mobile = normalizeMobile(mobileRaw);
  const data: { policyNo?: string; village?: string; pod?: string } = { policyNo };
  const iV = header.findIndex((h) => h.toLowerCase() === "village");
  if (iV >= 0 && row[iV]) data.village = row[iV];
  if (iPod >= 0 && row[iPod]) data.pod = row[iPod];
  const existing = await tx.policy.findFirst({
    where: { OR: [{ policyNo }, { insuredParty: { mobile } }] },
    select: { id: true, village: true, area: true, createdById: true },
  });
  if (existing) {
    if (ctx) {
      assertPolicyReadable(
        {
          village: existing.village,
          area: existing.area,
          createdById: existing.createdById,
        },
        ctx.userId,
        ctx.permissions,
        ctx.scope,
      );
    }
    await tx.policy.update({ where: { id: existing.id }, data });
  } else {
    throw new Error("FULL upsert requires existing policy in Phase 1 stub");
  }
}
