import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { CsvImportMode, CsvJobStatus, CsvUpdateMode } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { loadMisScope } from "../../services/mis-scope.service.js";
import {
  isLegacyPolicyCsvFormat,
  isPolicyCourierUpdateCsvFormat,
  parseCsvWithOptionalVersion,
} from "./policy-csv-format.js";
import { buildErrorReportCsv, type CsvRowError } from "./policy-csv-errors.js";
import { processLegacyPolicyCsvRow } from "./policy-csv-import.js";
import {
  buildPolicyCsvUpdateLookupCache,
  buildPolicyTypeCache,
  type PolicyCsvUpdateLookupCache,
  type PolicyTypeCache,
} from "./policy-csv-resolve.js";
import { loadCategoryRefs, type CategoryRef } from "../../lib/category-display.js";
import { collectDeprecatedHeaderWarnings } from "./policy-csv-slots.js";
import { parseCsv } from "./policy-csv-parse.js";
import { hashPolicyPreviewToken } from "./policy-csv-preview.js";
import { ensureGeoDropdowns, backfillGeoDropdownsFromRecords } from "../dropdowns/ensure-dropdown-options.js";
import type { GeoScope } from "../../services/mis-scope.service.js";
import { isPolicyRefNoUpdateMode } from "./policy-csv-update-scope.js";

const CSV_IMPORT_BATCH_SIZE = Number(process.env.CSV_IMPORT_BATCH_SIZE ?? 500) || 500;
const PROGRESS_EVERY = Number(process.env.CSV_IMPORT_PROGRESS_EVERY ?? 100) || 100;

function csvColumnIndex(header: string[], ...names: string[]): number {
  const want = names.map((n) => n.trim().toLowerCase());
  return header.findIndex((h) => want.includes(h.trim().toLowerCase()));
}

/** Unique Village / Area / City labels from the CSV (in-memory; no DB). */
function uniqueGeoFromPolicyCsv(header: string[], dataRows: string[][]) {
  const villageIdx = csvColumnIndex(header, "Village");
  const areaIdx = csvColumnIndex(header, "area");
  const cityIdx = csvColumnIndex(header, "city");
  const villages = new Set<string>();
  const areas = new Set<string>();
  const cities = new Set<string>();
  for (const row of dataRows) {
    if (villageIdx >= 0) {
      const v = (row[villageIdx] ?? "").trim();
      if (v) villages.add(v);
    }
    if (areaIdx >= 0) {
      const v = (row[areaIdx] ?? "").trim();
      if (v) areas.add(v);
    }
    if (cityIdx >= 0) {
      const v = (row[cityIdx] ?? "").trim();
      if (v) cities.add(v);
    }
  }
  return {
    villages: [...villages],
    areas: [...areas],
    cities: [...cities],
  };
}

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
  /** Present when confirm returns before the job finishes (avoids nginx 504). */
  status?: CsvJobStatus;
  async?: boolean;
  progressPercent?: number;
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
  allowNegativeWallet?: boolean;
  /**
   * When false, return immediately with status PROCESSING and finish in the background.
   * Use for HTTP confirm so nginx/proxy timeouts cannot cut off large imports.
   */
  wait?: boolean;
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

type ProcessCtx = {
  jobId: string;
  userId: string;
  permissions: Set<string>;
  scope: GeoScope;
  importMode: CsvImportMode;
  updateMode: CsvUpdateMode;
  dryRun: boolean;
  allowNegativeWallet: boolean;
  fileName: string;
  header: string[];
  dataRows: string[][];
  headerOffset: number;
  csvVersion?: string;
  warnings: string[];
  supportedFormat: boolean;
  legacyFormat: boolean;
  typeCache: PolicyTypeCache | null;
  categories: CategoryRef[];
  updateLookupCache: PolicyCsvUpdateLookupCache | null;
  startedAt: number;
  uploadDir: string;
};

async function finishJobFailed(jobId: string, message: string, startedAt: number): Promise<void> {
  await prisma.csvImportJob.update({
    where: { id: jobId },
    data: {
      status: CsvJobStatus.FAILED,
      failCount: 1,
      durationMs: Math.round(performance.now() - startedAt),
      completedAt: new Date(),
      warningsJson: JSON.stringify([message]),
    },
  });
}

