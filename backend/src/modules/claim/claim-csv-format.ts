import { csvCell } from "../policy/policy-csv-utils.js";

/** Canonical claim import column headers (sample template order). */
export const CLAIM_CSV_HEADERS = [
  "TPA Name",
  "Insurance_Company",
  "D.O. Branch",
  "Policy Number",
  "Policy Holder Name",
  "Policy Type",
  "Policy Start Date",
  "Policy End Date",
  "Patient Name",
  "Patient Age",
  "Relation",
  "Gender",
  "Claim Number",
  "Claim Type",
  "Status",
  "Claim Received Date",
  "Information Raised Date",
  "Information Received Date",
  "Hospital Name",
  "Area",
  "NETWORK/NON-NETWORK",
  "HOSPITAL IS IN PPN Y/N",
  "Date Of Admission",
  "Date Of discharge",
  "Claim Amount",
  "Approved Amt",
  "Deduction Amount",
  "Deduction Details",
  "Sum_Insured",
  "Balance Sum Insured",
  "Illness",
  "Denied Reasons",
  "RoomCategory",
  "Cheque No/ Payment Details",
] as const;

/** Maps alternate header spellings to canonical names. */
export const CLAIM_HEADER_ALIASES: Record<string, string> = {
  "claim number.": "Claim Number",
  "claim no": "Claim Number",
  "policy no": "Policy Number",
  "policy number": "Policy Number",
  "holder name": "Policy Holder Name",
  "policy holder name": "Policy Holder Name",
  "product type": "Policy Type",
  "policy type": "Policy Type",
  "policy start": "Policy Start Date",
  "policy end": "Policy End Date",
  "sum insured": "Sum_Insured",
  "sum_insured": "Sum_Insured",
  "approved amount": "Approved Amt",
  "approved amt": "Approved Amt",
  "date of admission": "Date Of Admission",
  "date of discharge": "Date Of discharge",
  "d.o. branch": "D.O. Branch",
  "network/non-network": "NETWORK/NON-NETWORK",
  "hospital is in ppn y/n": "HOSPITAL IS IN PPN Y/N",
  "cheque no/ payment details": "Cheque No/ Payment Details",
};

/** Normalize a raw CSV header to its canonical form. */
export function canonicalClaimHeader(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  return CLAIM_HEADER_ALIASES[lower] ?? trimmed;
}

/** Build downloadable sample CSV for claim import. */
export function buildSampleClaimCsv(): string {
  const header = CLAIM_CSV_HEADERS.map(csvCell).join(",");
  return `\uFEFF${header}\r\n`;
}
