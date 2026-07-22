import type { InsuredParty, Prisma } from "@prisma/client";
import {
  debugInsuredPartyIdentity,
  findInsuredPartyBySvkkPublicId,
  normalizeSvkkPublicIdInput,
} from "./insured-party-identity.js";
import { reconcileInsuredPartyMobile } from "./insured-party-mobile.js";

export type ResolveInsuredPartyInput = {
  customSvkk: string | null;
  mobile: string;
};

/**
 * Find an existing insured party for policy create.
 * Matches by SVKK ID only (carry-forward / renewal).
 * Mobile and customer ID are not unique and must not merge holders.
 */
export async function resolveInsuredPartyForPolicyCreate(
  tx: Prisma.TransactionClient,
  input: ResolveInsuredPartyInput,
): Promise<InsuredParty | null> {
  const customSvkk = normalizeSvkkPublicIdInput(input.customSvkk);
  if (!customSvkk) {
    return null;
  }

  const party = await findInsuredPartyBySvkkPublicId(tx, customSvkk);
  debugInsuredPartyIdentity("resolveInsuredPartyForPolicyCreate", {
    incomingSvkkId: customSvkk,
    incomingMobile: input.mobile,
    matchedPartyId: party?.id ?? null,
    matchedSvkkId: party?.svkkPublicId ?? null,
  });

  if (!party) {
    return null;
  }

  return reconcileInsuredPartyMobile(tx, party, input.mobile);
}
