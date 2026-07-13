import type { InsuredParty, Prisma } from "@prisma/client";
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
  if (!input.customSvkk) {
    return null;
  }

  const party = await tx.insuredParty.findUnique({ where: { svkkPublicId: input.customSvkk } });
  if (!party) {
    return null;
  }

  return reconcileInsuredPartyMobile(tx, party, input.mobile);
}
