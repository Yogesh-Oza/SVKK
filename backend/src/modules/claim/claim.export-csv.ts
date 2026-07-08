import { csvCell } from "../policy/policy-csv-utils.js";
import type { ClaimListRow } from "./claim.list.js";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}-${m}-${y}`;
}

function fmtDecimal(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function fmtBool(v: boolean | null | undefined): string {
  if (v === true) return "Y";
  if (v === false) return "N";
  return "";
}

export function buildClaimsExportCsv(rows: ClaimListRow[]): string {
  const headers = [
    "Category",
    "SVKK ID",
    "Policy Type",
    "Policy Grouping",
    "Policy Number",
    "Policy Holder Name",
    "MD ID",
    "Patient Name",
    "Age",
    "Sex",
    "Relation",
    "Village",
    "Insurance Company name",
    "Claim Number",
    "Hospital Name",
    "Area",
    "Treatment Type",
    "Treatment Procedure",
    "Disease Category",
    "Date Of Admission",
    "Date Of Discharge",
    "DIAGNOSIS",
    "Claim Lodge Date",
    "Claim LodgeType",
    "Actual Lodge Type",
    "Claim Amount",
    "Reported Lodge Amt",
    "Deduction Amount",
    "Discount Amt",
    "Paid Amount",
    "Payment In Favour Of",
    "PRS/CRS Date",
    "Payment Detail",
    "Payment Date",
    "Status",
    "Deduction Details",
    "Remark",
    "Policy Year",
    "Match Status",
    "Claim Received Date",
    "Sum Insured",
    "Network Type",
    "Hospital In PPN",
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.categoryText ?? r.policy?.category?.key ?? "",
        r.svkkPublicId,
        r.policyTypeText ?? "",
        r.policy?.policyGrouping ?? "",
        r.policy?.policyNo ?? "",
        r.policyHolderName ?? "",
        r.mdId ?? "",
        r.patientName ?? "",
        r.patientAge != null ? String(r.patientAge) : "",
        r.patientGender ?? "",
        r.patientRelation ?? "",
        r.village ?? "",
        r.insuranceCompany ?? "",
        r.claimNo,
        r.hospitalName ?? "",
        r.hospitalArea ?? "",
        r.treatmentType ?? "",
        r.treatmentProcedure ?? "",
        r.diseaseCategory ?? "",
        fmtDate(r.admissionDate),
        fmtDate(r.dischargeDate),
        r.illness ?? "",
        fmtDate(r.lodgeDate),
        r.claimType ?? "",
        r.actualLodgeType ?? "",
        fmtDecimal(r.claimAmount),
        fmtDecimal(r.reportedLodgeAmount),
        fmtDecimal(r.deductionAmount),
        fmtDecimal(r.discountAmount),
        fmtDecimal(r.approvedAmount),
        r.paymentInFavourOf ?? "",
        fmtDate(r.prsCrsDate),
        r.paymentDetails ?? "",
        fmtDate(r.paymentDate),
        r.statusText ?? r.status,
        r.deductionDetails ?? "",
        r.remark ?? "",
        r.policyYear,
        r.matchStatus ?? "",
        fmtDate(r.claimReceivedDate),
        fmtDecimal(r.sumInsured),
        r.networkType ?? "",
        fmtBool(r.hospitalInPpn),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
