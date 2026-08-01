import type { InsuredParty, Prisma } from "@prisma/client";
import { normalizeMobile } from "../../domain/phone.js";
import { debugInsuredPartyIdentity, rethrowInsuredPartyUniqueConflict } from "./insured-party-identity.js";

/**
 * Updates an insured party's mobile when the normalized number changed.
 * Mobile is not unique — the same number may exist on other holders.
 *
 * Policy create/edit/CSV must NOT call this for historical isolation —
 * primary mobile is stored on Policy.holderMobile. Kept for admin/tools
 * that intentionally update the party master seed only.
 */
export async function reconcileInsuredPartyMobile(
  tx: Prisma.TransactionClient,
  party: InsuredParty,
  rawMobile: string,
): Promise<InsuredParty> {
  const mobile = normalizeMobile(rawMobile);
  debugInsuredPartyIdentity("reconcileInsuredPartyMobile", {
    partyId: party.id,
    incomingMobile: rawMobile,
    normalizedMobile: mobile,
    currentMobile: party.mobile,
  });

  if (normalizeMobile(party.mobile) === mobile) {
    return party;
  }

  try {
    return await tx.insuredParty.update({
      where: { id: party.id },
      data: { mobile },
    });
  } catch (e) {
    rethrowInsuredPartyUniqueConflict(e);
  }
}
