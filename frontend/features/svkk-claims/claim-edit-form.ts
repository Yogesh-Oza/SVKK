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
  claimType: string;
  status: string;
  statusText: string;
  claimAmount: string;
  approvedAmount: string;
  deductionAmount: string;
  deductionDetails: string;
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
  illness: string;
  deniedReasons: string;
  roomCategory: string;
  paymentDetails: string;
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
    claimType: "",
    status: "PENDING",
    statusText: "",
    claimAmount: "",
    approvedAmount: "",
    deductionAmount: "",
    deductionDetails: "",
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
    illness: "",
    deniedReasons: "",
    roomCategory: "",
    paymentDetails: "",
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
    claimType: d.claimType ?? "",
    status: d.status ?? "PENDING",
    statusText: d.statusText ?? "",
    claimAmount: amountToForm(d.claimAmount),
    approvedAmount: amountToForm(d.approvedAmount),
    deductionAmount: amountToForm(d.deductionAmount),
    deductionDetails: d.deductionDetails ?? "",
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
    illness: d.illness ?? "",
    deniedReasons: d.deniedReasons ?? "",
    roomCategory: d.roomCategory ?? "",
    paymentDetails: d.paymentDetails ?? "",
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
    ["approvedAmount", "Approved amount"],
    ["deductionAmount", "Deduction amount"],
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
    claimType: optText(form.claimType),
    status: form.status,
    statusText: optText(form.statusText),
    claimAmount: parseOptionalAmount(form.claimAmount),
    approvedAmount: parseOptionalAmount(form.approvedAmount),
    deductionAmount: parseOptionalAmount(form.deductionAmount),
    deductionDetails: optText(form.deductionDetails),
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
    illness: optText(form.illness),
    deniedReasons: optText(form.deniedReasons),
    roomCategory: optText(form.roomCategory),
    paymentDetails: optText(form.paymentDetails),
  };

  return { ok: true, body };
}
