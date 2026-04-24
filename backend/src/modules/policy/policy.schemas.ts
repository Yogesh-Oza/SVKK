import { z } from "zod";

export const policyHolderSectionSchema = z.object({
  addressLine1: z.string().max(256).optional().nullable(),
  addressLine2: z.string().max(256).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  pincode: z.string().max(20).optional().nullable(),
  contactPhone: z.string().max(20).optional().nullable(),
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
});

/** Create policy: year-level financial fields apply to the first `PolicyYear`. */
export const createPolicyBodySchema = z
  .object({
    mobile: z.string().min(1),
    partyName: z.string().min(1),
    email: z.string().email().optional().nullable(),
    policyTypeId: z.string().min(1),
    yearLabel: z.string().min(1),
    policyChartId: z.string().min(1),
    policyStart: z.coerce.date().optional().nullable(),
    policyEnd: z.coerce.date().optional().nullable(),
    sumInsured: z.number().positive(),
    policyNo: z.string().optional().nullable(),
    village: z.string().optional().nullable(),
    pod: z.string().optional().nullable(),
    members: z
      .array(
        z.object({
          name: z.string().min(1),
          dob: z.coerce.date(),
          relationship: z.string().min(1),
          gender: z.string().min(1),
          riderAmount: z.number().nonnegative().optional(),
        }),
      )
      .min(1),
  })
  .merge(policyHolderSectionSchema)
  .merge(policyYearSectionSchema);

const yearValueKeys = [
  "policyStart",
  "policyEnd",
  "sumInsured",
  "paymentMode",
  "paymentType",
  "amountReceived",
  "bankName",
  "bankAccountLast4",
  "utrRef",
  "yearRemarks",
] as const;

/** Partial update: any subset of policy + optional one year (requires `yearLabel` when any year field is set). */
export const patchPolicyBodySchema = z
  .object({
    policyNo: z.string().optional().nullable(),
    village: z.string().optional().nullable(),
    pod: z.string().optional().nullable(),
    yearLabel: z.string().optional(),
    policyStart: z.coerce.date().optional().nullable(),
    policyEnd: z.coerce.date().optional().nullable(),
    sumInsured: z.number().positive().optional().nullable(),
  })
  .merge(policyHolderSectionSchema)
  .merge(policyYearSectionSchema)
  .superRefine((data, ctx) => {
    const hasYearField = yearValueKeys.some(
      (k) => data[k as keyof typeof data] !== undefined,
    );
    if (hasYearField && !data.yearLabel) {
      ctx.addIssue({ code: "custom", message: "yearLabel is required when updating a policy year" });
    }
  });
