import type { InsuredParty, Prisma } from "@prisma/client";
import { normalizeMobile } from "../../domain/phone.js";
import { AppError } from "../../errors/app-error.js";

/**
 * Updates an insured party's mobile when the normalized number changed.
 * Rejects when the target mobile belongs to a different party.
 */
export async function reconcileInsuredPartyMobile(
  tx: Prisma.TransactionClient,
  party: InsuredParty,
  rawMobile: string,
): Promise<InsuredParty> {
  const mobile = normalizeMobile(rawMobile);
  if (normalizeMobile(party.mobile) === mobile) {
    return party;
  }

  const clash = await tx.insuredParty.findFirst({
    where: { mobile, NOT: { id: party.id } },
  });
  if (clash) {
    throw new AppError("CONFLICT", "Mobile number already in use", 409);
  }

  return tx.insuredParty.update({
    where: { id: party.id },
    data: { mobile },
  });
}
