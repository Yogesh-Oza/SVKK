import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import type { CsvImportMode, CsvUpdateMode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getCsvField, rowToHeaderMap } from "./policy-csv-parse.js";
import {
  processLegacyPolicyCsvRow,
  type LegacyCsvRowContext,
} from "./policy-csv-import.js";
import { resolvePolicyForCsvImport, resolvePolicyForCsvUpdate } from "./policy-csv-resolve.js";
import {
  isPolicyCourierUpdateMode,
  isPolicyFullUpdateMode,
  isPolicyRefNoUpdateMode,
  describePolicyCourierUpdateFields,
  describeCsvRowUpdateFields,
  listPolicyCourierUpdateFieldValues,
  listCsvRowUpdateFieldValues,
} from "./policy-csv-update-scope.js";
import type { PolicyTypeCache } from "./policy-csv-resolve.js";
import type { GeoScope } from "../../services/mis-scope.service.js";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

export const POLICY_PREVIEW_ROW_LIMIT = 20;

export type PolicyPreviewRowStatus = "READY" | "EXISTS" | "ERROR" | "CONFLICT";

export type PolicyPreviewPayload = {
  userId: string;
  checksum: string;
  filePath: string;
  importMode: CsvImportMode;
  updateMode: CsvUpdateMode;
  fileName: string;
  exp: number;
  nonce: string;
};

export type PolicyPreviewSummary = {
  totalRows: number;
  ready: number;
  alreadyExists: number;
  errors: number;
  conflicts: number;
};

export type PolicyPreviewRow = {
  rowNumber: number;
  refNo: string;
  svkkId: string;
  policyNo: string;
  holderName: string;
  productType: string;
  village: string;
  status: PolicyPreviewRowStatus;
  errorMessage?: string;
  /** Non-error detail (e.g. fields to update in POLICY_COURIER mode). */
  detailMessage?: string;
  /** Field/value pairs to apply in POLICY_COURIER update mode. */
  updateFields?: Array<{ field: string; value: string }>;
};

function previewSecret(env: Env): string {
  return env.ACCESS_TOKEN_SECRET;
}

/** Sign a preview token binding file checksum and import options. */
export function createPolicyPreviewToken(
  env: Env,
  payload: Omit<PolicyPreviewPayload, "exp" | "nonce">,
): string {
  const full: PolicyPreviewPayload = {
    ...payload,
    exp: Date.now() + PREVIEW_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", previewSecret(env)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify preview token and return payload. */
export function verifyPolicyPreviewToken(env: Env, token: string, userId: string): PolicyPreviewPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new AppError("INVALID_PREVIEW_TOKEN", "Invalid preview token", 400);
  }
  const [body, sig] = parts as [string, string];
  const expected = createHmac("sha256", previewSecret(env)).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("INVALID_PREVIEW_TOKEN", "Invalid preview token signature", 400);
  }

  let payload: PolicyPreviewPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PolicyPreviewPayload;
  } catch {
    throw new AppError("INVALID_PREVIEW_TOKEN", "Invalid preview token payload", 400);
  }

  if (payload.userId !== userId) {
    throw new AppError("FORBIDDEN", "Preview token does not belong to this user", 403);
  }
  if (Date.now() > payload.exp) {
    throw new AppError("PREVIEW_EXPIRED", "Preview token expired; upload again", 410);
  }
  return payload;
}

export function hashPolicyPreviewToken(token: string): string {
  return createHmac("sha256", "policy-preview").update(token).digest("hex");
}

export function emptyPolicyPreviewSummary(): PolicyPreviewSummary {
  return { totalRows: 0, ready: 0, alreadyExists: 0, errors: 0, conflicts: 0 };
}

/** Max rows allowed per policy CSV import (env override). */
export function policyImportMaxRows(): number {
  return Number(process.env.POLICY_IMPORT_MAX_ROWS ?? 10000) || 10000;
}

function recordSummary(summary: PolicyPreviewSummary, status: PolicyPreviewRowStatus): void {
  if (status === "READY") summary.ready++;
  else if (status === "EXISTS") summary.alreadyExists++;
  else if (status === "CONFLICT") summary.conflicts++;
  else summary.errors++;
}

/**
 * Dry-run evaluation for one legacy/v2 policy CSV row (CREATE_ONLY preview).
 */
export async function evaluatePolicyPreviewRow(
  header: string[],
  row: string[],
  rowNumber: number,
  ctx: Pick<LegacyCsvRowContext, "importMode" | "updateMode" | "typeCache" | "permissions" | "scope" | "userId">,
): Promise<PolicyPreviewRow> {
  const map = rowToHeaderMap(header, row);
  const refNo = getCsvField(map, "ref no");
  const svkkId = getCsvField(map, "SVKK ID");
  const policyNo = getCsvField(map, "policy no");
  const base: PolicyPreviewRow = {
    rowNumber,
    refNo,
    svkkId,
    policyNo,
    holderName: getCsvField(map, "Holder name"),
    productType: getCsvField(map, "Product Type"),
    village: getCsvField(map, "Village"),
    status: "READY",
  };

  try {
    if (isPolicyRefNoUpdateMode(ctx.importMode, ctx.updateMode)) {
      const { match, conflict } = await resolvePolicyForCsvUpdate(prisma, {
        refNo,
        svkkId,
        policyNo,
      });

      if (conflict) {
        return { ...base, status: "CONFLICT", errorMessage: conflict };
      }

      await processLegacyPolicyCsvRow(header, row, {
        ...ctx,
        dryRun: true,
      });

      const updateFields = isPolicyCourierUpdateMode(ctx.updateMode)
        ? listPolicyCourierUpdateFieldValues(map)
        : listCsvRowUpdateFieldValues(header, map);
      const detailMessage = isPolicyCourierUpdateMode(ctx.updateMode)
        ? describePolicyCourierUpdateFields(map)
        : describeCsvRowUpdateFields(header, map);

      return {
        ...base,
        detailMessage: detailMessage || undefined,
        updateFields,
      };
    }

    const { match, conflict } = await resolvePolicyForCsvImport(prisma, {
      svkkId,
      policyNo,
      refNo,
    });

    if (conflict) {
      return { ...base, status: "CONFLICT", errorMessage: conflict };
    }

    if (match && ctx.importMode === "CREATE_ONLY") {
      return {
        ...base,
        status: "EXISTS",
        errorMessage: "Policy already exists (CREATE_ONLY mode)",
      };
    }

    await processLegacyPolicyCsvRow(header, row, {
      ...ctx,
      dryRun: true,
    });

    return base;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, status: "ERROR", errorMessage: message };
  }
}

/** Build preview table rows (first N) and aggregate summary for all rows. */
export async function buildPolicyImportPreview(
  header: string[],
  dataRows: string[][],
  headerOffset: number,
  ctx: Pick<LegacyCsvRowContext, "importMode" | "updateMode" | "typeCache" | "permissions" | "scope" | "userId">,
): Promise<{ previewRows: PolicyPreviewRow[]; summary: PolicyPreviewSummary }> {
  const summary = emptyPolicyPreviewSummary();
  summary.totalRows = dataRows.length;
  const all: PolicyPreviewRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNumber = i + headerOffset;
    const evaluated = await evaluatePolicyPreviewRow(header, row, rowNumber, ctx);
    all.push(evaluated);
    recordSummary(summary, evaluated.status);
  }

  const limit = Math.min(POLICY_PREVIEW_ROW_LIMIT, all.length);
  return { previewRows: all.slice(0, limit), summary };
}
