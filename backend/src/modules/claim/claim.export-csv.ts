import { csvCell } from "../policy/policy-csv-utils.js";
import { CLAIM_CSV_PUBLIC_HEADERS } from "./claim-csv-format.js";
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

function firstNonEmpty(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}

/** Build 39-column public CSV; linked claims prefer Policy / InsuredParty / PolicyYear over snapshots. */
export function buildClaimsExportCsv(rows: ClaimListRow[]): string {
  const lines = [CLAIM_CSV_PUBLIC_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const policyNo = firstNonEmpty(r.policy?.policyNo, r.policyNoText);
    const svkk = firstNonEmpty(r.policy?.insuredParty?.svkkPublicId, r.svkkPublicId);
    const grouping = firstNonEmpty(r.policy?.policyGrouping, r.policyGroupingText);
    const policyStart = r.policyYearRow?.policyStart ?? r.policyStartDate;
    const policyEnd = r.policyYearRow?.policyEnd ?? r.policyEndDate;
    const category = firstNonEmpty(r.categoryText, r.policy?.category?.key);

    lines.push(
      [
        category,
        svkk,
        r.policyTypeText ?? "",
        grouping,
        r.insuranceCompany ?? "",
        policyNo,
        fmtDate(policyStart),
        fmtDate(policyEnd),
        r.policyHolderName ?? "",
        r.mdId ?? "",
        r.patientName ?? "",
        r.patientAge != null ? String(r.patientAge) : "",
        r.patientGender ?? "",
        r.patientRelation ?? "",
        fmtDecimal(r.sumInsured),
        r.claimNo,
        r.hospitalName ?? "",
        r.hospitalArea ?? "",
        r.treatmentType ?? "",
        r.illness ?? "",
        r.diseaseCategory ?? "",
        fmtDate(r.admissionDate),
        fmtDate(r.dischargeDate),
        fmtDecimal(r.claimAmount),
        fmtDate(r.lodgeDate),
        r.claimType ?? "",
        r.actualLodgeType ?? "",
        fmtDecimal(r.deductionAmount),
        fmtDecimal(r.discountAmount),
        r.deductionDetails ?? "",
        r.remark ?? "",
        fmtDecimal(r.approvedAmount),
        r.paymentInFavourOf ?? "",
        fmtDate(r.prsCrsDate),
        r.paymentDetails ?? "",
        fmtDate(r.paymentDate),
        r.treatmentProcedure ?? "",
        r.statusText ?? r.status,
        fmtDecimal(r.reportedLodgeAmount),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
