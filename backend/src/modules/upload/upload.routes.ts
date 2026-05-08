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
import { CsvJobStatus, CsvUpdateMode } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { normalizeMobile } from "../../domain/phone.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { uploadBufferToGoogleDrive } from "../../services/google-drive.service.js";
import { uploadBufferToOneDrive } from "../../services/one-drive.service.js";
import { updatePolicySections } from "../policy/policy.service.js";
import { assertPolicyReadable, loadMisScope } from "../../services/mis-scope.service.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadDrive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

function parseCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

function parseCsv(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCsvLine);
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

        const body = z
          .object({
            updateMode: z.nativeEnum(CsvUpdateMode),
            dryRun: z
              .union([z.literal("true"), z.literal("false"), z.boolean()])
              .transform((v) => v === true || v === "true")
              .optional()
              .default(false),
            force: z
              .union([z.literal("true"), z.literal("false"), z.boolean()])
              .transform((v) => v === true || v === "true")
              .optional()
              .default(false),
          })
          .parse({
            updateMode: req.body.updateMode,
            dryRun: req.body.dryRun,
            force: req.body.force,
          });

        const checksum = createHash("sha256").update(req.file.buffer).digest("hex");

        const prior = await prisma.csvImportJob.findFirst({
          where: {
            checksum,
            updateMode: body.updateMode,
            status: CsvJobStatus.COMPLETED,
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

        const job = await prisma.csvImportJob.create({
          data: {
            s3Key: "",
            checksum,
            updateMode: body.updateMode,
            dryRun: body.dryRun,
            duplicateOfJobId: prior?.id,
            forceApplied: body.force,
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
        const rows = parseCsv(text);
        const header = rows[0];
        if (!header) {
          throw new AppError("CSV_EMPTY", "CSV has no rows", 400);
        }

        let success = 0;
        let fail = 0;
        const errors: string[] = [];

        const dataRows = rows.slice(1);

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i]!;
          try {
            if (body.dryRun) {
              validateRow(body.updateMode, header, row);
              success++;
              continue;
            }

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
              await applyRow(tx, body.updateMode, header, row);
            });
            success++;
          } catch (err) {
            fail++;
            errors.push(`row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        const status = fail > 0 && success === 0 ? CsvJobStatus.FAILED : CsvJobStatus.COMPLETED;

        await prisma.csvImportJob.update({
          where: { id: job.id },
          data: {
            status,
            rowCount: dataRows.length,
            successCount: success,
            failCount: fail,
            completedAt: new Date(),
          },
        });

        await writeActivityLog({
          userId: req.userId,
          module: "upload",
          action: body.dryRun ? "CSV_VALIDATED" : "CSV_IMPORTED",
          entityType: "CsvImportJob",
          entityId: job.id,
          afterData: { success, fail, dryRun: body.dryRun },
        });

        res.status(201).json({
          jobId: job.id,
          dryRun: body.dryRun,
          rowCount: dataRows.length,
          successCount: success,
          failCount: fail,
          errors: errors.slice(0, 50),
        });
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
          const scope = await loadMisScope(req.userId!, req.userRole!);
          const existing = await prisma.policy.findUnique({
            where: { id: policyId },
            select: { id: true, village: true, createdById: true },
          });
          if (!existing) {
            throw new AppError("NOT_FOUND", "Policy not found", 404);
          }
          assertPolicyReadable(existing, req.userId!, req.userRole!, scope);

          const updated = await updatePolicySections({
            actorUserId: req.userId!,
            policyId,
            expectedUpdatedAt:
              expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
                ? expectedUpdatedAt
                : undefined,
            policy: { policyUrl: webViewLink },
          });
          updatedAt = updated.updatedAt.toISOString();

          await writeActivityLog({
            userId: req.userId!,
            module: "upload",
            action: "POLICY_ONEDRIVE_DOC_ATTACHED",
            entityType: "Policy",
            entityId: policyId,
            afterData: { oneDriveFileId: fileId, policyUrl: webViewLink },
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
          const scope = await loadMisScope(req.userId!, req.userRole!);
          const existing = await prisma.policy.findUnique({
            where: { id: policyId },
            select: { id: true, village: true, createdById: true },
          });
          if (!existing) {
            throw new AppError("NOT_FOUND", "Policy not found", 404);
          }
          assertPolicyReadable(existing, req.userId!, req.userRole!, scope);

          const updated = await updatePolicySections({
            actorUserId: req.userId!,
            policyId,
            expectedUpdatedAt:
              expectedUpdatedAt && !Number.isNaN(expectedUpdatedAt.getTime())
                ? expectedUpdatedAt
                : undefined,
            policy: { policyUrl: webViewLink },
          });
          updatedAt = updated.updatedAt.toISOString();

          await writeActivityLog({
            userId: req.userId!,
            module: "upload",
            action: "POLICY_DRIVE_DOC_ATTACHED",
            entityType: "Policy",
            entityId: policyId,
            afterData: { driveFileId: fileId, policyUrl: webViewLink },
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

  r.get("/csv/:jobId", requirePermission("upload:csv"), async (req, res, next) => {
    try {
      const job = await prisma.csvImportJob.findUnique({
        where: { id: String(req.params.jobId) },
      });
      if (!job) throw new AppError("NOT_FOUND", "Job not found", 404);
      res.json(job);
    } catch (e) {
      next(e);
    }
  });

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

async function applyRow(
  tx: Prisma.TransactionClient,
  mode: CsvUpdateMode,
  header: string[],
  row: string[],
) {
  if (mode === CsvUpdateMode.POD_ONLY) {
    const iNo = colIndex(header, "policyNo");
    const iPod = colIndex(header, "pod");
    const policyNo = row[iNo];
    const pod = row[iPod];
    if (!policyNo) throw new Error("policyNo empty");
    await tx.policy.updateMany({ where: { policyNo }, data: { pod } });
    return;
  }
  if (mode === CsvUpdateMode.POLICY_ONLY) {
    const iOld = colIndex(header, "oldPolicyNo");
    const iNew = colIndex(header, "newPolicyNo");
    const oldPolicyNo = row[iOld];
    const newPolicyNo = row[iNew];
    if (!oldPolicyNo || !newPolicyNo) throw new Error("oldPolicyNo/newPolicyNo required");
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
  });
  if (existing) {
    await tx.policy.update({ where: { id: existing.id }, data });
  } else {
    throw new Error("FULL upsert requires existing policy in Phase 1 stub");
  }
}
