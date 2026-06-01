import type { InsuredParty, PolicyChart, AdProductVariant } from "@prisma/client";
import {
  CounterType,
  ChartMode,
  PolicyChartKind,
  ChequeStatus,
  PayMethod,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import type { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { normalizeMobile } from "../../domain/phone.js";
import { allocateCounter, formatSvkkId } from "../../services/counter.service.js";
import { createReceiptOnPolicyCreate, resolveReceiptAmount } from "../../services/receipt.service.js";
import { AppError } from "../../errors/app-error.js";
import { writeActivityLog } from "../../services/activity-log.service.js";
import { dispatchPolicyCreated, dispatchPolicyNumberOrDocumentUpdated } from "../../services/notification/notification-dispatch.js";
import {
  createPolicyBodySchema,
  type PolicyMemberReplaceRow,
  type PaymentReplaceRow,
} from "./policy.schemas.js";
import {
  ageOnDate,
  generatePolicyPublicId,
  generateReferenceNo,
} from "./policy-business.js";
import {
  assertUniqueTransactionNumbersInBatch,
  normalizeTxnNumber,
  prepareYearPaymentReplace,
} from "./policy-payment.helpers.js";
import {
  payMethodFromModeString,
  primaryPayMethodFromPayments,
  sanitizePaymentReplaceRow,
  sanitizeYearPaymentSummary,
} from "./policy-payment-sanitize.js";

export type CreatePolicyInput = z.infer<typeof createPolicyBodySchema> & { actorUserId: string };

type PolicyDbClient = Prisma.TransactionClient | typeof prisma;

/** Newest payment first — Transaction 1 on profile = latest entry. */
export const policyYearPaymentsInclude = {
  where: { deletedAt: null },
  orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
  include: { cheque: true },
} satisfies Prisma.PaymentFindManyArgs;

const policyDetailInclude = {
  insuredParty: true,
  policyType: true,
  category: true,
  years: {
    where: { deletedAt: null },
    orderBy: { yearLabel: "desc" as const },
    include: {
      members: { where: { deletedAt: null } },
      payments: policyYearPaymentsInclude,
    },
  },
} satisfies Prisma.PolicyInclude;

/** Keeps `Policy.listVkkPremium` aligned with list preview (latest `yearLabel` row). */
export async function syncPolicyListVkkPremium(db: PolicyDbClient, policyId: string): Promise<void> {
  const latest = await db.policyYear.findFirst({
    where: { policyId, deletedAt: null },
    orderBy: { yearLabel: "desc" },
    select: { vkkPremium: true },
  });
  await db.policy.update({
    where: { id: policyId },
    data: { listVkkPremium: latest?.vkkPremium ?? null },
  });
}

export async function createPolicyWithYear(input: CreatePolicyInput) {
  const mobileRaw = input.mobile?.trim() || input.whatsappNo?.trim() || "";
  const mobile = normalizeMobile(mobileRaw);
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

  const result = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
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
      const generatedSvkkPublicId =
        customSvkk ||
        (input.policyGrouping && input.periodMonthText
          ? await generatePolicyPublicId({
              policyGrouping: input.policyGrouping,
              month: input.periodMonthText,
              tx,
            })
          : null);
      const svkkPublicId = customSvkk
        ? customSvkk
        : generatedSvkkPublicId || formatSvkkId(period, await allocateCounter(CounterType.SVKK_PUBLIC_ID, period, tx));
      try {
        party = await tx.insuredParty.create({
          data: {
            mobile,
            customerId: customerId ?? undefined,
            svkkPublicId,
            name: input.partyName,
            email: input.email ?? undefined,
            pan: input.pan?.toUpperCase() ?? undefined,
            aadhaarNo: input.aadhaarNo ?? undefined,
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
          aadhaarNo: input.aadhaarNo ?? party.aadhaarNo,
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
    const holderAgeAtExpiry = ageOnDate(
      input.dateOfBirth ?? null,
      input.previousEndDate ?? input.policyEnd ?? null,
    );
    const generatedReferenceNo =
      input.referenceNo ||
      (input.policyGrouping && input.periodMonthText && input.periodYearText
        ? await generateReferenceNo({
            policyGrouping: input.policyGrouping,
            month: input.periodMonthText,
            year: input.periodYearText,
            tx,
          })
        : null);

    // policyNo is the *current* policy's number from the insurer; it must NOT
    // fall back to previousPolicyNo, otherwise carry-forward would duplicate the
    // prior policy's number and violate the @@unique([policyNo, policyTypeId])
    // index. A blank policyNo stays NULL (allowed and distinct per row).
    const finalPolicyNo = input.policyNo?.trim() || undefined;

    let policy;
    try {
      policy = await tx.policy.create({
        data: {
          insuredPartyId: party.id,
          policyTypeId: input.policyTypeId,
          categoryId: input.categoryId ?? undefined,
          createdById: input.actorUserId,
          policyNo: finalPolicyNo,
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
        whatsappNo: input.whatsappNo ?? undefined,
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
          holderGender: input.holderGender ?? undefined,
          holderAge: input.holderAge ?? holderAgeAtExpiry ?? undefined,
          personsInsuredCount: personsCount,
          area: input.area ?? undefined,
          referenceNo: generatedReferenceNo ?? undefined,
          mobileSecondary: input.mobileSecondary ?? undefined,
          policyGrouping: input.policyGrouping ?? undefined,
          policyUrl: input.policyUrl ?? undefined,
          policyUrl2: input.policyUrl2 ?? undefined,
          loanStatus: input.loanStatus ?? undefined,
          loanAmount: input.loanAmount != null ? input.loanAmount : undefined,
          previousPolicyNo: input.previousPolicyNo ?? undefined,
          previousEndDate: input.previousEndDate ?? undefined,
          policyGroup: input.policyGroup ?? undefined,
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
    } catch (e) {
      // Unique constraint (e.g. referenceNo, policyNo) - return a clean error for UI.
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
        const target = (e as { meta?: { target?: string | string[] } }).meta?.target;
        const targetStr = Array.isArray(target) ? target.join(",") : String(target ?? "");
        if (targetStr.includes("referenceNo")) {
          throw new AppError(
            "DUPLICATE_REFERENCE_NO",
            `Reference No already exists${generatedReferenceNo ? ` (${generatedReferenceNo})` : ""}. Please generate a new Reference No.`,
            409,
          );
        }
        if (targetStr.includes("policyNo")) {
          throw new AppError(
            "DUPLICATE_POLICY_NO",
            `Policy No "${finalPolicyNo}" already exists for this policy type.`,
            409,
          );
        }
        throw new AppError("CONFLICT", `Duplicate unique field${targetStr ? `: ${targetStr}` : ""}`, 409);
      }
      throw e;
    }

    const paymentBatch = input.payments?.map(sanitizePaymentReplaceRow) ?? [];
    const primaryPayMethod =
      primaryPayMethodFromPayments(paymentBatch) ?? payMethodFromModeString(input.paymentMode);
    const yearPaymentSummary = sanitizeYearPaymentSummary(primaryPayMethod, {
      bankName: input.bankName ?? null,
      bankAccountLast4: input.bankAccountLast4 ?? null,
      utrRef: input.utrRef ?? null,
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
        bankName: yearPaymentSummary.bankName ?? undefined,
        bankAccountLast4: yearPaymentSummary.bankAccountLast4 ?? undefined,
        utrRef: yearPaymentSummary.utrRef ?? undefined,
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
          addOnsAmount:
            m.addOnsAmount != null && m.addOnsAmount !== undefined ? m.addOnsAmount : undefined,
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

    if (paymentBatch.length) {
      await insertPaymentsForYear(tx, year.id, paymentBatch);
    }

    await syncPolicyListVkkPremium(tx, policy.id);

      const receiptAmount = resolveReceiptAmount({
        vkkPremium: input.vkkPremium ?? null,
        amountReceived: input.amountReceived ?? null,
        expectedNetPremium: expected != null ? expected : null,
      });
      await createReceiptOnPolicyCreate(tx, {
        policyId: policy.id,
        policyYearId: year.id,
        amount: receiptAmount,
        paymentMode: input.paymentMode ?? input.initialPayment?.method ?? null,
      });

      return { party, policy, year };
    },
    // Policy creation can involve many sequential writes; allow more than the 5s default.
    { timeout: 20_000, maxWait: 20_000 },
  );

  await writeActivityLog({
    userId: input.actorUserId,
    module: "policy",
    action: "POLICY_CREATED",
    entityType: "Policy",
    entityId: result.policy.id,
    afterData: {
      policyId: result.policy.id,
      yearId: result.year.id,
      policyNo: result.policy.policyNo,
      referenceNo: result.policy.referenceNo,
      svkkPublicId: result.party.svkkPublicId,
      village: result.policy.village,
      holderName: result.party.name,
      yearLabel: result.year.yearLabel,
    } as unknown as Prisma.InputJsonValue,
  });

  dispatchPolicyCreated(result.policy.id, input.actorUserId);

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
          payments: policyYearPaymentsInclude,
          receipts: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });
}

export async function allocateNextPolicyPublicId(input: {
  policyGrouping: string;
  month: string;
}): Promise<string> {
  return prisma.$transaction((tx) =>
    generatePolicyPublicId({
      policyGrouping: input.policyGrouping,
      month: input.month,
      tx,
    }),
  );
}

export async function allocateNextPolicyReferenceNo(input: {
  policyGrouping: string;
  month: string;
  year: string;
}): Promise<string> {
  return prisma.$transaction((tx) =>
    generateReferenceNo({
      policyGrouping: input.policyGrouping,
      month: input.month,
      year: input.year,
      tx,
    }),
  );
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

export type InsuredPartySectionPatch = {
  partyName?: string;
  mobile?: string;
  email?: string | null;
  pan?: string | null;
  aadhaarNo?: string | null;
  dateOfBirth?: Date | null;
  customerId?: string | null;
  svkkPublicId?: string | null;
};

export type PolicySectionPatch = {
  policyTypeId?: string;
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
  whatsappNo?: string | null;
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
  holderGender?: string | null;
  holderAge?: number | null;
  holderJoiningDate?: Date | null;
  holderAddOns?: number | null;
  personsInsuredCount?: number | null;
  area?: string | null;
  referenceNo?: string | null;
  mobileSecondary?: string | null;
  policyGrouping?: string | null;
  policyUrl?: string | null;
  policyUrl2?: string | null;
  loanStatus?: string | null;
  loanAmount?: number | null;
  refundChequeAmount?: number | null;
  refundChequeNo?: string | null;
  refundChequeDate?: Date | null;
  previousPolicyNo?: string | null;
  previousEndDate?: Date | null;
  policyGroup?: string | null;
  cdAccountUsed?: boolean | null;
  cdAmount?: number | null;
  courierStatus?: string | null;
  courierDate?: Date | null;
  courierCompany?: string | null;
  podNumber?: string | null;
  courierAddress?: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
};

export type PolicyYearSectionPatch = {
  yearLabel: string;
  policyChartId?: string;
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
  taxPercent?: number | null;
  taxAmount?: number | null;
  svkkPremium?: number | null;
  netPremium?: number | null;
  vkkCommission?: number | null;
  policyHolderContribution?: number | null;
  premiumOneOrTwoLakh?: number | null;
  gaamMahajanContribution?: number | null;
  differenceAmountPaidByHolder?: number | null;
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

function slimInsuredPartyPatch(p: InsuredPartySectionPatch): InsuredPartySectionPatch {
  return Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined),
  ) as InsuredPartySectionPatch;
}

async function applyInsuredPartyPatch(
  tx: Prisma.TransactionClient,
  partyId: string,
  patch: InsuredPartySectionPatch,
): Promise<boolean> {
  const slim = slimInsuredPartyPatch(patch);
  const data: Prisma.InsuredPartyUpdateInput = {};
  if (slim.partyName !== undefined) data.name = slim.partyName;
  if (slim.email !== undefined) data.email = slim.email === "" ? null : slim.email;
  if (slim.pan !== undefined) data.pan = slim.pan;
  if (slim.aadhaarNo !== undefined) data.aadhaarNo = slim.aadhaarNo;
  if (slim.dateOfBirth !== undefined) data.dateOfBirth = slim.dateOfBirth;
  if (slim.customerId !== undefined) {
    data.customerId = slim.customerId;
  }
  if (slim.svkkPublicId !== undefined && slim.svkkPublicId != null) {
    data.svkkPublicId = slim.svkkPublicId;
  }
  if (slim.mobile !== undefined) {
    data.mobile = normalizeMobile(slim.mobile);
  }
  if (Object.keys(data).length === 0) {
    return false;
  }

  const current = await tx.insuredParty.findUniqueOrThrow({ where: { id: partyId } });
  if (slim.mobile !== undefined) {
    const m = normalizeMobile(slim.mobile);
    if (m !== current.mobile) {
      const clash = await tx.insuredParty.findFirst({ where: { mobile: m, NOT: { id: partyId } } });
      if (clash) {
        throw new AppError("CONFLICT", "Mobile number already in use", 409);
      }
    }
  }
  if (
    slim.svkkPublicId !== undefined &&
    slim.svkkPublicId != null &&
    slim.svkkPublicId !== current.svkkPublicId
  ) {
    const clash = await tx.insuredParty.findFirst({
      where: { svkkPublicId: slim.svkkPublicId, NOT: { id: partyId } },
    });
    if (clash) {
      throw new AppError("CONFLICT", "SVKK ID already in use", 409);
    }
  }
  if (slim.customerId !== undefined && slim.customerId !== current.customerId && slim.customerId) {
    const clash = await tx.insuredParty.findFirst({
      where: { customerId: slim.customerId, NOT: { id: partyId } },
    });
    if (clash) {
      throw new AppError("CONFLICT", "Customer ID already in use", 409);
    }
  }

  await tx.insuredParty.update({ where: { id: partyId }, data });
  return true;
}

async function insertPaymentsForYear(
  tx: Prisma.TransactionClient,
  policyYearId: string,
  payments: PaymentReplaceRow[],
) {
  assertUniqueTransactionNumbersInBatch(payments);
  for (const rawRow of payments) {
    const paymentRow = sanitizePaymentReplaceRow(rawRow);
    const txnNumber = normalizeTxnNumber(paymentRow.transactionNumber ?? null);
    const mappedStatus =
      paymentRow.status === "DISHONOURED"
        ? PaymentStatus.FAILED
        : paymentRow.status === "CLEARED"
          ? PaymentStatus.COMPLETED
          : PaymentStatus.PENDING;
    let chequeId: string | undefined;
    if (paymentRow.method === PayMethod.CHQ && paymentRow.bankName && txnNumber) {
      const ch = await tx.cheque.create({
        data: {
          number: txnNumber,
          bankName: paymentRow.bankName,
          ifsc: paymentRow.ifscCode ?? undefined,
          status:
            paymentRow.status === "DISHONOURED"
              ? ChequeStatus.DISHONOURED
              : paymentRow.status === "CLEARED"
                ? ChequeStatus.CLEARED
                : ChequeStatus.PENDING,
          reason:
            paymentRow.status === "DISHONOURED"
              ? paymentRow.dishonourReason ?? "Dishonoured"
              : undefined,
          accountNo: paymentRow.accountNumber ?? undefined,
          branch: paymentRow.branchName ?? undefined,
          nameAsPerCheque: paymentRow.nameAsPerCheque ?? undefined,
          notOver: paymentRow.notOver ?? undefined,
          chequeDate: paymentRow.transactionDate ?? undefined,
        },
      });
      chequeId = ch.id;
    }
    try {
      await tx.payment.create({
        data: {
          policyYearId,
          amount: paymentRow.amount,
          method: paymentRow.method,
          status: mappedStatus,
          chequeId: chequeId ?? null,
          transactionNumber: txnNumber,
          transactionDate: paymentRow.transactionDate ?? undefined,
          bankName: paymentRow.bankName ?? undefined,
          branchName: paymentRow.branchName ?? undefined,
          accountNumber: paymentRow.accountNumber ?? undefined,
          nameAsPerCheque: paymentRow.nameAsPerCheque ?? undefined,
          ifscCode: paymentRow.ifscCode ?? undefined,
          notOver: paymentRow.notOver ?? undefined,
          dishonourReason: paymentRow.dishonourReason ?? undefined,
          returnCharges: paymentRow.returnCharges ?? undefined,
          otherCharges: paymentRow.otherCharges ?? undefined,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        txnNumber
      ) {
        throw new AppError(
          "VALIDATION",
          `Transaction/cheque number "${txnNumber}" is already used on another policy. Use a unique number.`,
          400,
        );
      }
      throw err;
    }
  }
}

async function replaceYearPayments(
  tx: Prisma.TransactionClient,
  policyId: string,
  yearLabel: string,
  payments: PaymentReplaceRow[],
) {
  const yearRow = await tx.policyYear.findUnique({
    where: { policyId_yearLabel: { policyId, yearLabel } },
  });
  if (!yearRow || yearRow.deletedAt) {
    throw new AppError("YEAR_NOT_FOUND", "Policy year not found for label", 400);
  }
  await prepareYearPaymentReplace(tx, yearRow.id);
  if (payments.length > 0) {
    await insertPaymentsForYear(tx, yearRow.id, payments);
  }
}

async function replaceYearMembers(
  tx: Prisma.TransactionClient,
  policyId: string,
  yearLabel: string,
  members: PolicyMemberReplaceRow[],
) {
  const yearRow = await tx.policyYear.findUnique({
    where: { policyId_yearLabel: { policyId, yearLabel } },
  });
  if (!yearRow || yearRow.deletedAt) {
    throw new AppError("YEAR_NOT_FOUND", "Policy year not found for label", 400);
  }
  await tx.member.updateMany({
    where: { policyYearId: yearRow.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (members.length === 0) {
    return;
  }
  await tx.member.createMany({
    data: members.map((m) => ({
      policyYearId: yearRow.id,
      name: m.name,
      dob: m.dob,
      relationship: m.relationship,
      gender: m.gender,
      riderAmount: m.riderAmount ?? 0,
      sumInsured: m.sumInsured != null && m.sumInsured !== undefined ? m.sumInsured : undefined,
      cumulativeBonus:
        m.cumulativeBonus != null && m.cumulativeBonus !== undefined ? m.cumulativeBonus : undefined,
      dateOfJoining: m.dateOfJoining ?? undefined,
      memberPhone: m.memberPhone ?? undefined,
      addOnsAmount:
        m.addOnsAmount != null && m.addOnsAmount !== undefined ? m.addOnsAmount : undefined,
      basicPremium: m.basicPremium != null && m.basicPremium !== undefined ? m.basicPremium : undefined,
      ageAtEntry: m.ageAtEntry != null && m.ageAtEntry !== undefined ? m.ageAtEntry : undefined,
    })),
  });
}

/**
 * Updates policy and optionally one policy year; writes an activity log with before/after snapshots.
 */
export async function updatePolicySections(input: {
  actorUserId: string;
  policyId: string;
  expectedUpdatedAt?: Date | null;
  policy: PolicySectionPatch;
  year?: PolicyYearSectionPatch;
  insuredParty?: InsuredPartySectionPatch;
  replaceMembers?: { yearLabel: string; members: PolicyMemberReplaceRow[] };
  replacePayments?: { yearLabel: string; payments: PaymentReplaceRow[] };
}) {
  const existing = await prisma.policy.findFirst({
    where: { id: input.policyId, deletedAt: null },
    include: { years: { orderBy: { yearLabel: "desc" } }, insuredParty: true },
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

  if (input.replaceMembers) {
    const y = existing.years.find((x) => x.yearLabel === input.replaceMembers!.yearLabel);
    if (!y) {
      throw new AppError("YEAR_NOT_FOUND", "Policy year not found for label", 400);
    }
  }

  if (input.replacePayments) {
    const y = existing.years.find((x) => x.yearLabel === input.replacePayments!.yearLabel);
    if (!y) {
      throw new AppError("YEAR_NOT_FOUND", "Policy year not found for label", 400);
    }
  }

  const nextPolicyTypeId = input.policy.policyTypeId ?? existing.policyTypeId;
  const policyTypeChanging =
    input.policy.policyTypeId !== undefined && input.policy.policyTypeId !== existing.policyTypeId;
  const chartChanging = input.year?.policyChartId !== undefined;

  if (policyTypeChanging || chartChanging) {
    if (policyTypeChanging && !input.year?.policyChartId) {
      throw new AppError(
        "BAD_REQUEST",
        "policyChartId and yearLabel are required when changing policy type",
        400,
      );
    }
    if (!input.year?.yearLabel) {
      throw new AppError("BAD_REQUEST", "yearLabel is required when changing policy chart", 400);
    }
    const chartId = input.year?.policyChartId;
    if (chartId) {
      const chart = await prisma.policyChart.findUnique({ where: { id: chartId } });
      if (!chart) {
        throw new AppError("CHART_NOT_FOUND", "policyChartId invalid", 400);
      }
      if (chart.policyTypeId !== nextPolicyTypeId) {
        throw new AppError("CHART_TYPE_MISMATCH", "Chart does not belong to policy type", 400);
      }
    }
  }

  const pData = Object.fromEntries(
    Object.entries(input.policy).filter(([, v]) => v !== undefined),
  ) as Prisma.PolicyUpdateInput;
  const hasPolicyFields = Object.keys(pData).length > 0;
  const y = input.year;
  const hasYearValueFields = y
    ? [
        y.policyChartId,
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
        y.taxPercent,
        y.taxAmount,
        y.svkkPremium,
        y.netPremium,
        y.vkkCommission,
        y.policyHolderContribution,
        y.premiumOneOrTwoLakh,
        y.gaamMahajanContribution,
        y.differenceAmountPaidByHolder,
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
  const hasInsuredParty =
    input.insuredParty != null && Object.keys(slimInsuredPartyPatch(input.insuredParty)).length > 0;
  const hasReplaceMembers = Boolean(input.replaceMembers?.members.length);
  const hasReplacePayments = input.replacePayments !== undefined;
  if (
    !hasPolicyFields &&
    (!y || !hasYearValueFields) &&
    !hasInsuredParty &&
    !hasReplaceMembers &&
    !hasReplacePayments
  ) {
    throw new AppError("NO_CHANGES", "No fields to update", 400);
  }

  const beforeSnapshot = { policy: existing, yearLabel: input.year?.yearLabel };

  const yearFieldsUpdated =
    Boolean(input.year) &&
    [
      input.year!.policyChartId,
      input.year!.policyStart,
      input.year!.policyEnd,
      input.year!.sumInsured,
      input.year!.expectedNetPremium,
      input.year!.paymentMode,
      input.year!.paymentType,
      input.year!.amountReceived,
      input.year!.bankName,
      input.year!.bankAccountLast4,
      input.year!.utrRef,
      input.year!.yearRemarks,
      input.year!.taxPercent,
      input.year!.taxAmount,
      input.year!.svkkPremium,
      input.year!.netPremium,
      input.year!.vkkCommission,
      input.year!.policyHolderContribution,
      input.year!.premiumOneOrTwoLakh,
      input.year!.gaamMahajanContribution,
      input.year!.differenceAmountPaidByHolder,
      input.year!.vkkPremium,
      input.year!.grossPremium,
      input.year!.commissionAmount,
      input.year!.twoLacFloater,
      input.year!.yearPolicyHolderPremium,
      input.year!.gaamMahajanVkk,
      input.year!.excessShortAmount,
      input.year!.diffPaidByHolder,
      input.year!.holderCumulativeBonus,
      input.year!.holderJoiningYear,
      input.year!.holderBasicPremium,
    ].some((v) => v !== undefined);

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      let bumpVersionWithoutPolicyRow = false;

      if (hasInsuredParty && input.insuredParty) {
        const did = await applyInsuredPartyPatch(tx, existing.insuredPartyId, input.insuredParty);
        if (did) {
          bumpVersionWithoutPolicyRow = true;
        }
      }

      if (hasPolicyFields) {
        await tx.policy.update({
          where: { id: input.policyId },
          data: { ...pData, version: { increment: 1 } },
        });
      }

      if (input.year) {
        const yv = input.year;
        let bankName = yv.bankName;
        let bankAccountLast4 = yv.bankAccountLast4;
        let utrRef = yv.utrRef;
        if (
          yv.paymentMode !== undefined ||
          yv.bankName !== undefined ||
          yv.bankAccountLast4 !== undefined ||
          yv.utrRef !== undefined
        ) {
          const summary = sanitizeYearPaymentSummary(payMethodFromModeString(yv.paymentMode), {
            bankName: yv.bankName ?? null,
            bankAccountLast4: yv.bankAccountLast4 ?? null,
            utrRef: yv.utrRef ?? null,
          });
          if (yv.bankName !== undefined) bankName = summary.bankName;
          if (yv.bankAccountLast4 !== undefined) bankAccountLast4 = summary.bankAccountLast4;
          if (yv.utrRef !== undefined) utrRef = summary.utrRef;
        }
        const yearData: Prisma.PolicyYearUpdateInput = {
          ...(yv.policyChartId !== undefined ? { policyChartId: yv.policyChartId } : {}),
          ...(yv.policyStart !== undefined ? { policyStart: yv.policyStart } : {}),
          ...(yv.policyEnd !== undefined ? { policyEnd: yv.policyEnd } : {}),
          ...(yv.sumInsured !== undefined ? { sumInsured: yv.sumInsured } : {}),
          ...(yv.expectedNetPremium !== undefined ? { expectedNetPremium: yv.expectedNetPremium } : {}),
          ...(yv.paymentMode !== undefined ? { paymentMode: yv.paymentMode } : {}),
          ...(yv.paymentType !== undefined ? { paymentType: yv.paymentType } : {}),
          ...(yv.amountReceived !== undefined ? { amountReceived: yv.amountReceived } : {}),
          ...(yv.bankName !== undefined ? { bankName } : {}),
          ...(yv.bankAccountLast4 !== undefined ? { bankAccountLast4 } : {}),
          ...(yv.utrRef !== undefined ? { utrRef } : {}),
          ...(yv.yearRemarks !== undefined ? { yearRemarks: yv.yearRemarks } : {}),
          ...(yv.vkkPremium !== undefined ? { vkkPremium: yv.vkkPremium } : {}),
          ...(yv.grossPremium !== undefined ? { grossPremium: yv.grossPremium } : {}),
          ...(yv.commissionAmount !== undefined ? { commissionAmount: yv.commissionAmount } : {}),
          ...(yv.twoLacFloater !== undefined ? { twoLacFloater: yv.twoLacFloater } : {}),
          ...(yv.yearPolicyHolderPremium !== undefined
            ? { yearPolicyHolderPremium: yv.yearPolicyHolderPremium }
            : {}),
          ...(yv.gaamMahajanVkk !== undefined ? { gaamMahajanVkk: yv.gaamMahajanVkk } : {}),
          ...(yv.excessShortAmount !== undefined ? { excessShortAmount: yv.excessShortAmount } : {}),
          ...(yv.diffPaidByHolder !== undefined ? { diffPaidByHolder: yv.diffPaidByHolder } : {}),
          ...(yv.holderCumulativeBonus !== undefined
            ? { holderCumulativeBonus: yv.holderCumulativeBonus }
            : {}),
          ...(yv.holderJoiningYear !== undefined ? { holderJoiningYear: yv.holderJoiningYear } : {}),
          ...(yv.holderBasicPremium !== undefined ? { holderBasicPremium: yv.holderBasicPremium } : {}),
        };
        if (Object.keys(yearData).length > 0) {
          await tx.policyYear.update({
            where: {
              policyId_yearLabel: { policyId: input.policyId, yearLabel: yv.yearLabel },
            },
            data: yearData,
          });
          if (!hasPolicyFields) {
            bumpVersionWithoutPolicyRow = true;
          }
        }
      }

      if (input.replaceMembers) {
        await replaceYearMembers(
          tx,
          input.policyId,
          input.replaceMembers.yearLabel,
          input.replaceMembers.members,
        );
        if (!hasPolicyFields) {
          bumpVersionWithoutPolicyRow = true;
        }
      }

      if (input.replacePayments) {
        await replaceYearPayments(
          tx,
          input.policyId,
          input.replacePayments.yearLabel,
          input.replacePayments.payments,
        );
        if (!hasPolicyFields) {
          bumpVersionWithoutPolicyRow = true;
        }
      }

      if (bumpVersionWithoutPolicyRow && !hasPolicyFields) {
        await tx.policy.update({
          where: { id: input.policyId },
          data: { version: { increment: 1 } },
        });
      }
    },
    // Remote MySQL (Railway proxy): keep the interactive tx short — reads/sync run after commit.
    { timeout: 60_000, maxWait: 30_000 },
  );

  if (yearFieldsUpdated) {
    await syncPolicyListVkkPremium(prisma, input.policyId);
  }

  const updated = await prisma.policy.findUniqueOrThrow({
    where: { id: input.policyId },
    include: policyDetailInclude,
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

  dispatchPolicyNumberOrDocumentUpdated(
    input.policyId,
    input.actorUserId,
    {
      policyNo: existing.policyNo,
      policyUrl: existing.policyUrl,
      policyUrl2: existing.policyUrl2,
    },
    {
      policyNo: updated.policyNo,
      policyUrl: updated.policyUrl,
      policyUrl2: updated.policyUrl2,
    },
  );

  return updated;
}

/**
 * Soft-deletes a policy; related policy years and members are hidden by `deletedAt` on the parent in reads.
 */
export async function softDeletePolicy(input: { actorUserId: string; policyId: string }) {
  const existing = await prisma.policy.findFirst({
    where: { id: input.policyId, deletedAt: null },
    include: { insuredParty: { select: { name: true } } },
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
    beforeData: {
      policyNo: existing.policyNo,
      referenceNo: existing.referenceNo,
      village: existing.village,
      holderName: existing.insuredParty.name,
    } as unknown as Prisma.InputJsonValue,
    afterData: { deleted: true } as unknown as Prisma.InputJsonValue,
  });
}
