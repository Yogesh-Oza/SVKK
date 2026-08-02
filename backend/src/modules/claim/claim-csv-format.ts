import { csvCell } from "../policy/policy-csv-utils.js";

/**
 * Public Sample / Export / Import contract (39 columns).
 * Exact spellings from SVKK_Claim_Sample_Template — including leading space on lodge amt
 * and double-space "Treatment  Type" (procedure column).
 */
export const CLAIM_CSV_PUBLIC_HEADERS = [
  "Category",
  "SVKK ID",
  "Policy Type",
  "Policy Grouping",
  "Insurance Company name",
  "Policy Number",
  "Policy Start Date",
  "Policy End Date",
  "Policy Holder Name",
  "MD ID",
  "Patient Name",
  "Age",
  "Sex",
  "Relation",
  "Sum Insured",
  "Claim  No. ( CCN)",
  "Hospital Name",
  "Area",
  "Treatment Type",
  "DIAGNOSIS",
  "Disease Category",
  "Date Of Admission",
  "Date Of Discharge",
  " Claim Lodge Amt",
  "Claim Lodge Date",
  "Claim LodgeType",
  "Actual Lodge Type",
  "Deduction Amount",
  "Discount Amt",
  "Deduction/Claim Rejection /Close",
  "Remark",
  "Paid Amount",
  "Payment In Faver Of",
  "PRSDate/CRS Date",
  "Payment Detail",
  "Payment Date",
  "Treatment  Type",
  "Status",
  "Reported_LodgeAmt",
] as const;

export type ClaimCsvPublicHeader = (typeof CLAIM_CSV_PUBLIC_HEADERS)[number];

/** @deprecated Prefer CLAIM_CSV_PUBLIC_HEADERS — kept as alias for older call sites. */
export const CLAIM_CSV_HEADERS = CLAIM_CSV_PUBLIC_HEADERS;

/**
 * Internal parse keys used by parseClaimRow / getClaimField after header canonicalization.
 * Public headers and legacy TPA headers alias into these.
 */
export const CLAIM_CSV_INTERNAL = {
  category: "Category",
  svkkId: "SVKK ID",
  policyType: "Policy Type",
  policyGrouping: "Policy Grouping",
  insuranceCompany: "Insurance_Company",
  policyNumber: "Policy Number",
  policyStart: "Policy Start Date",
  policyEnd: "Policy End Date",
  policyHolder: "Policy Holder Name",
  mdId: "MD ID",
  patientName: "Patient Name",
  age: "Patient Age",
  sex: "Gender",
  relation: "Relation",
  sumInsured: "Sum_Insured",
  claimNumber: "Claim Number",
  hospitalName: "Hospital Name",
  area: "Area",
  treatmentType: "Treatment Type",
  diagnosis: "Illness",
  diseaseCategory: "Disease Category",
  admission: "Date Of Admission",
  discharge: "Date Of discharge",
  lodgeAmt: "Claim Amount",
  lodgeDate: "Claim Lodge Date",
  lodgeType: "Claim Type",
  actualLodgeType: "Actual Lodge Type",
  deductionAmt: "Deduction Amount",
  discountAmt: "Discount Amt",
  deductionDetails: "Deduction Details",
  remark: "Remark",
  paidAmt: "Approved Amt",
  paymentFavour: "Payment In Favour Of",
  prsCrs: "PRS/CRS Date",
  paymentDetail: "Cheque No/ Payment Details",
  paymentDate: "Payment Date",
  treatmentProcedure: "Treatment Procedure",
  status: "Status",
  reportedLodge: "Reported Lodge Amt",
  // Legacy TPA-only (import aliases; not in public 39)
  tpaName: "TPA Name",
  doBranch: "D.O. Branch",
  claimReceived: "Claim Received Date",
  infoRaised: "Information Raised Date",
  infoReceived: "Information Received Date",
  network: "NETWORK/NON-NETWORK",
  hospitalPpn: "HOSPITAL IS IN PPN Y/N",
  balanceSi: "Balance Sum Insured",
  deniedReasons: "Denied Reasons",
  roomCategory: "RoomCategory",
  village: "Village",
} as const;