async function processPolicyCsvImportJob(ctx: ProcessCtx): Promise<PolicyCsvImportJobResult> {
  let created = 0;
  let updated = 0;
  let fail = 0;
  const errors: string[] = [];
  const rowErrors: CsvRowError[] = [];

  await prisma.csvImportJob.update({
    where: { id: ctx.jobId },
    data: {
      status: CsvJobStatus.PROCESSING,
      rowCount: ctx.dataRows.length,
      progressPercent: 0,
    },
  });

  if (!ctx.dryRun && ctx.legacyFormat) {
    await ensureGeoDropdowns(uniqueGeoFromPolicyCsv(ctx.header, ctx.dataRows));
  }

  const svkkIdx = ctx.header.findIndex((h) => h.trim().toLowerCase() === "svkk id");
  const policyIdx = ctx.header.findIndex((h) => h.trim().toLowerCase() === "policy no");
  const refIdx = ctx.header.findIndex((h) => h.trim().toLowerCase() === "ref no");

  for (let batchStart = 0; batchStart < ctx.dataRows.length; batchStart += CSV_IMPORT_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + CSV_IMPORT_BATCH_SIZE, ctx.dataRows.length);
    for (let i = batchStart; i < batchEnd; i++) {
      const row = ctx.dataRows[i]!;
      const rowNum = i + ctx.headerOffset;
      const svkkId = svkkIdx >= 0 ? (row[svkkIdx] ?? "") : "";
      const policyNo = policyIdx >= 0 ? (row[policyIdx] ?? "") : "";
      const refNo = refIdx >= 0 ? (row[refIdx] ?? "") : "";

      try {
        if (ctx.dryRun) {
          if (ctx.supportedFormat && ctx.typeCache) {
            const outcome = await processLegacyPolicyCsvRow(ctx.header, row, {
              userId: ctx.userId,
              permissions: ctx.permissions,
              scope: ctx.scope,
              importMode: ctx.importMode,
              updateMode: ctx.updateMode,
              typeCache: ctx.typeCache,
              categories: ctx.categories,
              dryRun: true,
              allowNegativeWallet: ctx.allowNegativeWallet,
              updateLookupCache: ctx.updateLookupCache,
            });
            if (outcome === "created") created++;
            else updated++;
          } else {
            validateLegacyRow(ctx.updateMode, ctx.header, row);
            updated++;
          }
        } else if (ctx.supportedFormat && ctx.typeCache) {
          const outcome = await processLegacyPolicyCsvRow(ctx.header, row, {
            userId: ctx.userId,
            permissions: ctx.permissions,
            scope: ctx.scope,
            importMode: ctx.importMode,
            updateMode: ctx.updateMode,
            typeCache: ctx.typeCache,
            categories: ctx.categories,
            allowNegativeWallet: ctx.allowNegativeWallet,
            updateLookupCache: ctx.updateLookupCache,
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

      if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === ctx.dataRows.length) {
        const pct = Math.min(99, Math.round(((i + 1) / Math.max(ctx.dataRows.length, 1)) * 100));
        await prisma.csvImportJob.update({
          where: { id: ctx.jobId },
          data: {
            progressPercent: pct,
            createdCount: created,
            updatedCount: updated,
            failCount: fail,
            successCount: created + updated,
          },
        });
      }
    }
  }

  if (!ctx.dryRun) {
    await backfillGeoDropdownsFromRecords();
  }

  const durationMs = Math.round(performance.now() - ctx.startedAt);
  const valid = created + updated;
  const status = fail > 0 && valid === 0 ? CsvJobStatus.FAILED : CsvJobStatus.COMPLETED;

  let errorReportPath: string | undefined;
  if (rowErrors.length > 0) {
    errorReportPath = join(ctx.uploadDir, `errors-${ctx.jobId}.csv`);
    await writeFile(errorReportPath, buildErrorReportCsv(rowErrors), "utf8");
  }

  await prisma.csvImportJob.update({
    where: { id: ctx.jobId },
    data: {
      status,
      rowCount: ctx.dataRows.length,
      successCount: valid,
      failCount: fail,
      createdCount: created,
      updatedCount: updated,
      durationMs,
      csvVersion: ctx.csvVersion,
      warningsJson: ctx.warnings.length ? JSON.stringify(ctx.warnings) : undefined,
      errorReportS3Key: errorReportPath,
      progressPercent: 100,
      completedAt: new Date(),
    },
  });

  await writeActivityLog({
    userId: ctx.userId,
    module: "upload",
    action: ctx.dryRun ? "CSV_VALIDATED" : "CSV_IMPORTED",
    entityType: "CsvImportJob",
    entityId: ctx.jobId,
    afterData: {
      fileName: ctx.fileName,
      rowCount: ctx.dataRows.length,
      created,
      updated,
      fail,
      failed: fail,
      success: valid,
      successCount: valid,
      failCount: fail,
      dryRun: ctx.dryRun,
      durationMs,
      importMode: ctx.importMode,
      updateMode: ctx.updateMode,
      errorReportUrl: errorReportPath ? `/upload/csv/${ctx.jobId}/errors.csv` : undefined,
    },
  });

  return {
    jobId: ctx.jobId,
    mode: ctx.importMode,
    dryRun: ctx.dryRun,
    rowCount: ctx.dataRows.length,
    created,
    updated,
    failed: fail,
    valid,
    invalid: fail,
    durationMs,
    csvVersion: ctx.csvVersion,
    errors: errors.slice(0, 50),
    warnings: ctx.warnings,
    errorReportUrl: errorReportPath ? `/upload/csv/${ctx.jobId}/errors.csv` : undefined,
    status,
    progressPercent: 100,
  };
}

/**
 * Run legacy/v2 policy CSV import or validation job.
 * Pass `wait: false` to return while processing continues (confirm path).
 */
export async function runPolicyCsvImportJob(
  env: Env,
  opts: RunOpts,
): Promise<PolicyCsvImportJobResult> {
  const checksum = createHash("sha256").update(opts.fileBuffer).digest("hex");
  const prior = await findPriorCompletedImport(checksum, opts.updateMode);

  const skipDuplicateBlock =
    opts.importMode === CsvImportMode.UPDATE_ONLY &&
    (opts.updateMode === CsvUpdateMode.POLICY_COURIER || opts.updateMode === CsvUpdateMode.FULL);

  if (prior && env.CSV_DUPLICATE_MODE === "block" && !opts.force && !opts.dryRun && !skipDuplicateBlock) {
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
      progressPercent: 0,
    },
  });

  const diskPath = join(env.UPLOAD_DIR, `${job.id}.csv`);
  await writeFile(diskPath, opts.fileBuffer);
  await prisma.csvImportJob.update({ where: { id: job.id }, data: { s3Key: diskPath } });

  const text = opts.fileBuffer.toString("utf8");
  const allRows = parseCsv(text);
  const { csvVersion, header, dataRows } = parseCsvWithOptionalVersion(allRows);
  if (!header.length) {
    await finishJobFailed(job.id, "CSV has no header row", startedAt);
    throw new AppError("CSV_EMPTY", "CSV has no header row", 400);
  }

  const policyScope = await loadMisScope(opts.userId, opts.permissions, "policy");
  const legacyFormat = isLegacyPolicyCsvFormat(header);
  const policyCourierUpdateFormat =
    opts.updateMode === CsvUpdateMode.POLICY_COURIER && isPolicyCourierUpdateCsvFormat(header);
  const supportedFormat = legacyFormat || policyCourierUpdateFormat;
  const typeCache = supportedFormat ? await buildPolicyTypeCache(prisma) : null;
  const categories = supportedFormat ? await loadCategoryRefs() : [];

  if (!supportedFormat) {
    await finishJobFailed(job.id, "Unsupported CSV format for policy import", startedAt);
    throw new AppError("CSV_FORMAT", "Unsupported CSV format for policy import", 400);
  }

  const headerOffset = allRows[0]?.[0]?.trim().toUpperCase() === "CSV_VERSION" ? 3 : 2;
  const warnings = collectDeprecatedHeaderWarnings(header);

  let updateLookupCache: PolicyCsvUpdateLookupCache | null = null;
  if (isPolicyRefNoUpdateMode(opts.importMode, opts.updateMode)) {
    const refIdx = header.findIndex((h) => h.trim().toLowerCase() === "ref no");
    const policyIdx = header.findIndex((h) => h.trim().toLowerCase() === "policy no");
    const refNos: string[] = [];
    const policyNos: string[] = [];
    for (const row of dataRows) {
      if (refIdx >= 0) refNos.push((row[refIdx] ?? "").trim());
      if (policyIdx >= 0) policyNos.push((row[policyIdx] ?? "").trim());
    }
    updateLookupCache = await buildPolicyCsvUpdateLookupCache(prisma, { refNos, policyNos });
  }

  const ctx: ProcessCtx = {
    jobId: job.id,
    userId: opts.userId,
    permissions: opts.permissions,
    scope: policyScope,
    importMode: opts.importMode,
    updateMode: opts.updateMode,
    dryRun: opts.dryRun,
    allowNegativeWallet: opts.allowNegativeWallet === true,
    fileName: opts.fileName,
    header,
    dataRows,
    headerOffset,
    csvVersion,
    warnings,
    supportedFormat,
    legacyFormat,
    typeCache,
    categories,
    updateLookupCache,
    startedAt,
    uploadDir: env.UPLOAD_DIR,
  };

  const wait = opts.wait !== false;
  if (!wait) {
    void processPolicyCsvImportJob(ctx).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await finishJobFailed(job.id, message, startedAt);
      } catch {
        /* ignore secondary failure */
      }
    });
    return {
      jobId: job.id,
      mode: opts.importMode,
      dryRun: opts.dryRun,
      rowCount: dataRows.length,
      created: 0,
      updated: 0,
      failed: 0,
      valid: 0,
      invalid: 0,
      durationMs: Math.round(performance.now() - startedAt),
      csvVersion,
      errors: [],
      warnings,
      status: CsvJobStatus.PROCESSING,
      async: true,
      progressPercent: 0,
    };
  }

  return processPolicyCsvImportJob(ctx);
}

/** Load a stored preview file and run import (confirm step). */
export async function runPolicyCsvImportFromPath(
  env: Env,
  opts: Omit<RunOpts, "fileBuffer"> & { filePath: string },
): Promise<PolicyCsvImportJobResult> {
  const fileBuffer = await readFile(opts.filePath);
  return runPolicyCsvImportJob(env, { ...opts, fileBuffer });
}
