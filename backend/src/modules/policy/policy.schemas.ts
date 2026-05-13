import { z } from "zod";
import {
  AdProductVariant,
  ChequeStatus,
  PayMethod,
} from "@prisma/client";

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const optionalPan = z
  .preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.string().regex(panRegex, "Invalid PAN format").optional(),
  )
  .optional();

export const policyHolderSectionSchema = z.object({
  addressLine1: z.string().max(256).optional().nullable(),
  addressLine2: z.string().max(256).optional().nullable(),
  addressLine3: z.string().max(256).optional().nullable(),
  addressLine4: z.string().max(256).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  contactPhone: z.string().max(20).optional().nullable(),
  whatsappNo: z.string().max(20).optional().nullable(),
  nomineeName: z.string().max(200).optional().nullable(),
  nomineeRelation: z.string().max(100).optional().nullable(),
  loanRef: z.string().max(120).optional().nullable(),
  courierTracking: z.string().max(120).optional().nullable(),
  remarks: z.string().max(8000).optional().nullable(),
});

const paymentModeEnum = z.enum(["NEFT", "UPI", "CHQ", "CASH"]);
const paymentTypeEnum = z.enum(["Premium", "Split", "Dishonour"]);

export const policyYearSectionSchema = z.object({
  paymentMode: paymentModeEnum.optional().nullable(),
  paymentType: paymentTypeEnum.optional().nullable(),
  amountReceived: z.number().nonnegative().optional().nullable(),
  bankName: z.string().max(200).optional().nullable(),
  bankAccountLast4: z.string().max(4).optional().nullable(),
  utrRef: z.string().max(100).optional().nullable(),
  yearRemarks: z.string().max(8000).optional().nullable(),
  taxPercent: z.number().nonnegative().optional().nullable(),
  taxAmount: z.number().nonnegative().optional().nullable(),
  svkkPremium: z.number().nonnegative().optional().nullable(),
  netPremium: z.number().nonnegative().optional().nullable(),
  vkkCommission: z.number().nonnegative().optional().nullable(),
  policyHolderContribution: z.number().nonnegative().optional().nullable(),
  premiumOneOrTwoLakh: z.number().nonnegative().optional().nullable(),
  // Can be negative (reconciliation / adjustment).
  gaamMahajanContribution: z.number().optional().nullable(),
  differenceAmountPaidByHolder: z.number().optional().nullable(),
});

