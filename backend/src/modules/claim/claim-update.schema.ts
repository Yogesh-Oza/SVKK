import { ClaimStatus } from "@prisma/client";
import { z } from "zod";
import { parseClaimDate, parseYesNo } from "./claim-csv-normalize.js";

const optionalText = (max: number) => z.string().max(max).optional().nullable();

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || String(v).trim() === "") return null;
    return parseClaimDate(String(v));
  });

const optionalAmount = z.number().nonnegative().optional().nullable();

const optionalBool = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    if (typeof v === "boolean") return v;
    return parseYesNo(String(v));
  });

/** Validated body for PATCH /claims/:id (full claim detail edit). */
export const claimUpdateBodySchema = z.object({
  svkkPublicId: z.string().max(64).optional(),
  policyYear: z.string().max(20).optional(),
  patientName: optionalText(200),
  patientAge: z.number().int().min(0).max(150).optional().nullable(),
  patientRelation: optionalText(100),
  patientGender: optionalText(16),
  status: z.nativeEnum(ClaimStatus).optional(),
  statusText: optionalText(200),
  claimType: optionalText(100),
  claimAmount: optionalAmount,
  approvedAmount: optionalAmount,
  deductionAmount: optionalAmount,
  deductionDetails: optionalText(10_000),
  balanceSumInsured: optionalAmount,
  village: optionalText(200),
  tpaName: optionalText(200),
  insuranceCompany: optionalText(200),
  doBranch: optionalText(200),
  policyHolderName: optionalText(200),
  policyTypeText: optionalText(200),
  policyStartDate: optionalDate,
  policyEndDate: optionalDate,
  sumInsured: optionalAmount,
  claimReceivedDate: optionalDate,
  informationRaisedDate: optionalDate,
  informationReceivedDate: optionalDate,
  hospitalName: optionalText(300),
  hospitalArea: optionalText(200),
  networkType: optionalText(50),
  hospitalInPpn: optionalBool,
  admissionDate: optionalDate,
  dischargeDate: optionalDate,
  illness: optionalText(10_000),
  deniedReasons: optionalText(10_000),
  roomCategory: optionalText(100),
  paymentDetails: optionalText(10_000),
});

export type ClaimUpdateBody = z.infer<typeof claimUpdateBodySchema>;
