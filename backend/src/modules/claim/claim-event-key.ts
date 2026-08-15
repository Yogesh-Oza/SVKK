import { createHash } from "crypto";
import { normalizePolicyNo } from "./claim-csv-normalize.js";
import { normalizeClaimNo } from "./claim-csv-group.js";

function utcDayKey(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function n(raw: string | number | null | undefined): string {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase().replace(/\s+/g, " ");
}

function money(raw: number | null | undefined): string {
  if (raw == null || !Number.isFinite(raw)) return "";
  return raw.toFixed(2);
}

export type ClaimEventKeySource = {
  claimNo: string;
  policyNo?: string | null;
  actualLodgeType?: string | null;
  claimType?: string | null;
  statusText?: string | null;
  claimAmount?: number | null;
  reportedLodgeAmount?: number | null;
  approvedAmount?: number | null;
  deductionAmount?: number | null;
  admissionDate?: Date | null;
  lodgeDate?: Date | null;
  paymentDate?: Date | null;
  paymentDetails?: string | null;
  paymentInFavourOf?: string | null;
};

/**
 * Deterministic identity for a TPA payment/status row.
 * Does not use filename or CSV row number, so re-exports stay idempotent.
 */
export function claimEventKeyFromRow(row: ClaimEventKeySource): string {
  const parts = [
    normalizeClaimNo(row.claimNo),
    normalizePolicyNo(row.policyNo ?? ""),
    n(row.actualLodgeType),
    n(row.claimType),
    n(row.statusText),
    money(row.claimAmount),
    money(row.reportedLodgeAmount),
    money(row.approvedAmount),
    money(row.deductionAmount),
    utcDayKey(row.admissionDate),
    utcDayKey(row.lodgeDate),
    utcDayKey(row.paymentDate),
    n(row.paymentDetails),
    n(row.paymentInFavourOf),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
