import { csvCell } from "../policy/policy-csv-utils.js";
import type { ClaimPolicyMatchStatus } from "@prisma/client";

export type ClaimCsvRowError = {
  row: number;
  error: string;
  claimNo?: string;
  policyNo?: string;
  matchStatus?: ClaimPolicyMatchStatus;
  verificationWarnings?: string[];
};

/** Build downloadable claim import error report CSV. */
export function buildClaimErrorReportCsv(errors: ClaimCsvRowError[]): string {
  const lines = ["Row,Error,Claim No,Policy No,Match Status,Verification Warnings"];
  for (const e of errors) {
    lines.push(
      [
        String(e.row),
        e.error,
        e.claimNo ?? "",
        e.policyNo ?? "",
        e.matchStatus ?? "",
        (e.verificationWarnings ?? []).join(";"),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
