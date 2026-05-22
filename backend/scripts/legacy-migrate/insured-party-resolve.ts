import type { InsuredParty, Prisma } from "@prisma/client";
import { syntheticMobileFromRef, type TransformedPolicy } from "./transform.js";

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
 * Primary identity is svkkPublicId (legacy svvk_id). customerId and mobile are
 * secondary and must not attach a policy to a party with a different SVKK ID.
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
    const party = await updateInsuredParty(tx, existingBySvkk, t, migrationRunId, warnings);
    return { party, warnings, created: false };
  }

  if (t.customerId) {
    const byCustomer = await tx.insuredParty.findUnique({ where: { customerId: t.customerId } });
    if (byCustomer && byCustomer.svkkPublicId !== t.svkkPublicId) {
      warnings.push("CUSTOMER_ID_COLLISION_DIFFERENT_SVKK");
    }
  }

  const byMobile = await tx.insuredParty.findUnique({ where: { mobile: t.mobile } });
  let mobileForCreate = t.mobile;
  if (byMobile && byMobile.svkkPublicId !== t.svkkPublicId) {
    warnings.push("MOBILE_COLLISION_DIFFERENT_SVKK");
    mobileForCreate = syntheticMobileFromRef(`svkk-${t.svkkPublicId}`);
  }

  let customerIdForCreate: string | undefined = t.customerId ?? undefined;
  if (t.customerId) {
    const byCustomer = await tx.insuredParty.findUnique({ where: { customerId: t.customerId } });
    if (byCustomer && byCustomer.svkkPublicId !== t.svkkPublicId) {
      customerIdForCreate = undefined;
    }
  }

  try {
    const party = await tx.insuredParty.create({
      data: {
        mobile: mobileForCreate,
        customerId: customerIdForCreate,
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
        const party = await updateInsuredParty(tx, retryBySvkk, t, migrationRunId, warnings);
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
  warnings: string[],
): Promise<InsuredParty> {
  if (party.mobile !== t.mobile) {
    const mobileOwner = await tx.insuredParty.findUnique({ where: { mobile: t.mobile } });
    if (!mobileOwner || mobileOwner.id === party.id) {
      // safe to refresh mobile on this SVKK party
    } else {
      warnings.push("MOBILE_COLLISION_SKIP_UPDATE");
    }
  }

  await tx.insuredParty.update({
    where: { id: party.id },
    data: {
      name: t.partyName,
      email: t.email ?? undefined,
      customerId:
        t.customerId && (!party.customerId || party.customerId === t.customerId)
          ? t.customerId
          : party.customerId ?? undefined,
      pan: t.pan ?? party.pan,
      dateOfBirth: t.holderDob ?? party.dateOfBirth,
      migratedRunId: migrationRunId,
    },
  });
  return tx.insuredParty.findUniqueOrThrow({ where: { id: party.id } });
}
