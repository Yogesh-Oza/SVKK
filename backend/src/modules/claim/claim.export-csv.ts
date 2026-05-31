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

export function buildClaimsExportCsv(rows: ClaimListRow[]): string {
  const headers = [
    "Claim Number",
    "SVKK ID",
    "Policy Number",
    "Policy Year",
    "Policy Holder",
    "Policy Type",
    "Patient Name",
    "Claim Type",
    "Status",
    "Match Status",
    "Claim Amount",
    "Approved Amount",
    "Deduction Amount",
    "Village",
    "Hospital",
    "Claim Received Date",
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.claimNo,
        r.svkkPublicId,
        r.policy?.policyNo ?? "",
        r.policyYear,
        r.policyHolderName ?? "",
        r.policyTypeText ?? "",
        r.patientName ?? "",
        r.claimType ?? "",
        r.statusText ?? r.status,
        r.matchStatus ?? "",
        fmtDecimal(r.claimAmount),
        fmtDecimal(r.approvedAmount),
        fmtDecimal(r.deductionAmount),
        r.village ?? "",
        r.hospitalName ?? "",
        fmtDate(r.claimReceivedDate),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
