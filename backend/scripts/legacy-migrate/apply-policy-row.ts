import { Prisma, type PrismaClient } from "@prisma/client";
import { transformMemberRow, transformPolicyRow } from "./transform.js";
import type { ResolvedTargets } from "./validate.js";
import type { LegacyMemberRow, LegacyPolicyRow } from "./types.js";

export interface ApplyRowResult {
  warnings: string[];
  memberDobSentinelCount: number;
}

function isTransientPrismaError(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: string }).code;
    if (code === "P2034" || code === "P2024") return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /timeout|deadlock|ECONNRESET|ETIMEDOUT/i.test(msg);
}

export async function applyLegacyPolicyRowWithRetries(
  prisma: PrismaClient,
  row: LegacyPolicyRow,
  members: LegacyMemberRow[],
  targets: ResolvedTargets,
  retries: number,
  retryDelayMs: number,
): Promise<ApplyRowResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => applyLegacyPolicyRowTx(tx, row, members, targets),
        { timeout: 120_000 },
      );
    } catch (e) {
      lastErr = e;
      if (attempt < retries && isTransientPrismaError(e)) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function applyLegacyPolicyRowTx(
  tx: Prisma.TransactionClient,
  row: LegacyPolicyRow,
  members: LegacyMemberRow[],
  targets: ResolvedTargets,
): Promise<ApplyRowResult> {
  const warnings: string[] = [];
  let memberDobSentinelCount = 0;

  const t = transformPolicyRow(row);

  let party =
    t.customerId != null
      ? await tx.insuredParty.findUnique({ where: { customerId: t.customerId } })
      : null;
  if (!party) {
    party = await tx.insuredParty.findUnique({ where: { mobile: t.mobile } });
  }

  if (party) {
    if (party.svkkPublicId !== t.svkkPublicId) {
      warnings.push("SVKK_MISMATCH_KEEP_EXISTING");
    }
    await tx.insuredParty.update({
      where: { id: party.id },
      data: {
        name: t.partyName,
        email: t.email ?? undefined,
        customerId: t.customerId ?? party.customerId ?? undefined,
        pan: t.pan ?? party.pan,
        dateOfBirth: t.holderDob ?? party.dateOfBirth,
      },
    });
    party = await tx.insuredParty.findUniqueOrThrow({ where: { id: party.id } });
  } else {
    try {
      party = await tx.insuredParty.create({
        data: {
          mobile: t.mobile,
          customerId: t.customerId ?? undefined,
          svkkPublicId: t.svkkPublicId,
          name: t.partyName,
          email: t.email ?? undefined,
          pan: t.pan ?? undefined,
          dateOfBirth: t.holderDob ?? undefined,
        },
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
        party = await tx.insuredParty.findFirst({
          where: { OR: [{ mobile: t.mobile }, { svkkPublicId: t.svkkPublicId }] },
        });
        if (!party) throw e;
        warnings.push("PARTY_DEDUPED_ON_UNIQUE_VIOLATION");
        await tx.insuredParty.update({
          where: { id: party.id },
          data: {
            name: t.partyName,
            email: t.email ?? undefined,
            customerId: t.customerId ?? party.customerId ?? undefined,
            pan: t.pan ?? party.pan,
            dateOfBirth: t.holderDob ?? party.dateOfBirth,
          },
        });
        party = await tx.insuredParty.findUniqueOrThrow({ where: { id: party.id } });
      } else {
        throw e;
      }
    }
  }

  const policyScalar = buildPolicyScalar(t.policyData as Record<string, unknown>);
  const policy = await tx.policy.upsert({
    where: { referenceNo: t.refNo },
    create: {
      insuredPartyId: party.id,
      policyTypeId: targets.policyTypeId,
      categoryId: targets.categoryId,
      referenceNo: t.refNo,
      ...policyScalar,
    },
    update: {
      insuredPartyId: party.id,
      policyTypeId: targets.policyTypeId,
      categoryId: targets.categoryId,
      ...policyScalar,
      deletedAt: null,
    },
  });

  const yearScalar = buildYearScalar(t.yearData as Record<string, unknown>);
  const policyYear = await tx.policyYear.upsert({
    where: {
      policyId_yearLabel: { policyId: policy.id, yearLabel: t.yearLabel },
    },
    create: {
      policyId: policy.id,
      yearLabel: t.yearLabel,
      policyChartId: targets.holderChartId,
      ...yearScalar,
    },
    update: {
      policyChartId: targets.holderChartId,
      ...yearScalar,
      deletedAt: null,
    },
  });

  await tx.member.deleteMany({ where: { policyYearId: policyYear.id } });

  const memberCreates: Prisma.MemberCreateManyInput[] = [];
  for (const m of members) {
    if (!m.ref_no || String(m.ref_no).trim() !== t.refNo) continue;
    const tm = transformMemberRow(m);
    if (tm.dobSentinel) {
      memberDobSentinelCount += 1;
      warnings.push("MEMBER_DOB_SENTINEL");
    }
    memberCreates.push({
      policyYearId: policyYear.id,
      name: tm.name,
      dob: tm.dob,
      relationship: tm.relationship,
      gender: tm.gender,
      riderAmount: new Prisma.Decimal(0),
      sumInsured: tm.sumInsured ?? undefined,
      cumulativeBonus: tm.cumulativeBonus ?? undefined,
      dateOfJoining: tm.dateOfJoining ?? undefined,
      memberPhone: tm.memberPhone ?? undefined,
      basicPremium: tm.basicPremium ?? undefined,
      ageAtEntry: tm.ageAtEntry ?? undefined,
    });
  }

  if (memberCreates.length > 0) {
    await tx.member.createMany({ data: memberCreates });
  }

  return { warnings, memberDobSentinelCount };
}

function buildPolicyScalar(
  p: Record<string, unknown>,
): Omit<Prisma.PolicyUncheckedUpdateInput, "id" | "insuredPartyId" | "policyTypeId"> {
  const {
    referenceNo: _r,
    ...rest
  } = p as { referenceNo?: string } & Record<string, unknown>;
  return rest as Omit<Prisma.PolicyUncheckedUpdateInput, "id" | "insuredPartyId" | "policyTypeId">;
}

function buildYearScalar(
  y: Record<string, unknown>,
): Omit<Prisma.PolicyYearUncheckedUpdateInput, "id" | "policyId" | "yearLabel" | "policyChartId"> {
  return y as Omit<
    Prisma.PolicyYearUncheckedUpdateInput,
    "id" | "policyId" | "yearLabel" | "policyChartId"
  >;
}
