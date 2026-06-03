import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { Prisma } from "@prisma/client";
import { CsvImportMode, CsvJobStatus, CsvUpdateMode } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { loadMisScope } from "../../services/mis-scope.service.js";
import {
  isLegacyPolicyCsvFormat,
  parseCsvWithOptionalVersion,
} from "./policy-csv-format.js";
import { buildErrorReportCsv, type CsvRowError } from "./policy-csv-errors.js";
import { processLegacyPolicyCsvRow } from "./policy-csv-import.js";
import { buildPolicyTypeCache } from "./policy-csv-resolve.js";
import { collectDeprecatedHeaderWarnings } from "./policy-csv-slots.js";
import { parseCsv } from "./policy-csv-parse.js";
import { hashPolicyPreviewToken } from "./policy-csv-preview.js";

const CSV_IMPORT_BATCH_SIZE = Number(process.env.CSV_IMPORT_BATCH_SIZE ?? 500) || 500;

export type PolicyCsvImportJobResult = {
  jobId: string;
  mode: CsvImportMode;
  dryRun: boolean;
  rowCount: number;
  created: number;
  updated: number;
  failed: number;
  valid: number;
  invalid: number;
  durationMs: number;
  csvVersion?: string;
  errors: string[];
  warnings: string[];
  errorReportUrl?: string;
};

type RunOpts = {
  userId: string;
  permissions: Set<string>;
  fileBuffer: Buffer;
  fileName: string;
  importMode: CsvImportMode;
  updateMode: CsvUpdateMode;
  dryRun: boolean;
  force: boolean;
  previewToken?: string;
};

function validateLegacyRow(updateMode: CsvUpdateMode, header: string[], row: string[]) {
  if (updateMode === CsvUpdateMode.POD_ONLY) {
    const iNo = header.findIndex((h) => h.toLowerCase() === "policyno");
    if (iNo < 0) throw new Error("missing column policyNo");
    return;
  }
  if (updateMode === CsvUpdateMode.POLICY_ONLY) {
    const iOld = header.findIndex((h) => h.toLowerCase() === "oldpolicyno");
    const iNew = header.findIndex((h) => h.toLowerCase() === "newpolicyno");
    if (iOld < 0 || iNew < 0) throw new Error("missing oldPolicyNo/newPolicyNo");
    return;
  }
  const iNo = header.findIndex((h) => h.toLowerCase() === "policyno");
  const iMob = header.findIndex((h) => h.toLowerCase() === "mobile");
  if (iNo < 0 || iMob < 0) throw new Error("missing policyNo/mobile");
}

async function findPriorCompletedImport(checksum: string, updateMode: CsvUpdateMode) {
  return prisma.csvImportJob.findFirst({
    where: {
      checksum,
      updateMode,
      status: CsvJobStatus.COMPLETED,
      dryRun: false,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Run legacy/v2 policy CSV import or validation job.
 */
export async function runPolicyCsvImportJob(env: Env, opts: RunOpts): Promise<PolicyCsvImportJobResult> {
  const checksum = createHash("sha256").update(opts.fileBuffer).digest("hex");
  const prior = await findPriorCompletedImport(checksum, opts.updateMode);

  if (prior && env.CSV_DUPLICATE_MODE === "block" && !opts.force && !opts.dryRun) {
    throw new AppError("DUPLICATE_CSV_IMPORT", "This file was already imported successfully", 409);
  }

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const startedAt = performance.now();

  const job = await prisma.csvImportJob.create({
    data: {
      s3Key: "",
      checksum,
      updateMode: opts.updateMode,
      importMode: opts.importMode,
      dryRun: opts.dryRun,
      duplicateOfJobId: prior?.id,
      forceApplied: opts.force,
      fileName: opts.fileName,
      previewTokenHash: opts.previewToken ? hashPolicyPreviewToken(opts.previewToken) : undefined,
      createdById: opts.userId,
      status: CsvJobStatus.PENDING,
    },
  });

  const diskPath = join(env.UPLOAD_DIR, `${job.id}.csv`);
  await writeFile(diskPath, opts.fileBuffer);
  await prisma.csvImportJob.update({ where: { id: job.id }, data: { s3Key: diskPath } });

  const text = opts.fileBuffer.toString("utf8");
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

  const policyScope = await loadMisScope(opts.userId, opts.permissions, "policy");
  const legacyFormat = isLegacyPolicyCsvFormat(header);
  const typeCache = legacyFormat ? await buildPolicyTypeCache(prisma) : null;

  const headerOffset = allRows[0]?.[0]?.trim().toUpperCase() === "CSV_VERSION" ? 3 : 2;

  for (let batchStart = 0; batchStart < dataRows.length; batchStart += CSV_IMPORT_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + CSV_IMPORT_BATCH_SIZE, dataRows.length);
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
        if (opts.dryRun) {
          if (legacyFormat && typeCache) {
            const outcome = await processLegacyPolicyCsvRow(header, row, {
              userId: opts.userId,
              permissions: opts.permissions,
              scope: policyScope,
              importMode: opts.importMode,
              typeCache,
              dryRun: true,
            });
            if (outcome === "created") created++;
            else updated++;
          } else {
            validateLegacyRow(opts.updateMode, header, row);
            updated++;
          }
          continue;
        }

        if (legacyFormat && typeCache) {
          const outcome = await processLegacyPolicyCsvRow(header, row, {
            userId: opts.userId,
            permissions: opts.permissions,
            scope: policyScope,
            importMode: opts.importMode,
            typeCache,
          });
          if (outcome === "created") created++;
          else updated++;
        } else {
          throw new Error("Non-legacy CSV format is not supported in this import path");
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
    userId: opts.userId,
    module: "upload",
    action: opts.dryRun ? "CSV_VALIDATED" : "CSV_IMPORTED",
    entityType: "CsvImportJob",
    entityId: job.id,
    afterData: { created, updated, fail, dryRun: opts.dryRun, durationMs, importMode: opts.importMode },
  });

  return {
    jobId: job.id,
    mode: opts.importMode,
    dryRun: opts.dryRun,
    rowCount: dataRows.length,
    created,
    updated,
    failed: fail,
    valid,
    invalid: fail,
    durationMs,
    csvVersion,
    errors: errors.slice(0, 50),
    warnings,
    errorReportUrl: errorReportPath ? `/upload/csv/${job.id}/errors.csv` : undefined,
  };
}

/** Load a stored preview file and run import (confirm step). */
export async function runPolicyCsvImportFromPath(
  env: Env,
  opts: Omit<RunOpts, "fileBuffer"> & { filePath: string },
): Promise<PolicyCsvImportJobResult> {
  const fileBuffer = await readFile(opts.filePath);
  return runPolicyCsvImportJob(env, { ...opts, fileBuffer });
}
