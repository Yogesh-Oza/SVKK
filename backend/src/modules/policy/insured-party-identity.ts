import type { InsuredParty, Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";

/** Enable with SVKK_DEBUG_INSURED_PARTY=true or NODE_ENV=development. */
export function isInsuredPartyIdentityDebugEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.SVKK_DEBUG_INSURED_PARTY === "true"
  );
}

export function debugInsuredPartyIdentity(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isInsuredPartyIdentityDebugEnabled()) return;
  console.debug(`[svkk:insured-party-identity] ${label}`, data);
}

/** Trim user/API input; empty string becomes null. */
export function normalizeSvkkPublicIdInput(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Case-insensitive equality for SVKK public IDs. */
export function svkkPublicIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = a?.trim() ?? "";
  const right = b?.trim() ?? "";
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Find insured party by SVKK ID.
 * MySQL `utf8mb4_unicode_ci` unique index is case-insensitive, so findUnique suffices.
 */
export async function findInsuredPartyBySvkkPublicId(
  tx: Prisma.TransactionClient,
  rawSvkk: string,
): Promise<InsuredParty | null> {
  const svkk = normalizeSvkkPublicIdInput(rawSvkk);
  if (!svkk) return null;

  return tx.insuredParty.findUnique({ where: { svkkPublicId: svkk } });
}

export type SvkkAvailabilityResult =
  | { ok: true }
  | { ok: false; clash: { id: string; svkkPublicId: string } };

/**
 * Ensure SVKK ID is free, or belongs to excludePartyId (update / carry-forward).
 */
export async function assertSvkkPublicIdAvailable(
  tx: Prisma.TransactionClient,
  rawSvkk: string,
  excludePartyId?: string,
): Promise<SvkkAvailabilityResult> {
  const svkk = normalizeSvkkPublicIdInput(rawSvkk);
  if (!svkk) return { ok: true };

  const clash = await tx.insuredParty.findUnique({
    where: { svkkPublicId: svkk },
    select: { id: true, svkkPublicId: true },
  });

  debugInsuredPartyIdentity("assertSvkkPublicIdAvailable", {
    incomingSvkkId: svkk,
    excludePartyId: excludePartyId ?? null,
    clashPartyId: clash?.id ?? null,
    clashSvkkId: clash?.svkkPublicId ?? null,
  });

  if (clash && clash.id !== excludePartyId) {
    return { ok: false, clash };
  }
  return { ok: true };
}

/** Map Prisma P2002 on InsuredParty to a user-facing conflict message. */
export function insuredPartyUniqueConflictMessage(
  target: string | string[] | undefined,
): string {
  const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (targetStr.includes("svkkPublicId")) {
    return "SVKK ID already in use";
  }
  if (targetStr.includes("mobile")) {
    return "Mobile number already in use";
  }
  if (targetStr.includes("customerId")) {
    return "Customer ID already in use";
  }
  return `Duplicate unique field${targetStr ? `: ${targetStr}` : ""}`;
}

/** Re-throw Prisma unique violations as AppError CONFLICT when applicable. */
export function rethrowInsuredPartyUniqueConflict(e: unknown): never {
  if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
    const target = (e as { meta?: { target?: string | string[] } }).meta?.target;
    throw new AppError("CONFLICT", insuredPartyUniqueConflictMessage(target), 409);
  }
  throw e;
}
