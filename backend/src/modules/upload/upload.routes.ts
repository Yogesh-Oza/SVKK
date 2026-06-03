import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { CsvImportMode, CsvUpdateMode } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { uploadBufferToGoogleDrive } from "../../services/google-drive.service.js";
import {
  downloadOneDriveFileById,
  downloadOneDriveFileBySharingUrl,
  isOneDriveSharingPageUrl,
  uploadBufferToOneDrive,
} from "../../services/one-drive.service.js";
import { updatePolicySections } from "../policy/policy.service.js";
import {
  assertPolicyReadable,
  loadMisScope,
} from "../../services/mis-scope.service.js";
import { createClaimUploadRouter } from "../claim/claim-upload.routes.js";
import { createPolicyUploadRouter } from "../policy/policy-upload.routes.js";
import { runPolicyCsvImportJob } from "../policy/policy-csv-import-job.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadDrive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

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

        const result = await runPolicyCsvImportJob(env, {
          userId: req.userId!,
          permissions: req.permissions!,
          fileBuffer: req.file.buffer,
          fileName: req.file.originalname ?? "upload.csv",
          importMode,
          updateMode: body.updateMode,
          dryRun,
          force: body.force,
        });

        res.status(201).json({
          ...result,
          successCount: result.valid,
          failCount: result.invalid,
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

  r.use(createPolicyUploadRouter(env));
  r.use(createClaimUploadRouter(env));

  return r;
}