/** Maps alternate header spellings to internal parse keys. */
export const CLAIM_HEADER_ALIASES: Record<string, string> = {
  "claim number.": "Claim Number",
  "claim no": "Claim Number",
  "claim no.": "Claim Number",
  "claim #": "Claim Number",
  "claim#": "Claim Number",
  "claim_number": "Claim Number",
  "claim  no. ( ccn)": "Claim Number",
  "policy no": "Policy Number",
  "policy number": "Policy Number",
  "holder name": "Policy Holder Name",
  "policy holder name": "Policy Holder Name",
  "product type": "Policy Type",
  "policy type": "Policy Type",
  "policy grouping": "Policy Grouping",
  "policy start": "Policy Start Date",
  "policy end": "Policy End Date",
  "sum insured": "Sum_Insured",
  "sum_insured": "Sum_Insured",
  " claim lodge amt": "Claim Amount",
  "claim lodge amt": "Claim Amount",
  "claim lodge amount": "Claim Amount",
  "claim lodge date": "Claim Lodge Date",
  "claim lodgetype": "Claim Type",
  "claim lodge type": "Claim Type",
  "paid amount": "Approved Amt",
  age: "Patient Age",
  sex: "Gender",
  "approved amount": "Approved Amt",
  "approved amt": "Approved Amt",
  "date of admission": "Date Of Admission",
  "date of discharge": "Date Of discharge",
  "d.o. branch": "D.O. Branch",
  "network/non-network": "NETWORK/NON-NETWORK",
  "hospital is in ppn y/n": "HOSPITAL IS IN PPN Y/N",
  "cheque no/ payment details": "Cheque No/ Payment Details",
  "insurance company name": "Insurance_Company",
  "insurance_company": "Insurance_Company",
  "md id": "MD ID",
  category: "Category",
  "svkk id": "SVKK ID",
  svkk: "SVKK ID",
  village: "Village",
  "actual lodge type": "Actual Lodge Type",
  "treatment type": "Treatment Type",
  "treatment  type": "Treatment Procedure",
  "treatment procedure": "Treatment Procedure",
  "disease category": "Disease Category",
  diagnosis: "Illness",
  "reported_lodgeamt": "Reported Lodge Amt",
  "reported lodgeamt": "Reported Lodge Amt",
  "reported lodge amt": "Reported Lodge Amt",
  "discount amt": "Discount Amt",
  "discount amount": "Discount Amt",
  "deduction/claim rejection /close": "Deduction Details",
  "deduction/claim rejection/close": "Deduction Details",
  "deduction note": "Deduction Details",
  remark: "Remark",
  remarks: "Remark",
  "payment in faver of": "Payment In Favour Of",
  "payment in favour of": "Payment In Favour Of",
  "payment date": "Payment Date",
  "payment detail": "Cheque No/ Payment Details",
  "payment details": "Cheque No/ Payment Details",
  "prsdate/crs date": "PRS/CRS Date",
  "prs/crs date": "PRS/CRS Date",
  "prs date/crs date": "PRS/CRS Date",
  // Legacy TPA headers that are already internal names
  "tpa name": "TPA Name",
  "claim number": "Claim Number",
  "claim amount": "Claim Amount",
  "claim received date": "Claim Received Date",
};

function normalizedHeaderKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalize a raw CSV header to its internal parse key. */
export function canonicalClaimHeader(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // Preserve leading-space lodge amt before trim-only path
  const lowerExact = raw.toLowerCase();
  if (lowerExact.startsWith(" claim lodge amt") || lowerExact === " claim lodge amt") {
    return "Claim Amount";
  }
  const lower = trimmed.toLowerCase();
  const direct = CLAIM_HEADER_ALIASES[lower];
  if (direct) return direct;

  const norm = normalizedHeaderKey(trimmed);
  if (norm === "claim no ccn" || norm === "claim no" || norm === "claim number") {
    return "Claim Number";
  }
  if (norm === "policy no" || norm === "policy number") {
    return "Policy Number";
  }
  if (norm === "sum insured") {
    return "Sum_Insured";
  }
  if (norm === "svkk id" || norm === "svkk") {
    return "SVKK ID";
  }
  if (norm === "policy grouping") {
    return "Policy Grouping";
  }
  if (norm === "claim lodge amt") {
    return "Claim Amount";
  }
  if (norm === "paid amount") {
    return "Approved Amt";
  }
  if (norm === "payment detail") {
    return "Cheque No/ Payment Details";
  }
  if (norm === "prsdate crs date" || norm === "prs crs date") {
    return "PRS/CRS Date";
  }
  if (norm === "deduction claim rejection close") {
    return "Deduction Details";
  }
  if (norm === "reported lodgeamt" || norm === "reported lodge amt") {
    return "Reported Lodge Amt";
  }
  if (norm === "treatment type" && trimmed.includes("  ")) {
    return "Treatment Procedure";
  }
  return trimmed;
}

/** Sample CSV: BOM + public headers + one example data row matching the reference template. */
export function buildSampleClaimCsv(): string {
  const header = CLAIM_CSV_PUBLIC_HEADERS.map(csvCell).join(",");
  const example = [
    "A",
    "SVKK001",
    "Floater",
    "Group A",
    "The New India Assurance Company Limited",
    "MDI123456/24/00001",
    "01-04-2024",
    "31-03-2025",
    "Ramesh Patel",
    "M001",
    "Ramesh Patel",
    "45",
    "M",
    "Self",
    "500000",
    "CCN2024001",
    "Shree Hospital",
    "Anand",
    "In-Patient",
    "Appendicitis",
    "Diseases of the digestive system",
    "15-04-2024",
    "20-04-2024",
    "85000",
    "22-04-2024",
    "Cashless",
    "Cashless",
    "5000",
    "0",
    "",
    "",
    "80000",
    "The New India Assurance Company Limited",
    "24-04-2024",
    "NEFT/123456",
    "25-04-2024",
    "In-Patient",
    "Paid",
    "85000",
  ];
  const row = example.map(csvCell).join(",");
  return `\uFEFF${header}\r\n${row}\r\n`;
}

export function claimExportFilename(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `SVKK_Claims_${y}-${m}-${d}.csv`;
}