const initialPaymentSchema = z
  .object({
    amount: z.number().nonnegative(),
    method: z.nativeEnum(PayMethod),
    cheque: z
      .object({
        number: z.string().min(1).max(64),
        bankName: z.string().min(1).max(200),
        ifsc: z.string().max(20).optional().nullable(),
        status: z.nativeEnum(ChequeStatus).optional(),
        reason: z.string().max(8000).optional().nullable(),
        accountNo: z.string().max(64).optional().nullable(),
        branch: z.string().max(200).optional().nullable(),
        nameAsPerCheque: z.string().max(200).optional().nullable(),
        notOver: z.string().max(50).optional().nullable(),
        chequeDate: z.coerce.date().optional().nullable(),
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.method === "CHQ" && !d.cheque) {
      ctx.addIssue({ code: "custom", message: "cheque is required when method is CHQ" });
    }
    if (d.cheque?.status === "DISHONOURED" && !d.cheque?.reason) {
      ctx.addIssue({ code: "custom", message: "reason is required when cheque status is DISHONOURED" });
    }
  });

const paymentEntrySchema = z.object({
  amount: z.number().nonnegative(),
  method: z.nativeEnum(PayMethod),
  status: z.nativeEnum(ChequeStatus).optional().nullable(),
  transactionNumber: z.string().max(120).optional().nullable(),
  transactionDate: z.coerce.date().optional().nullable(),
  bankName: z.string().max(200).optional().nullable(),
  branchName: z.string().max(200).optional().nullable(),
  accountNumber: z.string().max(64).optional().nullable(),
  nameAsPerCheque: z.string().max(200).optional().nullable(),
  ifscCode: z.string().max(20).optional().nullable(),
  notOver: z.string().max(50).optional().nullable(),
  dishonourReason: z.string().max(8000).optional().nullable(),
  returnCharges: z.number().nonnegative().optional().nullable(),
  otherCharges: z.number().nonnegative().optional().nullable(),
});

export const memberCreateSchema = z.object({
  name: z.string().min(1),
  dob: z.coerce.date(),
  relationship: z.string().min(1),
  gender: z.string().min(1).default("M"),
  riderAmount: z.number().nonnegative().optional(),
  sumInsured: z.number().nonnegative().nullish().optional(),
  cumulativeBonus: z.number().nonnegative().nullish().optional(),
  dateOfJoining: z.coerce.date().nullish().optional(),
  memberPhone: z.string().max(20).nullish().optional(),
  addOnsAmount: z.number().nonnegative().nullish().optional(),
  basicPremium: z.number().nonnegative().nullish().optional(),
  ageAtEntry: z.coerce.number().int().min(0).max(150).nullish().optional(),
});

export type PolicyMemberReplaceRow = z.infer<typeof memberCreateSchema>;

const adPolicyExtraSchema = z.object({
  customerId: z.string().max(64).optional().nullable(),
  /// When set, used instead of an auto-allocated SVKK public id
  svkkPublicId: z.string().min(1).max(64).optional().nullable(),
  adProductVariant: z.nativeEnum(AdProductVariant).optional().nullable(),
  insuranceCompany: z.string().max(200).optional().nullable(),
  tpa: z.string().max(200).optional().nullable(),
  categoryText: z.string().max(200).optional().nullable(),
  holderRelationship: z.string().max(100).optional().nullable(),
  holderGender: z.string().max(16).optional().nullable(),
  holderAge: z.coerce.number().int().min(0).max(150).nullish().optional(),
  holderJoiningDate: z.coerce.date().nullish().optional(),
  holderAddOns: z.number().nonnegative().nullish().optional(),
  personsInsuredCount: z.coerce.number().int().min(0).nullish().optional(),
  area: z.string().max(200).optional().nullable(),
  referenceNo: z.string().max(100).optional().nullable(),
  mobileSecondary: z.string().max(20).optional().nullable(),
  policyGrouping: z.string().trim().max(64).optional().nullable(),
  policyUrl: z.string().max(5000).optional().nullable(),
  policyUrl2: z.string().max(500).optional().nullable(),
  loanStatus: z.string().max(10).optional().nullable(),
  loanAmount: z.number().nonnegative().nullish().optional(),
  refundChequeAmount: z.number().nonnegative().nullish().optional(),
  refundChequeNo: z.string().max(64).optional().nullable(),
  refundChequeDate: z.coerce.date().nullish().optional(),
  previousPolicyNo: z.string().max(100).optional().nullable(),
  previousEndDate: z.coerce.date().nullish().optional(),
  policyGroup: z.string().max(32).optional().nullable(),
  cdAccountUsed: z.boolean().optional().nullable(),
  cdAmount: z.number().nonnegative().nullish().optional(),
  courierStatus: z.string().max(10).optional().nullable(),
  courierDate: z.coerce.date().nullish().optional(),
  courierCompany: z.string().max(200).optional().nullable(),
  podNumber: z.string().max(100).optional().nullable(),
  courierAddress: z.string().max(4000).optional().nullable(),
  periodYearText: z.string().max(20).optional().nullable(),
  periodMonthText: z.string().max(20).optional().nullable(),
  holderCumulativeBonus: z.number().nonnegative().nullish().optional(),
  holderJoiningYear: z.string().max(20).optional().nullable(),
  holderBasicPremium: z.number().nonnegative().nullish().optional(),
  vkkPremium: z.number().nonnegative().nullish().optional(),
  grossPremium: z.number().nonnegative().nullish().optional(),
  commissionAmount: z.number().nonnegative().nullish().optional(),
  twoLacFloater: z.number().nonnegative().nullish().optional(),
  yearPolicyHolderPremium: z.number().nonnegative().nullish().optional(),
  // Can be negative (short/excess reconciliation adjustments).
  gaamMahajanVkk: z.number().nullish().optional(),
  excessShortAmount: z.number().nullish().optional(),
  diffPaidByHolder: z.number().nonnegative().nullish().optional(),
});

/** Create policy: year-level financial fields apply to the first `PolicyYear`. */
export const createPolicyBodySchema = z
  .object({
    mobile: z.string().optional().nullable(),
    partyName: z.string().min(1),
    email: z.string().email(),
    pan: optionalPan,
    aadhaarNo: z.string().max(12).optional().nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    policyTypeId: z.string().min(1),
    categoryId: z.preprocess(
      (v) => (v === null || v === "" || v === undefined ? undefined : v),
      z.string().min(1).optional(),
    ).optional(),
    yearLabel: z.string().min(1),
    policyChartId: z.string().min(1),
    policyStart: z.coerce.date().optional().nullable(),
    policyEnd: z.coerce.date().optional().nullable(),
    sumInsured: z.number().positive(),
    expectedNetPremium: z.number().nonnegative().optional().nullable(),
    policyNo: z.string().optional().nullable(),
    village: z.string().min(1),
    pod: z.string().optional().nullable(),
    members: z.array(memberCreateSchema).min(0),
    initialPayment: initialPaymentSchema.optional(),
    payments: z.array(paymentEntrySchema).optional(),
  })
  .merge(policyHolderSectionSchema)
  .merge(policyYearSectionSchema)
  .merge(adPolicyExtraSchema)
  .extend({
    whatsappNo: z.string().min(1).max(20),
    area: z.string().min(1).max(200),
    personsInsuredCount: z.coerce.number().int().min(1),
    periodMonthText: z.string().min(1).max(20),
  });

export const yearValueKeys = [
  "policyStart",
  "policyEnd",
  "sumInsured",
  "expectedNetPremium",
  "paymentMode",
  "paymentType",
  "amountReceived",
  "bankName",
  "bankAccountLast4",
  "utrRef",
  "yearRemarks",
  "taxPercent",
  "taxAmount",
  "svkkPremium",
  "netPremium",
  "vkkCommission",
  "policyHolderContribution",
  "premiumOneOrTwoLakh",
  "gaamMahajanContribution",
  "differenceAmountPaidByHolder",
  "vkkPremium",
  "grossPremium",
  "commissionAmount",
  "twoLacFloater",
  "yearPolicyHolderPremium",
  "gaamMahajanVkk",
  "excessShortAmount",
  "diffPaidByHolder",
  "holderCumulativeBonus",
  "holderJoiningYear",
  "holderBasicPremium",
] as const;

const insuredPartyPatchSchema = z.object({
  partyName: z.string().min(1).max(200).optional(),
  mobile: z.string().min(1).max(20).optional(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  pan: z
    .preprocess(
      (v) => (v === null || v === "" || v === undefined ? null : v),
      z.union([z.string().regex(panRegex), z.null()]).optional(),
    )
    .optional(),
  aadhaarNo: z.string().max(12).optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  customerId: z.string().max(64).optional().nullable(),
  svkkPublicId: z.string().min(1).max(64).optional().nullable(),
});

/** Partial update: any subset of policy + optional one year (requires `yearLabel` when any year field is set). */
export const patchPolicyBodySchema = z
  .object({
    /// Optimistic concurrency: last known `Policy.updatedAt` (ISO) from `GET` before edit
    expectedUpdatedAt: z.coerce.date().optional(),
    policyNo: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    village: z.string().optional().nullable(),
    pod: z.string().optional().nullable(),
    yearLabel: z.string().optional(),
    policyStart: z.coerce.date().optional().nullable(),
    policyEnd: z.coerce.date().optional().nullable(),
    sumInsured: z.number().positive().optional().nullable(),
    expectedNetPremium: z.number().nonnegative().optional().nullable(),
    insuredParty: insuredPartyPatchSchema.optional(),
    members: z.array(memberCreateSchema).min(0).optional(),
    payments: z.array(paymentEntrySchema).optional(),
  })
  .merge(policyHolderSectionSchema)
  .merge(policyYearSectionSchema)
  .merge(adPolicyExtraSchema.partial())
  .superRefine((data, ctx) => {
    const hasYearField = yearValueKeys.some(
      (k) => data[k as keyof typeof data] !== undefined,
    );
    if (hasYearField && !data.yearLabel) {
      ctx.addIssue({ code: "custom", message: "yearLabel is required when updating a policy year" });
    }
    if (data.members != null && !data.yearLabel) {
      ctx.addIssue({ code: "custom", message: "yearLabel is required when replacing members" });
    }
  });
