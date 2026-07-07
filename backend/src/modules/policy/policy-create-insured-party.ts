import type { InsuredParty, Prisma } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { reconcileInsuredPartyMobile } from "./insured-party-mobile.js";

export type ResolveInsuredPartyInput = {
  customSvkk: string | null;
  mobile: string;
};

/**
 * Find an existing insured party for policy create.
 * Matches by SVKK ID only (carry-forward / renewal), never by Customer ID or mobile alone.
 */
export async function resolveInsuredPartyForPolicyCreate(
  tx: Prisma.TransactionClient,
  input: ResolveInsuredPartyInput,
): Promise<InsuredParty | null> {
  if (!input.customSvkk) {
    return null;
  }

  const party = await tx.insuredParty.findUnique({ where: { svkkPublicId: input.customSvkk } });
  if (!party) {
    return null;
  }

  return reconcileInsuredPartyMobile(tx, party, input.mobile);
}

/** Reject create when mobile already belongs to a different insured party. */
export async function assertMobileAvailableForNewInsuredParty(
  tx: Prisma.TransactionClient,
  mobile: string,
  existingPartyId?: string | null,
): Promise<void> {
  const clash = await tx.insuredParty.findUnique({ where: { mobile } });
  if (clash && clash.id !== existingPartyId) {
    throw new AppError(
      "CONFLICT",
      "This mobile number is already linked to another policy holder. Use Carry Forward / Renew for an existing policy.",
      409,
    );
  }
}
