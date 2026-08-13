import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import type { CsvImportMode, CsvUpdateMode } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getOrCreateWallet } from "../wallet/wallet.service.js";
import { effectiveCdAmount } from "../wallet/wallet-policy-sync.js";
import { getCsvField, rowToHeaderMap } from "./policy-csv-parse.js";
import {
  parseCdAccount,
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

export type PolicyCsvWalletImpact = {
  totalDebit: number;
  totalCredit: number;
  currentBalance: number;
  resultingBalance: number;
  wouldGoNegative: boolean;
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

type ExistingCd = { cdAccountUsed?: boolean | null; cdAmount?: unknown };

function csvNextEffectiveCd(map: Map<string, string>, existing?: ExistingCd | null): Prisma.Decimal {
  const usedRaw = getCsvField(map, "cd_account_status");
  const amtRaw = getCsvField(map, "cd_amount");
  const parsedUsed = parseCdAccount(usedRaw);
  if (!existing) {
    return effectiveCdAmount({
      cdAccountUsed: parsedUsed,
      cdAmount: amtRaw.trim() || null,
    });
  }
  return effectiveCdAmount({
    cdAccountUsed: parsedUsed !== undefined ? parsedUsed : existing.cdAccountUsed,
    cdAmount: amtRaw.trim() ? amtRaw.trim() : existing.cdAmount,
  });
}

function walletDeltaForRow(map: Map<string, string>, existing?: ExistingCd | null): Prisma.Decimal {
  const next = csvNextEffectiveCd(map, existing);
  const prev = existing
    ? effectiveCdAmount({
        cdAccountUsed: existing.cdAccountUsed,
        cdAmount: existing.cdAmount,
      })
    : new Prisma.Decimal(0);
  return next.minus(prev);
}

function money(d: Prisma.Decimal): number {
  return Number(d.toFixed(2));
}

async function loadCurrentWalletBalance(): Promise<Prisma.Decimal | null> {
  try {
    const wallet = await getOrCreateWallet();
    return new Prisma.Decimal(wallet.currentBalance);
  } catch {
    return null;
  }
}

type PreviewEval = {
  row: PolicyPreviewRow;
  walletDelta: Prisma.Decimal;
};

function previewEval(row: PolicyPreviewRow, walletDelta = new Prisma.Decimal(0)): PreviewEval {
  return { row, walletDelta: row.status === "READY" ? walletDelta : new Prisma.Decimal(0) };
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
  const evaluated = await evaluatePolicyPreviewRowInternal(header, row, rowNumber, ctx);
  return evaluated.row;
}

async function evaluatePolicyPreviewRowInternal(
  header: string[],
  row: string[],
  rowNumber: number,
  ctx: Pick<LegacyCsvRowContext, "importMode" | "updateMode" | "typeCache" | "permissions" | "scope" | "userId">,
): Promise<PreviewEval> {
  const map = rowToHeaderMap(header, row);
  const refNo = getCsvField(map, "ref no");
  const svkkId = getCsvField(map, "SVKK ID");
  const policyNo = getCsvField(map, "policy no");
  const yearCsv = getCsvField(map, "year");
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
        year: yearCsv,
      });

      if (conflict) {
        return previewEval({ ...base, status: "CONFLICT", errorMessage: conflict });
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

      return previewEval(
        {
          ...base,
          detailMessage: detailMessage || undefined,
          updateFields,
        },
        walletDeltaForRow(map, match),
      );
    }

    const { match, conflict } = await resolvePolicyForCsvImport(prisma, {
      svkkId,
      policyNo,
      refNo,
      year: yearCsv,
    });

    if (conflict) {
      return previewEval({ ...base, status: "CONFLICT", errorMessage: conflict });
    }

    if (match && ctx.importMode === "CREATE_ONLY") {
      return previewEval({
        ...base,
        status: "EXISTS",
        errorMessage: "Policy already exists (CREATE_ONLY mode)",
      });
    }

    await processLegacyPolicyCsvRow(header, row, {
      ...ctx,
      dryRun: true,
    });

    return previewEval(base, walletDeltaForRow(map, match));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return previewEval({ ...base, status: "ERROR", errorMessage: message });
  }
}

/** Build preview table rows (first N) and aggregate summary for all rows. */
export async function buildPolicyImportPreview(
  header: string[],
  dataRows: string[][],
  headerOffset: number,
  ctx: Pick<LegacyCsvRowContext, "importMode" | "updateMode" | "typeCache" | "permissions" | "scope" | "userId">,
): Promise<{
  previewRows: PolicyPreviewRow[];
  summary: PolicyPreviewSummary;
  walletImpact?: PolicyCsvWalletImpact;
}> {
  const summary = emptyPolicyPreviewSummary();
  summary.totalRows = dataRows.length;
  const all: PolicyPreviewRow[] = [];
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNumber = i + headerOffset;
    const evaluated = await evaluatePolicyPreviewRowInternal(header, row, rowNumber, ctx);
    all.push(evaluated.row);
    recordSummary(summary, evaluated.row.status);
    if (evaluated.walletDelta.gt(0)) totalDebit = totalDebit.plus(evaluated.walletDelta);
    else if (evaluated.walletDelta.lt(0)) totalCredit = totalCredit.plus(evaluated.walletDelta.abs());
  }

  const limit = Math.min(POLICY_PREVIEW_ROW_LIMIT, all.length);
  const current = await loadCurrentWalletBalance();
  const walletImpact =
    current == null
      ? undefined
      : (() => {
          const resulting = current.minus(totalDebit).plus(totalCredit);
          return {
            totalDebit: money(totalDebit),
            totalCredit: money(totalCredit),
            currentBalance: money(current),
            resultingBalance: money(resulting),
            wouldGoNegative: resulting.lt(0),
          };
        })();

  return { previewRows: all.slice(0, limit), summary, walletImpact };
}
