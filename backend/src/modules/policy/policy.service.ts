import type { PolicyChart, Prisma } from "@prisma/client";
import { CounterType, ChartMode, PolicyChartKind } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { normalizeMobile } from "../../domain/phone.js";
import { allocateCounter, formatSvkkId } from "../../services/counter.service.js";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";

export interface CreatePolicyInput {
  actorUserId: string;
  mobile: string;
  partyName: string;
  email?: string | null;
  policyTypeId: string;
  yearLabel: string;
  policyChartId: string;
  policyStart?: Date | null;
  policyEnd?: Date | null;
  sumInsured: number;
  policyNo?: string | null;
  village?: string | null;
  pod?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  contactPhone?: string | null;
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  loanRef?: string | null;
  courierTracking?: string | null;
  remarks?: string | null;
  paymentMode?: string | null;
  paymentType?: string | null;
  amountReceived?: number | null;
  bankName?: string | null;
  bankAccountLast4?: string | null;
  utrRef?: string | null;
  yearRemarks?: string | null;
  members: {
    name: string;
    dob: Date;
    relationship: string;
    gender: string;
    riderAmount?: number;
  }[];
}

export async function createPolicyWithYear(input: CreatePolicyInput) {
  const mobile = normalizeMobile(input.mobile);
  const period = String(new Date().getFullYear());

  const chart = await prisma.policyChart.findUnique({
    where: { id: input.policyChartId },
    include: { policyType: true },
  });
  if (!chart) {
    throw new AppError("CHART_NOT_FOUND", "policyChartId invalid", 400);
  }
  if (chart.policyTypeId !== input.policyTypeId) {
    throw new AppError("CHART_TYPE_MISMATCH", "Chart does not belong to policy type", 400);
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let party = await tx.insuredParty.findUnique({ where: { mobile } });
    if (!party) {
      const seq = await allocateCounter(CounterType.SVKK_PUBLIC_ID, period, tx);
      const svkkPublicId = formatSvkkId(period, seq);
      party = await tx.insuredParty.create({
        data: {
          mobile,
          svkkPublicId,
          name: input.partyName,
          email: input.email ?? undefined,
        },
      });
    }

    const policy = await tx.policy.create({
      data: {
        insuredPartyId: party.id,
        policyTypeId: input.policyTypeId,
        createdById: input.actorUserId,
        policyNo: input.policyNo ?? undefined,
        village: input.village ?? undefined,
        pod: input.pod ?? undefined,
        addressLine1: input.addressLine1 ?? undefined,
        addressLine2: input.addressLine2 ?? undefined,
        city: input.city ?? undefined,
        state: input.state ?? undefined,
        pincode: input.pincode ?? undefined,
        contactPhone: input.contactPhone ?? undefined,
        nomineeName: input.nomineeName ?? undefined,
        nomineeRelation: input.nomineeRelation ?? undefined,
        loanRef: input.loanRef ?? undefined,
        courierTracking: input.courierTracking ?? undefined,
        remarks: input.remarks ?? undefined,
      },
    });

    const year = await tx.policyYear.create({
      data: {
        policyId: policy.id,
        yearLabel: input.yearLabel,
        policyChartId: input.policyChartId,
        policyStart: input.policyStart ?? undefined,
        policyEnd: input.policyEnd ?? undefined,
        sumInsured: input.sumInsured,
        paymentMode: input.paymentMode ?? undefined,
        paymentType: input.paymentType ?? undefined,
        amountReceived: input.amountReceived ?? undefined,
        bankName: input.bankName ?? undefined,
        bankAccountLast4: input.bankAccountLast4 ?? undefined,
        utrRef: input.utrRef ?? undefined,
        yearRemarks: input.yearRemarks ?? undefined,
      },
    });

    for (const m of input.members) {
      await tx.member.create({
        data: {
          policyYearId: year.id,
          name: m.name,
          dob: m.dob,
          relationship: m.relationship,
          gender: m.gender,
          riderAmount: m.riderAmount ?? 0,
        },
      });
    }

    return { party, policy, year };
  });

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_CREATED",
    entityType: "Policy",
    entityId: result.policy.id,
    afterData: { policyId: result.policy.id, yearId: result.year.id } as unknown as Prisma.InputJsonValue,
  });

  return result;
}

