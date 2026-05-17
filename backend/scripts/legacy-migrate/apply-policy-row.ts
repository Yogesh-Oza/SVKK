import { Prisma, type PrismaClient } from "@prisma/client";
import { applyPaymentAndChequeForPolicy } from "./apply-payment-from-policy-row.js";
import type { DropdownResolver } from "./dropdown-resolver.js";
import {
  mergeResolvedPolicyFields,
  resolvePolicyDropdownFields,
  transformMemberRowAsync,
  transformPolicyRow,
  type ResolvedPolicyFields,
} from "./transform.js";
import type { ResolvedTargets } from "./validate.js";
import type { LegacyMemberRow, LegacyPolicyRow } from "./types.js";

export interface ApplyRowResult {
  warnings: string[];
  memberDobSentinelCount: number;
  chequeCreated: boolean;
  paymentCreated: boolean;
  receiptCreated: boolean;
}

export interface ApplyRowOptions {
  migrationRunId: string;
  resolver: DropdownResolver;
  resolved?: ResolvedPolicyFields;
  skipPayments?: boolean;
  skipReceipt?: boolean;
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
  options: ApplyRowOptions,
): Promise<ApplyRowResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => applyLegacyPolicyRowTx(tx, row, members, targets, options),
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
  options: ApplyRowOptions,
): Promise<ApplyRowResult> {
  const warnings: string[] = [];
  let memberDobSentinelCount = 0;
  let chequeCreated = false;
  let paymentCreated = false;
  let receiptCreated = false;

  const t = transformPolicyRow(row);
  const resolved =
    options.resolved ??
    (await resolvePolicyDropdownFields(row, options.resolver));
  mergeResolvedPolicyFields(t.policyData, resolved);

  let party =
    t.customerId != null
      ? await tx.insuredParty.findUnique({ where: { customerId: t.customerId } })
      : null;
  if (!party) {
    party = await tx.insuredParty.findUnique({ where: { mobile: t.mobile } });
  }

  let partyCreated = false;
  if (party) {
    if (party.svkkPublicId !== t.svkkPublicId) {
      warnings.push("SVKK_MISMATCH_KEEP_EXISTING");
    }
    if (party.mobile !== t.mobile && party.customerId && t.customerId && party.customerId !== t.customerId) {
      warnings.push("PHONE_COLLISION");
    }
    await tx.insuredParty.update({
      where: { id: party.id },
      data: {
        name: t.partyName,
        email: t.email ?? undefined,
        customerId: t.customerId ?? party.customerId ?? undefined,
        pan: t.pan ?? party.pan,
        dateOfBirth: t.holderDob ?? party.dateOfBirth,
        migratedRunId: options.migrationRunId,
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
          createdInMigrationRunId: options.migrationRunId,
          migratedRunId: options.migrationRunId,
        },
      });
      partyCreated = true;
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
            migratedRunId: options.migrationRunId,
          },
        });
        party = await tx.insuredParty.findUniqueOrThrow({ where: { id: party.id } });
      } else {
        throw e;
      }
    }
  }

  if (partyCreated) {
    void partyCreated;
  }

  const policyScalar = buildPolicyScalar(t.policyData as Record<string, unknown>);
  const policy = await tx.policy.upsert({
    where: { referenceNo: t.refNo },
    create: {
      insuredPartyId: party.id,
      policyTypeId: targets.policyTypeId,
      categoryId: targets.categoryId,
      referenceNo: t.refNo,
      migratedRunId: options.migrationRunId,
      ...policyScalar,
    },
    update: {
      insuredPartyId: party.id,
      policyTypeId: targets.policyTypeId,
      categoryId: targets.categoryId,
      migratedRunId: options.migrationRunId,
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
      migratedRunId: options.migrationRunId,
      paymentMode: resolved.paymentMode,
      ...yearScalar,
    },
    update: {
      policyChartId: targets.holderChartId,
      migratedRunId: options.migrationRunId,
      paymentMode: resolved.paymentMode,
      ...yearScalar,
      deletedAt: null,
    },
  });

  await tx.member.deleteMany({ where: { policyYearId: policyYear.id } });

  const memberCreates: Prisma.MemberCreateManyInput[] = [];
  for (const m of members) {
    if (!m.ref_no || String(m.ref_no).trim() !== t.refNo) continue;
    const tm = await transformMemberRowAsync(m, options.resolver);
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
      migratedRunId: options.migrationRunId,
    });
  }

  if (memberCreates.length > 0) {
    await tx.member.createMany({ data: memberCreates });
  }

  if (!options.skipPayments) {
    const pay = await applyPaymentAndChequeForPolicy(
      tx,
      row,
      t,
      policyYear.id,
      options.migrationRunId,
      resolved.paymentMode,
    );
    chequeCreated = pay.chequeCreated;
    paymentCreated = pay.paymentCreated;
  }

  if (!options.skipReceipt) {
    const amount =
      t.yearData.expectedNetPremium instanceof Prisma.Decimal
        ? Number(t.yearData.expectedNetPremium)
        : 0;
    if (amount > 0) {
      const existingReceipt = await tx.receipt.findFirst({ where: { policyId: policy.id } });
      if (!existingReceipt) {
        const { createReceiptOnPolicyCreate } = await import(
          "../../src/services/receipt.service.js"
        );
        await createReceiptOnPolicyCreate(tx, {
          policyId: policy.id,
          policyYearId: policyYear.id,
          amount,
          paymentMode: resolved.paymentMode,
          issuedAt:
            t.yearData.policyStart instanceof Date ? t.yearData.policyStart : undefined,
        });
        await tx.receipt.updateMany({
          where: { policyId: policy.id },
          data: { migratedRunId: options.migrationRunId },
        });
        receiptCreated = true;
      }
    }
  }

  return {
    warnings,
    memberDobSentinelCount,
    chequeCreated,
    paymentCreated,
    receiptCreated,
  };
}

function buildPolicyScalar(
  p: Record<string, unknown>,
): Omit<Prisma.PolicyUncheckedUpdateInput, "id" | "insuredPartyId" | "policyTypeId"> {
  const { referenceNo: _r, ...rest } = p as { referenceNo?: string } & Record<string, unknown>;
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
