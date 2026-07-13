import type { InsuredParty, Prisma } from "@prisma/client";
import type { TransformedPolicy } from "./transform.js";

export type InsuredPartyResolveInput = Pick<
  TransformedPolicy,
  | "refNo"
  | "customerId"
  | "svkkPublicId"
  | "mobile"
  | "partyName"
  | "email"
  | "pan"
  | "holderDob"
>;

export interface InsuredPartyResolveResult {
  party: InsuredParty;
  warnings: string[];
  created: boolean;
}

/**
 * Resolve InsuredParty for a legacy policy row.
 *
 * Primary identity is svkkPublicId (legacy svvk_id). Mobile and customerId are
 * not unique and may be shared across holders.
 */
export async function resolveInsuredPartyForLegacyRow(
  tx: Prisma.TransactionClient,
  t: InsuredPartyResolveInput,
  migrationRunId: string,
): Promise<InsuredPartyResolveResult> {
  const warnings: string[] = [];

  const existingBySvkk = await tx.insuredParty.findUnique({
    where: { svkkPublicId: t.svkkPublicId },
  });

  if (existingBySvkk) {
    if (t.customerId && existingBySvkk.customerId && existingBySvkk.customerId !== t.customerId) {
      warnings.push("CUSTOMER_ID_MISMATCH_ON_SVKK");
    }
    const party = await updateInsuredParty(tx, existingBySvkk, t, migrationRunId);
    return { party, warnings, created: false };
  }

  try {
    const party = await tx.insuredParty.create({
      data: {
        mobile: t.mobile,
        customerId: t.customerId ?? undefined,
        svkkPublicId: t.svkkPublicId,
        name: t.partyName,
        email: t.email ?? undefined,
        pan: t.pan ?? undefined,
        dateOfBirth: t.holderDob ?? undefined,
        createdInMigrationRunId: migrationRunId,
        migratedRunId: migrationRunId,
      },
    });
    return { party, warnings, created: true };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      const retryBySvkk = await tx.insuredParty.findUnique({
        where: { svkkPublicId: t.svkkPublicId },
      });
      if (retryBySvkk) {
        warnings.push("PARTY_DEDUPED_ON_UNIQUE_VIOLATION");
        const party = await updateInsuredParty(tx, retryBySvkk, t, migrationRunId);
        return { party, warnings, created: false };
      }
    }
    throw e;
  }
}

async function updateInsuredParty(
  tx: Prisma.TransactionClient,
  party: InsuredParty,
  t: InsuredPartyResolveInput,
  migrationRunId: string,
): Promise<InsuredParty> {
  await tx.insuredParty.update({
    where: { id: party.id },
    data: {
      name: t.partyName,
      email: t.email ?? undefined,
      mobile: t.mobile,
      customerId: t.customerId ?? party.customerId ?? undefined,
      pan: t.pan ?? party.pan,
      dateOfBirth: t.holderDob ?? party.dateOfBirth,
      migratedRunId: migrationRunId,
    },
  });
  return tx.insuredParty.findUniqueOrThrow({ where: { id: party.id } });
}
