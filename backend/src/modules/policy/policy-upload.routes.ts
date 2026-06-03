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
import { CsvImportMode, CsvJobStatus, CsvUpdateMode } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { loadMisScope } from "../../services/mis-scope.service.js";
import { isLegacyPolicyCsvFormat, parseCsvWithOptionalVersion } from "./policy-csv-format.js";
import { runPolicyCsvImportFromPath } from "./policy-csv-import-job.js";
import { buildPolicyTypeCache } from "./policy-csv-resolve.js";
import { collectDeprecatedHeaderWarnings } from "./policy-csv-slots.js";
import { parseCsv } from "./policy-csv-parse.js";
import {
  buildPolicyImportPreview,
  createPolicyPreviewToken,
  policyImportMaxRows,
  verifyPolicyPreviewToken,
} from "./policy-csv-preview.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parsePolicyImportMode(raw: unknown): CsvImportMode {
  const t = String(raw ?? "CREATE_ONLY").trim().toUpperCase();
  if (t === "UPDATE_ONLY") return CsvImportMode.UPDATE_ONLY;
  if (t === "UPSERT") return CsvImportMode.UPSERT;
  return CsvImportMode.CREATE_ONLY;
}

async function findPriorCompletedPolicyImport(checksum: string) {
  return prisma.csvImportJob.findFirst({
    where: {
      checksum,
      status: CsvJobStatus.COMPLETED,
      dryRun: false,
    },
    orderBy: { createdAt: "desc" },
  });
}

function duplicateImportPayload(
  env: Env,
  prior: Awaited<ReturnType<typeof findPriorCompletedPolicyImport>>,
) {
  if (!prior || env.CSV_DUPLICATE_MODE !== "block") return null;
  return {
    jobId: prior.id,
    completedAt: prior.completedAt?.toISOString() ?? prior.createdAt.toISOString(),
    fileName: prior.fileName ?? undefined,
  };
}

async function storePolicyPreviewFile(
  env: Env,
  previewId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = join(env.UPLOAD_DIR, "policies", "preview", previewId);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, "upload.csv");
  await writeFile(filePath, buffer);
  return filePath;
}

/** Policy CSV upload routes (preview + confirm import). */
export function createPolicyUploadRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post(
    "/policy-csv/preview",
    requirePermission("upload:csv"),
    upload.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError("FILE_REQUIRED", "CSV file required", 400);
        }

        const importMode = parsePolicyImportMode(req.body.mode ?? req.query.mode);
        const checksum = createHash("sha256").update(req.file.buffer).digest("hex");
        const fileName = req.file.originalname ?? "upload.csv";

        const text = req.file.buffer.toString("utf8");
        const allRows = parseCsv(text);
        const { header, dataRows } = parseCsvWithOptionalVersion(allRows);
        if (!header.length) {
          throw new AppError("CSV_EMPTY", "CSV has no header row", 400);
        }
        if (!isLegacyPolicyCsvFormat(header)) {
          throw new AppError("CSV_FORMAT", "Policy import requires CSV format v2 headers", 400);
        }

        const maxRows = policyImportMaxRows();
        if (dataRows.length > maxRows) {
          throw new AppError("TOO_MANY_ROWS", `File exceeds maximum of ${maxRows} rows`, 413);
        }

        const previewId = createHash("sha256")
          .update(`${checksum}-${Date.now()}-${req.userId}`)
          .digest("hex")
          .slice(0, 24);
        const filePath = await storePolicyPreviewFile(env, previewId, req.file.buffer);

        const policyScope = await loadMisScope(req.userId!, req.permissions!, "policy");
        const typeCache = await buildPolicyTypeCache(prisma);
        const headerOffset = allRows[0]?.[0]?.trim().toUpperCase() === "CSV_VERSION" ? 3 : 2;

        const { previewRows, summary } = await buildPolicyImportPreview(
          header,
          dataRows,
          headerOffset,
          {
            userId: req.userId!,
            permissions: req.permissions!,
            scope: policyScope,
            importMode,
            typeCache,
          },
        );

        const prior = await findPriorCompletedPolicyImport(checksum);
        const warnings = collectDeprecatedHeaderWarnings(header);

        const previewToken = createPolicyPreviewToken(env, {
          userId: req.userId!,
          checksum,
          filePath,
          importMode,
          updateMode: CsvUpdateMode.FULL,
          fileName,
        });

        res.json({
          previewToken,
          previewRows,
          summary,
          warnings,
          csvVersion: "v2",
          duplicateImport: duplicateImportPayload(env, prior),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.post(
    "/policy-csv/confirm",
    requirePermission("upload:csv"),
    async (req, res, next) => {
      try {
        const body = z
          .object({
            previewToken: z.string().min(1),
            force: z.boolean().optional().default(false),
          })
          .parse(req.body);

        const payload = verifyPolicyPreviewToken(env, body.previewToken, req.userId!);

        const result = await runPolicyCsvImportFromPath(env, {
          filePath: payload.filePath,
          fileName: payload.fileName,
          userId: req.userId!,
          permissions: req.permissions!,
          importMode: payload.importMode,
          updateMode: payload.updateMode,
          dryRun: false,
          force: body.force,
          previewToken: body.previewToken,
        });

        res.status(201).json(result);
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
