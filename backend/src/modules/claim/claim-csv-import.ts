import {
  ClaimLinkMode,
  ClaimPolicyMatchStatus,
  ClaimStatus,
  CsvImportMode,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import type { PolicyTypeCache } from "../policy/policy-csv-resolve.js";
import {
  assertClaimInGeoScope,
  type GeoScope,
} from "../../services/mis-scope.service.js";
import { getClaimField } from "./claim-csv-parse.js";
import {
  parseClaimAge,
  parseClaimDate,
  parseClaimDecimal,
  parseYesNo,
  yearLabelFromDate,
} from "./claim-csv-normalize.js";
import { matchPolicyForClaim, type ClaimMatchInput } from "./claim-policy-match.js";
import { mapStatusTextToEnum } from "./claim-status-map.js";
import type { ClaimCsvRowError } from "./claim-csv-errors.js";
import type { ClaimImportMatchStats } from "./claim-csv-preview.js";
import { shouldRejectDuplicateClaim } from "./claim-duplicate.js";

export type ParsedClaimRow = {
  rowNumber: number;
  claimNo: string;
  tpaName: string | null;
  insuranceCompany: string | null;
  doBranch: string | null;
  policyNo: string;
  policyHolderName: string;
  policyTypeText: string;
  policyGroupingText: string | null;
  /** CSV SVKK ID snapshot (used for matching + unlinked persistence). */
  svkkPublicIdCsv: string;
  policyStartDate: Date | null;
  policyEndDate: Date | null;
  patientName: string | null;
  patientAge: number | null;
  patientRelation: string | null;
  patientGender: string | null;
  mdId: string | null;
  categoryText: string | null;
  claimType: string | null;
  actualLodgeType: string | null;
  treatmentType: string | null;
  treatmentProcedure: string | null;
  diseaseCategory: string | null;
  statusText: string | null;
  status: ClaimStatus;
  claimReceivedDate: Date | null;
  informationRaisedDate: Date | null;
  informationReceivedDate: Date | null;
  hospitalName: string | null;
  hospitalArea: string | null;
  networkType: string | null;
  hospitalInPpn: boolean | null;
  admissionDate: Date | null;
  dischargeDate: Date | null;
  lodgeDate: Date | null;
  claimAmount: number | null;
  reportedLodgeAmount: number | null;
  approvedAmount: number | null;
  deductionAmount: number | null;
  discountAmount: number | null;
  deductionDetails: string | null;
  remark: string | null;
  sumInsured: number | null;
  balanceSumInsured: number | null;
  illness: string | null;
  deniedReasons: string | null;
  roomCategory: string | null;
  paymentDetails: string | null;
  paymentInFavourOf: string | null;
  paymentDate: Date | null;
  prsCrsDate: Date | null;
  matchInput: ClaimMatchInput;
};

/** Parse a CSV row map into a structured claim row. */
export function parseClaimRow(
  rowNumber: number,
  map: Map<string, string>,
  statusMap: Record<string, ClaimStatus>,
): ParsedClaimRow {
  const claimNo = getClaimField(
    map,
    "Claim Number",
    "Claim Number.",
    "Claim No",
    "Claim No.",
    "Claim #",
    "Claim_Number",
  );
  const policyStartDate = parseClaimDate(getClaimField(map, "Policy Start Date"));
  const policyEndDate = parseClaimDate(getClaimField(map, "Policy End Date"));
  const statusText = getClaimField(map, "Status") || null;
  const policyNo = getClaimField(map, "Policy Number");
  const policyHolderName = getClaimField(map, "Policy Holder Name");
  const policyTypeText = getClaimField(map, "Policy Type");
  const policyGroupingText = getClaimField(map, "Policy Grouping") || null;
  const svkkFromCsv = getClaimField(map, "SVKK ID");
  const sumInsured = parseClaimDecimal(getClaimField(map, "Sum_Insured", "Sum Insured"));
  const insuranceCompany =
    getClaimField(map, "Insurance_Company", "Insurance Company name") || null;
  const admissionDate = parseClaimDate(getClaimField(map, "Date Of Admission"));
  const lodgeDate = parseClaimDate(getClaimField(map, "Claim Lodge Date"));
  const claimReceivedDate = parseClaimDate(getClaimField(map, "Claim Received Date"));

  return {
    rowNumber,
    claimNo,
    tpaName: getClaimField(map, "TPA Name") || null,
    insuranceCompany,
    doBranch: getClaimField(map, "D.O. Branch") || null,
    policyNo,
    policyHolderName,
    policyTypeText,
    policyGroupingText,
    svkkPublicIdCsv: svkkFromCsv,
    policyStartDate,
    policyEndDate,
    patientName: getClaimField(map, "Patient Name") || null,
    patientAge: parseClaimAge(getClaimField(map, "Patient Age")),
    patientRelation: getClaimField(map, "Relation") || null,
    patientGender: getClaimField(map, "Gender") || null,
    mdId: getClaimField(map, "MD ID") || null,
    categoryText: getClaimField(map, "Category") || null,
    claimType: getClaimField(map, "Claim Type") || null,
    actualLodgeType: getClaimField(map, "Actual Lodge Type") || null,
    treatmentType: getClaimField(map, "Treatment Type") || null,
    treatmentProcedure: getClaimField(map, "Treatment Procedure") || null,
    diseaseCategory: getClaimField(map, "Disease Category") || null,
    statusText,
    status: mapStatusTextToEnum(statusText ?? "", statusMap),
    claimReceivedDate,
    informationRaisedDate: parseClaimDate(getClaimField(map, "Information Raised Date")),
    informationReceivedDate: parseClaimDate(getClaimField(map, "Information Received Date")),
    hospitalName: getClaimField(map, "Hospital Name") || null,
    hospitalArea: getClaimField(map, "Area") || null,
    networkType: getClaimField(map, "NETWORK/NON-NETWORK") || null,
    hospitalInPpn: parseYesNo(getClaimField(map, "HOSPITAL IS IN PPN Y/N")),
    admissionDate,
    dischargeDate: parseClaimDate(getClaimField(map, "Date Of discharge", "Date Of Discharge")),
    lodgeDate,
    claimAmount: parseClaimDecimal(getClaimField(map, "Claim Amount")),
    reportedLodgeAmount: parseClaimDecimal(getClaimField(map, "Reported Lodge Amt")),
    approvedAmount: parseClaimDecimal(getClaimField(map, "Approved Amt", "Approved Amount")),
    deductionAmount: parseClaimDecimal(getClaimField(map, "Deduction Amount")),
    discountAmount: parseClaimDecimal(getClaimField(map, "Discount Amt")),
    deductionDetails: getClaimField(map, "Deduction Details") || null,
    remark: getClaimField(map, "Remark") || null,
    sumInsured,
    balanceSumInsured: parseClaimDecimal(getClaimField(map, "Balance Sum Insured")),
    illness: getClaimField(map, "Illness") || null,
    deniedReasons: getClaimField(map, "Denied Reasons") || null,
    roomCategory: getClaimField(map, "RoomCategory", "Room Category") || null,
    paymentDetails: getClaimField(map, "Cheque No/ Payment Details") || null,
    paymentInFavourOf: getClaimField(map, "Payment In Favour Of") || null,
    paymentDate: parseClaimDate(getClaimField(map, "Payment Date")),
    prsCrsDate: parseClaimDate(getClaimField(map, "PRS/CRS Date")),
    matchInput: {
      policyNo,
      svkkPublicId: svkkFromCsv,
      policyHolderName,
      policyTypeText,
      policyStartDate,
      policyEndDate,
      sumInsured,
      insuranceCompany,
      admissionDate,
      lodgeDate,
      claimReceivedDate,
    },
  };
}

/** Validate required fields on a parsed row. */
export function validateClaimRow(row: ParsedClaimRow): string | null {
  if (!row.claimNo.trim()) return "Claim Number is required";
  return null;
}

function claimDataFromRow(
  row: ParsedClaimRow,
  match: Awaited<ReturnType<typeof matchPolicyForClaim>>,
  importJobId: string | undefined,
  createdById: string,
): Prisma.ClaimCreateInput {
  const village = match.village ?? row.hospitalArea;
  const policyYear =
    match.yearLabel ?? yearLabelFromDate(row.policyStartDate);

  return {
    claimNo: row.claimNo,
    // Linked: party SVKK; unlinked: preserve CSV SVKK snapshot (never invent a link).
    svkkPublicId: match.svkkPublicId ?? row.svkkPublicIdCsv.trim() ?? "",
    policyYear,
    patientName: row.patientName,
    patientAge: row.patientAge,
    patientRelation: row.patientRelation,
    patientGender: row.patientGender,
    mdId: row.mdId,
    categoryText: row.categoryText,
    status: row.status,
    statusText: row.statusText,
    claimType: row.claimType,
    actualLodgeType: row.actualLodgeType,
    treatmentType: row.treatmentType,
    treatmentProcedure: row.treatmentProcedure,
    diseaseCategory: row.diseaseCategory,
    claimAmount: row.claimAmount,
    reportedLodgeAmount: row.reportedLodgeAmount,
    approvedAmount: row.approvedAmount,
    deductionAmount: row.deductionAmount,
    discountAmount: row.discountAmount,
    deductionDetails: row.deductionDetails,
    remark: row.remark,
    balanceSumInsured: row.balanceSumInsured,
    village,
    tpaName: row.tpaName,
    insuranceCompany: row.insuranceCompany,
    doBranch: row.doBranch,
    policyHolderName: row.policyHolderName,
    policyTypeText: row.policyTypeText,
    policyNoText: row.policyNo.trim() || null,
    policyGroupingText: row.policyGroupingText,
    policyStartDate: row.policyStartDate,
    policyEndDate: row.policyEndDate,
    sumInsured: row.sumInsured,
    claimReceivedDate: row.claimReceivedDate,
    informationRaisedDate: row.informationRaisedDate,
    informationReceivedDate: row.informationReceivedDate,
    hospitalName: row.hospitalName,
    hospitalArea: row.hospitalArea,
    networkType: row.networkType,
    hospitalInPpn: row.hospitalInPpn,
    admissionDate: row.admissionDate,
    dischargeDate: row.dischargeDate,
    lodgeDate: row.lodgeDate,
    illness: row.illness,
    deniedReasons: row.deniedReasons,
    roomCategory: row.roomCategory,
    paymentDetails: row.paymentDetails,
    paymentInFavourOf: row.paymentInFavourOf,
    paymentDate: row.paymentDate,
    prsCrsDate: row.prsCrsDate,
    matchStatus: match.matchStatus,
    verificationWarnings:
      match.verificationWarnings.length > 0 ? match.verificationWarnings : undefined,
    createdBy: { connect: { id: createdById } },
    ...(match.insuredPartyId
      ? { insuredParty: { connect: { id: match.insuredPartyId } } }
      : {}),
    ...(match.policyId ? { policy: { connect: { id: match.policyId } } } : {}),
    ...(match.policyYearId ? { policyYearRow: { connect: { id: match.policyYearId } } } : {}),
    ...(importJobId ? { importJob: { connect: { id: importJobId } } } : {}),
  };
}

function shouldRejectMatch(
  matchStatus: ClaimPolicyMatchStatus,
  linkMode: ClaimLinkMode,
): boolean {
  if (matchStatus === ClaimPolicyMatchStatus.CONFLICT) return true;
  if (matchStatus === ClaimPolicyMatchStatus.UNLINKED && linkMode === ClaimLinkMode.STRICT_MATCH) {
    return true;
  }
  return false;
}

function matchErrorMessage(
  matchStatus: ClaimPolicyMatchStatus,
  matchReason?: string,
  detail?: string,
): string {
  if (matchReason) return matchReason;
  if (matchStatus === ClaimPolicyMatchStatus.CONFLICT) {
    return detail ?? "Multiple policy years match this claim";
  }
  return "No policy match for Policy Number / SVKK / dates";
}

/** Evaluate match for preview without DB writes. */
export async function evaluateClaimRow(
  row: ParsedClaimRow,
  typeCache: PolicyTypeCache,
  stats: ClaimImportMatchStats,
): Promise<Awaited<ReturnType<typeof matchPolicyForClaim>>> {
  const match = await matchPolicyForClaim(row.matchInput, typeCache);
  if (match.matchStatus === ClaimPolicyMatchStatus.MATCHED_EXACT) stats.matchedExact++;
  else if (match.matchStatus === ClaimPolicyMatchStatus.UNLINKED) stats.unlinked++;
  else if (match.matchStatus === ClaimPolicyMatchStatus.CONFLICT) stats.conflicts++;
  if (match.verificationWarnings.length > 0) stats.verificationWarnings++;
  return match;
}

export type ImportClaimRowResult = "created" | "updated" | "failed";

export type ImportClaimRowOutcome = {
  result: ImportClaimRowResult;
  error?: ClaimCsvRowError;
  matchStatus?: ClaimPolicyMatchStatus;
  verificationWarnings?: string[];
};

/** Import a single claim row (upsert). */
export async function importClaimRow(
  row: ParsedClaimRow,
  opts: {
    typeCache: PolicyTypeCache;
    linkMode: ClaimLinkMode;
    importMode: CsvImportMode;
    dryRun: boolean;
    userId: string;
    permissions: Set<string>;
    scope: GeoScope;
    importJobId?: string;
    statusMap: Record<string, ClaimStatus>;
  },
): Promise<ImportClaimRowOutcome> {
  const validationErr = validateClaimRow(row);
  if (validationErr) {
    return {
      result: "failed",
      error: { row: row.rowNumber, error: validationErr, claimNo: row.claimNo, policyNo: row.policyNo },
    };
  }

  const match = await matchPolicyForClaim(row.matchInput, opts.typeCache);
  if (shouldRejectMatch(match.matchStatus, opts.linkMode)) {
    return {
      result: "failed",
      matchStatus: match.matchStatus,
      verificationWarnings: match.verificationWarnings,
      error: {
        row: row.rowNumber,
        error: matchErrorMessage(match.matchStatus, match.matchReason, match.conflictDetail),
        claimNo: row.claimNo,
        policyNo: row.policyNo,
        matchStatus: match.matchStatus,
        verificationWarnings: match.verificationWarnings,
      },
    };
  }

  const village = match.village ?? row.hospitalArea;
  assertClaimInGeoScope(
    { village, policy: { area: match.policyArea ?? null } },
    opts.permissions,
    opts.scope,
  );

  const existing = await prisma.claim.findUnique({ where: { claimNo: row.claimNo } });
  if (shouldRejectDuplicateClaim(opts.importMode, existing?.claimNo ?? null)) {
    return {
      result: "failed",
      error: {
        row: row.rowNumber,
        error: "Claim already exists (CREATE_ONLY)",
        claimNo: row.claimNo,
        policyNo: row.policyNo,
      },
    };
  }
  if (opts.importMode === CsvImportMode.UPDATE_ONLY && !existing) {
    return {
      result: "failed",
      error: {
        row: row.rowNumber,
        error: "Claim not found (UPDATE_ONLY)",
        claimNo: row.claimNo,
        policyNo: row.policyNo,
      },
    };
  }

  if (opts.dryRun) {
    return {
      result: existing ? "updated" : "created",
      matchStatus: match.matchStatus,
      verificationWarnings: match.verificationWarnings,
    };
  }

  const data = claimDataFromRow(row, match, opts.importJobId, opts.userId);
  if (existing) {
    const { createdBy, ...updateFields } = data;
    void createdBy;
    await prisma.claim.update({
      where: { id: existing.id },
      data: updateFields as Prisma.ClaimUpdateInput,
    });
    return {
      result: "updated",
      matchStatus: match.matchStatus,
      verificationWarnings: match.verificationWarnings,
    };
  }

  await prisma.claim.create({ data });
  return {
    result: "created",
    matchStatus: match.matchStatus,
    verificationWarnings: match.verificationWarnings,
  };
}

/** Max rows allowed per claim import (env override). */
export function claimImportMaxRows(): number {
  return Number(process.env.CLAIM_IMPORT_MAX_ROWS ?? 10000) || 10000;
}

/** Re-parse status on row before import using live map. */
export function applyStatusMap(row: ParsedClaimRow, statusMap: Record<string, ClaimStatus>): ParsedClaimRow {
  return {
    ...row,
    status: mapStatusTextToEnum(row.statusText ?? "", statusMap),
  };
}
