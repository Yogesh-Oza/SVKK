import { formatDateForFormInput, toApiDateIso } from "@/lib/svkk/form-date";
import type { ClaimDetail } from "./claim-detail-types";

export type ClaimEditFormValues = {
  svkkPublicId: string;
  policyYear: string;
  village: string;
  policyHolderName: string;
  policyTypeText: string;
  policyStartDate: string;
  policyEndDate: string;
  sumInsured: string;
  patientName: string;
  patientAge: string;
  patientRelation: string;
  patientGender: string;
  mdId: string;
  categoryText: string;
  claimType: string;
  actualLodgeType: string;
  treatmentType: string;
  treatmentProcedure: string;
  diseaseCategory: string;
  status: string;
  statusText: string;
  claimAmount: string;
  reportedLodgeAmount: string;
  approvedAmount: string;
  deductionAmount: string;
  discountAmount: string;
  deductionDetails: string;
  remark: string;
  balanceSumInsured: string;
  tpaName: string;
  insuranceCompany: string;
  doBranch: string;
  claimReceivedDate: string;
  informationRaisedDate: string;
  informationReceivedDate: string;
  hospitalName: string;
  hospitalArea: string;
  networkType: string;
  hospitalInPpn: string;
  admissionDate: string;
  dischargeDate: string;
  lodgeDate: string;
  illness: string;
  deniedReasons: string;
  roomCategory: string;
  paymentDetails: string;
  paymentInFavourOf: string;
  paymentDate: string;
  prsCrsDate: string;
};

function amountToForm(v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  return String(v);
}

function boolToForm(v: boolean | null | undefined): string {
  if (v === true) return "Y";
  if (v === false) return "N";
  return "";
}

function dateToForm(v: string | null | undefined): string {
  return formatDateForFormInput(v ?? "");
}

export function emptyClaimEditForm(): ClaimEditFormValues {
  return {
    svkkPublicId: "",
    policyYear: "",
    village: "",
    policyHolderName: "",
    policyTypeText: "",
    policyStartDate: "",
    policyEndDate: "",
    sumInsured: "",
    patientName: "",
    patientAge: "",
    patientRelation: "",
    patientGender: "",
    mdId: "",
    categoryText: "",
    claimType: "",
    actualLodgeType: "",
    treatmentType: "",
    treatmentProcedure: "",
    diseaseCategory: "",
    status: "PENDING",
    statusText: "",
    claimAmount: "",
    reportedLodgeAmount: "",
    approvedAmount: "",
    deductionAmount: "",
    discountAmount: "",
    deductionDetails: "",
    remark: "",
    balanceSumInsured: "",
    tpaName: "",
    insuranceCompany: "",
    doBranch: "",
    claimReceivedDate: "",
    informationRaisedDate: "",
    informationReceivedDate: "",
    hospitalName: "",
    hospitalArea: "",
    networkType: "",
    hospitalInPpn: "",
    admissionDate: "",
    dischargeDate: "",
    lodgeDate: "",
    illness: "",
    deniedReasons: "",
    roomCategory: "",
    paymentDetails: "",
    paymentInFavourOf: "",
    paymentDate: "",
    prsCrsDate: "",
  };
}

export function claimDetailToForm(d: ClaimDetail): ClaimEditFormValues {
  return {
    svkkPublicId: d.svkkPublicId ?? "",
    policyYear: d.policyYear ?? "",
    village: d.village ?? "",
    policyHolderName: d.policyHolderName ?? "",
    policyTypeText: d.policyTypeText ?? "",
    policyStartDate: dateToForm(d.policyStartDate),
    policyEndDate: dateToForm(d.policyEndDate),
    sumInsured: amountToForm(d.sumInsured),
    patientName: d.patientName ?? "",
    patientAge: d.patientAge != null ? String(d.patientAge) : "",
    patientRelation: d.patientRelation ?? "",
    patientGender: d.patientGender ?? "",
    mdId: d.mdId ?? "",
    categoryText: d.categoryText ?? "",
    claimType: d.claimType ?? "",
    actualLodgeType: d.actualLodgeType ?? "",
    treatmentType: d.treatmentType ?? "",
    treatmentProcedure: d.treatmentProcedure ?? "",
    diseaseCategory: d.diseaseCategory ?? "",
    status: d.status ?? "PENDING",
    statusText: d.statusText ?? "",
    claimAmount: amountToForm(d.claimAmount),
    reportedLodgeAmount: amountToForm(d.reportedLodgeAmount),
    approvedAmount: amountToForm(d.approvedAmount),
    deductionAmount: amountToForm(d.deductionAmount),
    discountAmount: amountToForm(d.discountAmount),
    deductionDetails: d.deductionDetails ?? "",
    remark: d.remark ?? "",
    balanceSumInsured: amountToForm(d.balanceSumInsured),
    tpaName: d.tpaName ?? "",
    insuranceCompany: d.insuranceCompany ?? "",
    doBranch: d.doBranch ?? "",
    claimReceivedDate: dateToForm(d.claimReceivedDate),
    informationRaisedDate: dateToForm(d.informationRaisedDate),
    informationReceivedDate: dateToForm(d.informationReceivedDate),
    hospitalName: d.hospitalName ?? "",
    hospitalArea: d.hospitalArea ?? "",
    networkType: d.networkType ?? "",
    hospitalInPpn: boolToForm(d.hospitalInPpn),
    admissionDate: dateToForm(d.admissionDate),
    dischargeDate: dateToForm(d.dischargeDate),
    lodgeDate: dateToForm(d.lodgeDate),
    illness: d.illness ?? "",
    deniedReasons: d.deniedReasons ?? "",
    roomCategory: d.roomCategory ?? "",
    paymentDetails: d.paymentDetails ?? "",
    paymentInFavourOf: d.paymentInFavourOf ?? "",
    paymentDate: dateToForm(d.paymentDate),
    prsCrsDate: dateToForm(d.prsCrsDate),
  };
}

function parseOptionalAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/[,₹]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function optText(raw: string): string | null {
  const t = raw.trim();
  return t || null;
}

/** Build PATCH body from form values. Returns error message or payload. */
export function formToClaimPatch(
  form: ClaimEditFormValues,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const amounts: Array<[keyof ClaimEditFormValues, string]> = [
    ["claimAmount", "Claim amount"],
    ["reportedLodgeAmount", "Reported lodge amount"],
    ["approvedAmount", "Approved amount"],
    ["deductionAmount", "Deduction amount"],
    ["discountAmount", "Discount amount"],
    ["balanceSumInsured", "Balance sum insured"],
    ["sumInsured", "Sum insured"],
  ];
  for (const [key, label] of amounts) {
    const raw = form[key];
    if (typeof raw === "string" && raw.trim() && parseOptionalAmount(raw) === null) {
      return { ok: false, error: `${label} must be a non-negative number or empty` };
    }
  }
  if (form.patientAge.trim() && parseOptionalInt(form.patientAge) === null) {
    return { ok: false, error: "Patient age must be a whole number or empty" };
  }

  const body: Record<string, unknown> = {
    svkkPublicId: form.svkkPublicId.trim(),
    policyYear: form.policyYear.trim(),
    village: optText(form.village),
    policyHolderName: optText(form.policyHolderName),
    policyTypeText: optText(form.policyTypeText),
    policyStartDate: toApiDateIso(form.policyStartDate),
    policyEndDate: toApiDateIso(form.policyEndDate),
    sumInsured: parseOptionalAmount(form.sumInsured),
    patientName: optText(form.patientName),
    patientAge: parseOptionalInt(form.patientAge),
    patientRelation: optText(form.patientRelation),
    patientGender: optText(form.patientGender),
    mdId: optText(form.mdId),
    categoryText: optText(form.categoryText),
    claimType: optText(form.claimType),
    actualLodgeType: optText(form.actualLodgeType),
    treatmentType: optText(form.treatmentType),
    treatmentProcedure: optText(form.treatmentProcedure),
    diseaseCategory: optText(form.diseaseCategory),
    status: form.status,
    statusText: optText(form.statusText),
    claimAmount: parseOptionalAmount(form.claimAmount),
    reportedLodgeAmount: parseOptionalAmount(form.reportedLodgeAmount),
    approvedAmount: parseOptionalAmount(form.approvedAmount),
    deductionAmount: parseOptionalAmount(form.deductionAmount),
    discountAmount: parseOptionalAmount(form.discountAmount),
    deductionDetails: optText(form.deductionDetails),
    remark: optText(form.remark),
    balanceSumInsured: parseOptionalAmount(form.balanceSumInsured),
    tpaName: optText(form.tpaName),
    insuranceCompany: optText(form.insuranceCompany),
    doBranch: optText(form.doBranch),
    claimReceivedDate: toApiDateIso(form.claimReceivedDate),
    informationRaisedDate: toApiDateIso(form.informationRaisedDate),
    informationReceivedDate: toApiDateIso(form.informationReceivedDate),
    hospitalName: optText(form.hospitalName),
    hospitalArea: optText(form.hospitalArea),
    networkType: optText(form.networkType),
    hospitalInPpn: form.hospitalInPpn.trim() || null,
    admissionDate: toApiDateIso(form.admissionDate),
    dischargeDate: toApiDateIso(form.dischargeDate),
    lodgeDate: toApiDateIso(form.lodgeDate),
    illness: optText(form.illness),
    deniedReasons: optText(form.deniedReasons),
    roomCategory: optText(form.roomCategory),
    paymentDetails: optText(form.paymentDetails),
    paymentInFavourOf: optText(form.paymentInFavourOf),
    paymentDate: toApiDateIso(form.paymentDate),
    prsCrsDate: toApiDateIso(form.prsCrsDate),
  };

  return { ok: true, body };
}
