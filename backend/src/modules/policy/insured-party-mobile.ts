import type { InsuredParty, Prisma } from "@prisma/client";
import { normalizeMobile } from "../../domain/phone.js";

/**
 * Updates an insured party's mobile when the normalized number changed.
 * Mobile is not unique — the same number may exist on other holders.
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

  return tx.insuredParty.update({
    where: { id: party.id },
    data: { mobile },
  });
}
