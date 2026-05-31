import { ClaimStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const SETTING_KEY = "claim.statusMap";

/** Default TPA status text → enum mapping. */
export const DEFAULT_CLAIM_STATUS_MAP: Record<string, ClaimStatus> = {
  paid: ClaimStatus.APPROVED,
  settled: ClaimStatus.APPROVED,
  approved: ClaimStatus.APPROVED,
  "claim approved": ClaimStatus.APPROVED,
  denied: ClaimStatus.REJECTED,
  rejected: ClaimStatus.REJECTED,
  repudiated: ClaimStatus.REJECTED,
  "claim denied": ClaimStatus.REJECTED,
  pending: ClaimStatus.PENDING,
  "under process": ClaimStatus.PENDING,
  processing: ClaimStatus.PENDING,
  open: ClaimStatus.PENDING,
};

/** Normalize status text for map lookup. */
export function normalizeStatusText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Load status map from AppSetting or fall back to defaults. */
export async function loadClaimStatusMap(): Promise<Record<string, ClaimStatus>> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row?.value) return { ...DEFAULT_CLAIM_STATUS_MAP };
  try {
    const parsed = JSON.parse(row.value) as Record<string, string>;
    const out: Record<string, ClaimStatus> = { ...DEFAULT_CLAIM_STATUS_MAP };
    for (const [k, v] of Object.entries(parsed)) {
      const norm = normalizeStatusText(k);
      const upper = String(v).trim().toUpperCase();
      if (upper === "APPROVED" || upper === "REJECTED" || upper === "PENDING") {
        out[norm] = upper as ClaimStatus;
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_CLAIM_STATUS_MAP };
  }
}

/** Map TPA status text to ClaimStatus enum. */
export function mapStatusTextToEnum(
  raw: string,
  map: Record<string, ClaimStatus>,
): ClaimStatus {
  const norm = normalizeStatusText(raw);
  if (!norm) return ClaimStatus.PENDING;
  return map[norm] ?? ClaimStatus.PENDING;
}