export async function resolveChartsForType(
  policyTypeId: string,
  policyChartId: string,
): Promise<{ chartMode: ChartMode; holder: PolicyChart; member: PolicyChart | null }> {
  const pt = await prisma.policyType.findUnique({
    where: { id: policyTypeId },
  });
  if (!pt) throw new AppError("POLICY_TYPE_NOT_FOUND", "Invalid policy type", 400);

  const primary = await prisma.policyChart.findUnique({ where: { id: policyChartId } });
  if (!primary || primary.policyTypeId !== policyTypeId) {
    throw new AppError("CHART_NOT_FOUND", "Invalid chart for type", 400);
  }

  if (pt.chartMode === ChartMode.SINGLE) {
    return { chartMode: pt.chartMode, holder: primary, member: null };
  }

  const holder =
    primary.chartKind === PolicyChartKind.HOLDER || primary.chartKind === PolicyChartKind.COMBINED
      ? primary
      : await prisma.policyChart.findFirst({
          where: {
            policyTypeId,
            version: primary.version,
            chartKind: PolicyChartKind.HOLDER,
          },
        });
  if (!holder) throw new AppError("CHART_NOT_FOUND", "Holder chart missing", 400);

  const member =
    primary.chartKind === PolicyChartKind.MEMBER
      ? primary
      : await prisma.policyChart.findFirst({
          where: {
            policyTypeId,
            version: primary.version,
            chartKind: PolicyChartKind.MEMBER,
          },
        });

  return { chartMode: pt.chartMode, holder, member };
}

export type PolicySectionPatch = {
  policyNo?: string | null;
  village?: string | null;
  pod?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  contactPhone?: string | null;
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  loanRef?: string | null;
  courierTracking?: string | null;
  remarks?: string | null;
};

export type PolicyYearSectionPatch = {
  yearLabel: string;
  policyStart?: Date | null;
  policyEnd?: Date | null;
  sumInsured?: number | null;
  paymentMode?: string | null;
  paymentType?: string | null;
  amountReceived?: number | null;
  bankName?: string | null;
  bankAccountLast4?: string | null;
  utrRef?: string | null;
  yearRemarks?: string | null;
};

/**
 * Updates policy and optionally one policy year; writes an activity log with before/after snapshots.
 */
export async function updatePolicySections(input: {
  actorUserId: string;
  policyId: string;
  policy: PolicySectionPatch;
  year?: PolicyYearSectionPatch;
}) {
  const existing = await prisma.policy.findUnique({
    where: { id: input.policyId },
    include: { years: { orderBy: { yearLabel: "desc" } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Policy not found", 404);
  }

  if (input.year) {
    const y = existing.years.find((x) => x.yearLabel === input.year!.yearLabel);
    if (!y) {
      throw new AppError("YEAR_NOT_FOUND", "Policy year not found for label", 400);
    }
  }

  const pData = Object.fromEntries(
    Object.entries(input.policy).filter(([, v]) => v !== undefined),
  ) as Prisma.PolicyUpdateInput;
  const hasPolicyFields = Object.keys(pData).length > 0;
  const y = input.year;
  const hasYearValueFields = y
    ? [
        y.policyStart,
        y.policyEnd,
        y.sumInsured,
        y.paymentMode,
        y.paymentType,
        y.amountReceived,
        y.bankName,
        y.bankAccountLast4,
        y.utrRef,
        y.yearRemarks,
      ].some((v) => v !== undefined)
    : false;
  if (!hasPolicyFields && (!y || !hasYearValueFields)) {
    throw new AppError("NO_CHANGES", "No fields to update", 400);
  }

  const beforeSnapshot = { policy: existing, yearLabel: input.year?.yearLabel };

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (hasPolicyFields) {
      await tx.policy.update({ where: { id: input.policyId }, data: pData });
    }

    if (input.year) {
      const y = input.year;
      const yearData: Prisma.PolicyYearUpdateInput = {
        ...(y.policyStart !== undefined ? { policyStart: y.policyStart } : {}),
        ...(y.policyEnd !== undefined ? { policyEnd: y.policyEnd } : {}),
        ...(y.sumInsured !== undefined ? { sumInsured: y.sumInsured } : {}),
        ...(y.paymentMode !== undefined ? { paymentMode: y.paymentMode } : {}),
        ...(y.paymentType !== undefined ? { paymentType: y.paymentType } : {}),
        ...(y.amountReceived !== undefined ? { amountReceived: y.amountReceived } : {}),
        ...(y.bankName !== undefined ? { bankName: y.bankName } : {}),
        ...(y.bankAccountLast4 !== undefined ? { bankAccountLast4: y.bankAccountLast4 } : {}),
        ...(y.utrRef !== undefined ? { utrRef: y.utrRef } : {}),
        ...(y.yearRemarks !== undefined ? { yearRemarks: y.yearRemarks } : {}),
      };
      if (Object.keys(yearData).length > 0) {
        await tx.policyYear.update({
          where: {
            policyId_yearLabel: { policyId: input.policyId, yearLabel: y.yearLabel },
          },
          data: yearData,
        });
      }
    }

    return tx.policy.findUniqueOrThrow({
      where: { id: input.policyId },
      include: { years: { orderBy: { yearLabel: "desc" } } },
    });
  });

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_UPDATED",
    entityType: "Policy",
    entityId: input.policyId,
    beforeData: beforeSnapshot as unknown as Prisma.InputJsonValue,
    afterData: { policy: updated, yearLabel: input.year?.yearLabel } as unknown as Prisma.InputJsonValue,
  });

  return updated;
}
