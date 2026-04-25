import type { InsuredParty, PolicyChart, Prisma, PolicyGrouping, AdProductVariant } from "@prisma/client";
import {
  CounterType,
  ChartMode,
  PolicyChartKind,
  ChequeStatus,
  PayMethod,
  PaymentStatus,
} from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { normalizeMobile } from "../../domain/phone.js";
import { allocateCounter, formatSvkkId } from "../../services/counter.service.js";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { createPolicyBodySchema } from "./policy.schemas.js";

export type CreatePolicyInput = z.infer<typeof createPolicyBodySchema> & { actorUserId: string };

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
    if (input.categoryId) {
      const c = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!c) {
        throw new AppError("BAD_REQUEST", "Invalid categoryId", 400);
      }
    }

    const customSvkk = input.svkkPublicId?.trim() || null;
    const customerId = input.customerId?.trim() || null;

    let party: InsuredParty | null = null;
    if (customerId) {
      party = await tx.insuredParty.findUnique({ where: { customerId } });
      if (party && normalizeMobile(party.mobile) !== mobile) {
        throw new AppError("CONFLICT", "Customer ID is linked to a different mobile number", 409);
      }
    }
    if (!party) {
      party = await tx.insuredParty.findUnique({ where: { mobile } });
    }

    if (customSvkk) {
      const taken = await tx.insuredParty.findUnique({ where: { svkkPublicId: customSvkk } });
      if (taken && (!party || taken.id !== party.id)) {
        throw new AppError("CONFLICT", "SVKK public ID is already in use", 409);
      }
    }

    if (!party) {
      const svkkPublicId = customSvkk
        ? customSvkk
        : formatSvkkId(period, await allocateCounter(CounterType.SVKK_PUBLIC_ID, period, tx));
      try {
        party = await tx.insuredParty.create({
          data: {
            mobile,
            customerId: customerId ?? undefined,
            svkkPublicId,
            name: input.partyName,
            email: input.email ?? undefined,
            pan: input.pan?.toUpperCase() ?? undefined,
            dateOfBirth: input.dateOfBirth ?? undefined,
          },
        });
      } catch (e) {
        if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
          throw new AppError("CONFLICT", "Duplicate customer id or unique field", 409);
        }
        throw e;
      }
    } else {
      const updated = await tx.insuredParty.update({
        where: { id: party.id },
        data: {
          name: input.partyName,
          email: input.email ?? undefined,
          customerId: customerId ?? party.customerId ?? undefined,
          pan: input.pan?.toUpperCase() ?? party.pan,
          dateOfBirth: input.dateOfBirth ?? party.dateOfBirth,
          ...(customSvkk ? { svkkPublicId: customSvkk } : {}),
        },
      });
      party = updated;
    }

    const expected =
      input.expectedNetPremium != null
        ? input.expectedNetPremium
        : (input.amountReceived != null ? input.amountReceived : null);

    const personsCount = input.personsInsuredCount ?? input.members.length;

    const policy = await tx.policy.create({
      data: {
        insuredPartyId: party.id,
        policyTypeId: input.policyTypeId,
        categoryId: input.categoryId ?? undefined,
        createdById: input.actorUserId,
        policyNo: input.policyNo ?? undefined,
        village: input.village ?? undefined,
        pod: input.pod ?? undefined,
        addressLine1: input.addressLine1 ?? undefined,
        addressLine2: input.addressLine2 ?? undefined,
        addressLine3: input.addressLine3 ?? undefined,
        addressLine4: input.addressLine4 ?? undefined,
        city: input.city ?? undefined,
        state: input.state ?? undefined,
        pincode: input.pincode ?? undefined,
        contactPhone: input.contactPhone ?? undefined,
        nomineeName: input.nomineeName ?? undefined,
        nomineeRelation: input.nomineeRelation ?? undefined,
        loanRef: input.loanRef ?? undefined,
        courierTracking: input.courierTracking ?? undefined,
        remarks: input.remarks ?? undefined,
        adProductVariant: input.adProductVariant ?? undefined,
        insuranceCompany: input.insuranceCompany ?? undefined,
        tpa: input.tpa ?? undefined,
        categoryText: input.categoryText ?? undefined,
        holderRelationship: input.holderRelationship ?? undefined,
        holderAge: input.holderAge ?? undefined,
        personsInsuredCount: personsCount,
        area: input.area ?? undefined,
        referenceNo: input.referenceNo ?? undefined,
        mobileSecondary: input.mobileSecondary ?? undefined,
        policyGrouping: input.policyGrouping ?? undefined,
        policyUrl: input.policyUrl ?? undefined,
        loanStatus: input.loanStatus ?? undefined,
        loanAmount: input.loanAmount != null ? input.loanAmount : undefined,
        refundChequeAmount: input.refundChequeAmount != null ? input.refundChequeAmount : undefined,
        refundChequeNo: input.refundChequeNo ?? undefined,
        refundChequeDate: input.refundChequeDate ?? undefined,
        cdAccountUsed: input.cdAccountUsed ?? undefined,
        cdAmount: input.cdAmount != null ? input.cdAmount : undefined,
        courierStatus: input.courierStatus ?? undefined,
        courierDate: input.courierDate ?? undefined,
        courierAddress: input.courierAddress ?? undefined,
        periodYearText: input.periodYearText ?? undefined,
        periodMonthText: input.periodMonthText ?? undefined,
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
        expectedNetPremium: expected != null ? expected : undefined,
        paymentMode: input.paymentMode ?? undefined,
        paymentType: input.paymentType ?? undefined,
        amountReceived: input.amountReceived ?? undefined,
        bankName: input.bankName ?? undefined,
        bankAccountLast4: input.bankAccountLast4 ?? undefined,
        utrRef: input.utrRef ?? undefined,
        yearRemarks: input.yearRemarks ?? undefined,
        holderCumulativeBonus: input.holderCumulativeBonus != null ? input.holderCumulativeBonus : undefined,
        holderJoiningYear: input.holderJoiningYear ?? undefined,
        holderBasicPremium: input.holderBasicPremium != null ? input.holderBasicPremium : undefined,
        vkkPremium: input.vkkPremium != null ? input.vkkPremium : undefined,
        grossPremium: input.grossPremium != null ? input.grossPremium : undefined,
        commissionAmount: input.commissionAmount != null ? input.commissionAmount : undefined,
        twoLacFloater: input.twoLacFloater != null ? input.twoLacFloater : undefined,
        yearPolicyHolderPremium:
          input.yearPolicyHolderPremium != null ? input.yearPolicyHolderPremium : undefined,
        gaamMahajanVkk: input.gaamMahajanVkk != null ? input.gaamMahajanVkk : undefined,
        excessShortAmount: input.excessShortAmount != null ? input.excessShortAmount : undefined,
        diffPaidByHolder: input.diffPaidByHolder != null ? input.diffPaidByHolder : undefined,
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
          sumInsured: m.sumInsured != null && m.sumInsured !== undefined ? m.sumInsured : undefined,
          cumulativeBonus: m.cumulativeBonus != null && m.cumulativeBonus !== undefined ? m.cumulativeBonus : undefined,
          dateOfJoining: m.dateOfJoining ?? undefined,
          memberPhone: m.memberPhone ?? undefined,
          basicPremium: m.basicPremium != null && m.basicPremium !== undefined ? m.basicPremium : undefined,
          ageAtEntry: m.ageAtEntry != null && m.ageAtEntry !== undefined ? m.ageAtEntry : undefined,
        },
      });
    }

    if (input.initialPayment) {
      const ip = input.initialPayment;
      let chequeId: string | undefined;
      if (ip.method === PayMethod.CHQ) {
        if (!ip.cheque) {
          throw new AppError("VALIDATION", "cheque block required for CHQ", 400);
        }
        const cq = ip.cheque;
        const ch = await tx.cheque.create({
          data: {
            number: cq.number,
            bankName: cq.bankName,
            ifsc: cq.ifsc ?? undefined,
            status: cq.status ?? ChequeStatus.PENDING,
            reason: cq.reason ?? undefined,
            accountNo: cq.accountNo ?? undefined,
            branch: cq.branch ?? undefined,
            nameAsPerCheque: cq.nameAsPerCheque ?? undefined,
            notOver: cq.notOver ?? undefined,
            chequeDate: cq.chequeDate ?? undefined,
          },
        });
        chequeId = ch.id;
      }
      const status =
        ip.method === PayMethod.CHQ && ip.cheque?.status === ChequeStatus.DISHONOURED
          ? PaymentStatus.FAILED
          : PaymentStatus.COMPLETED;
      await tx.payment.create({
        data: {
          policyYearId: year.id,
          amount: ip.amount,
          method: ip.method,
          status,
          chequeId: chequeId ?? null,
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

  return prisma.policy.findFirstOrThrow({
    where: { id: result.policy.id, deletedAt: null },
    include: {
      insuredParty: true,
      policyType: true,
      category: true,
      years: {
        where: { deletedAt: null },
        orderBy: { yearLabel: "desc" },
        include: {
          members: { where: { deletedAt: null } },
          payments: { where: { deletedAt: null }, include: { cheque: true } },
        },
      },
    },
  });
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
  categoryId?: string | null;
  village?: string | null;
  pod?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  addressLine4?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  contactPhone?: string | null;
  nomineeName?: string | null;
  nomineeRelation?: string | null;
  loanRef?: string | null;
  courierTracking?: string | null;
  remarks?: string | null;
  adProductVariant?: AdProductVariant | null;
  insuranceCompany?: string | null;
  tpa?: string | null;
  categoryText?: string | null;
  holderRelationship?: string | null;
  holderAge?: number | null;
  personsInsuredCount?: number | null;
  area?: string | null;
  referenceNo?: string | null;
  mobileSecondary?: string | null;
  policyGrouping?: PolicyGrouping | null;
  policyUrl?: string | null;
  loanStatus?: string | null;
  loanAmount?: number | null;
  refundChequeAmount?: number | null;
  refundChequeNo?: string | null;
  refundChequeDate?: Date | null;
  cdAccountUsed?: boolean | null;
  cdAmount?: number | null;
  courierStatus?: string | null;
  courierDate?: Date | null;
  courierAddress?: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
};

export type PolicyYearSectionPatch = {
  yearLabel: string;
  policyStart?: Date | null;
  policyEnd?: Date | null;
  sumInsured?: number | null;
  expectedNetPremium?: number | null;
  paymentMode?: string | null;
  paymentType?: string | null;
  amountReceived?: number | null;
  bankName?: string | null;
  bankAccountLast4?: string | null;
  utrRef?: string | null;
  yearRemarks?: string | null;
  vkkPremium?: number | null;
  grossPremium?: number | null;
  commissionAmount?: number | null;
  twoLacFloater?: number | null;
  yearPolicyHolderPremium?: number | null;
  gaamMahajanVkk?: number | null;
  excessShortAmount?: number | null;
  diffPaidByHolder?: number | null;
  holderCumulativeBonus?: number | null;
  holderJoiningYear?: string | null;
  holderBasicPremium?: number | null;
};

/**
 * Updates policy and optionally one policy year; writes an activity log with before/after snapshots.
 */
export async function updatePolicySections(input: {
  actorUserId: string;
  policyId: string;
  expectedUpdatedAt?: Date | null;
  policy: PolicySectionPatch;
  year?: PolicyYearSectionPatch;
}) {
  const existing = await prisma.policy.findFirst({
    where: { id: input.policyId, deletedAt: null },
    include: { years: { orderBy: { yearLabel: "desc" } } },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Policy not found", 404);
  }

  if (input.expectedUpdatedAt) {
    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new AppError("CONFLICT", "Policy was modified by another session", 409);
    }
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
        y.expectedNetPremium,
        y.paymentMode,
        y.paymentType,
        y.amountReceived,
        y.bankName,
        y.bankAccountLast4,
        y.utrRef,
        y.yearRemarks,
        y.vkkPremium,
        y.grossPremium,
        y.commissionAmount,
        y.twoLacFloater,
        y.yearPolicyHolderPremium,
        y.gaamMahajanVkk,
        y.excessShortAmount,
        y.diffPaidByHolder,
        y.holderCumulativeBonus,
        y.holderJoiningYear,
        y.holderBasicPremium,
      ].some((v) => v !== undefined)
    : false;
  if (!hasPolicyFields && (!y || !hasYearValueFields)) {
    throw new AppError("NO_CHANGES", "No fields to update", 400);
  }

  const beforeSnapshot = { policy: existing, yearLabel: input.year?.yearLabel };

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (hasPolicyFields) {
      await tx.policy.update({
        where: { id: input.policyId },
        data: { ...pData, version: { increment: 1 } },
      });
    }

    if (input.year) {
      const y = input.year;
      const yearData: Prisma.PolicyYearUpdateInput = {
        ...(y.policyStart !== undefined ? { policyStart: y.policyStart } : {}),
        ...(y.policyEnd !== undefined ? { policyEnd: y.policyEnd } : {}),
        ...(y.sumInsured !== undefined ? { sumInsured: y.sumInsured } : {}),
        ...(y.expectedNetPremium !== undefined ? { expectedNetPremium: y.expectedNetPremium } : {}),
        ...(y.paymentMode !== undefined ? { paymentMode: y.paymentMode } : {}),
        ...(y.paymentType !== undefined ? { paymentType: y.paymentType } : {}),
        ...(y.amountReceived !== undefined ? { amountReceived: y.amountReceived } : {}),
        ...(y.bankName !== undefined ? { bankName: y.bankName } : {}),
        ...(y.bankAccountLast4 !== undefined ? { bankAccountLast4: y.bankAccountLast4 } : {}),
        ...(y.utrRef !== undefined ? { utrRef: y.utrRef } : {}),
        ...(y.yearRemarks !== undefined ? { yearRemarks: y.yearRemarks } : {}),
        ...(y.vkkPremium !== undefined ? { vkkPremium: y.vkkPremium } : {}),
        ...(y.grossPremium !== undefined ? { grossPremium: y.grossPremium } : {}),
        ...(y.commissionAmount !== undefined ? { commissionAmount: y.commissionAmount } : {}),
        ...(y.twoLacFloater !== undefined ? { twoLacFloater: y.twoLacFloater } : {}),
        ...(y.yearPolicyHolderPremium !== undefined
          ? { yearPolicyHolderPremium: y.yearPolicyHolderPremium }
          : {}),
        ...(y.gaamMahajanVkk !== undefined ? { gaamMahajanVkk: y.gaamMahajanVkk } : {}),
        ...(y.excessShortAmount !== undefined ? { excessShortAmount: y.excessShortAmount } : {}),
        ...(y.diffPaidByHolder !== undefined ? { diffPaidByHolder: y.diffPaidByHolder } : {}),
        ...(y.holderCumulativeBonus !== undefined
          ? { holderCumulativeBonus: y.holderCumulativeBonus }
          : {}),
        ...(y.holderJoiningYear !== undefined ? { holderJoiningYear: y.holderJoiningYear } : {}),
        ...(y.holderBasicPremium !== undefined ? { holderBasicPremium: y.holderBasicPremium } : {}),
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

    if (!hasPolicyFields && (input.year && hasYearValueFields)) {
      await tx.policy.update({
        where: { id: input.policyId },
        data: { version: { increment: 1 } },
      });
    }

    return tx.policy.findUniqueOrThrow({
      where: { id: input.policyId },
      include: {
        insuredParty: true,
        policyType: true,
        category: true,
        years: {
          where: { deletedAt: null },
          orderBy: { yearLabel: "desc" },
          include: {
            members: { where: { deletedAt: null } },
            payments: { where: { deletedAt: null }, include: { cheque: true } },
          },
        },
      },
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

/**
 * Soft-deletes a policy; related policy years and members are hidden by `deletedAt` on the parent in reads.
 */
export async function softDeletePolicy(input: { actorUserId: string; policyId: string }) {
  const existing = await prisma.policy.findFirst({
    where: { id: input.policyId, deletedAt: null },
  });
  if (!existing) {
    throw new AppError("NOT_FOUND", "Policy not found", 404);
  }

  await prisma.policy.update({
    where: { id: input.policyId },
    data: { deletedAt: new Date() },
  });

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_SOFT_DELETED",
    entityType: "Policy",
    entityId: input.policyId,
    beforeData: { id: input.policyId } as unknown as Prisma.InputJsonValue,
    afterData: { deleted: true } as unknown as Prisma.InputJsonValue,
  });
}
