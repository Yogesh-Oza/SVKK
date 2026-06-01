import type { Prisma } from "@prisma/client";
import {
  formatCategoryLabel,
  type CategoryRef,
} from "../../lib/category-display.js";
import type { PolicyExportRow } from "./policy.export-csv.js";
import {
  buildExtendedMemberHeaders,
  buildExtendedMemberSlotCells,
  buildExtendedPaymentHeaders,
  buildFlatMember1Cells,
  buildAllPaymentSlotCells,
  buildPolicyCsvSampleDemoRow,
  POLICY_CSV_MAX_MEMBER_SLOTS,
  POLICY_CSV_MAX_PAYMENT_SLOTS,
} from "./policy-csv-slots.js";
import { resolveYearPremiumForExport } from "./policy-csv-export-resolve.js";
import { csvCell, fmtCsvDate, fmtCsvDecimal, formatPhoneForCsvExport } from "./policy-csv-utils.js";

export { csvCell, fmtCsvDate, fmtCsvDecimal, formatPhoneForCsvExport, csvPhoneCell } from "./policy-csv-utils.js";

/** Documented format version (not embedded as a required CSV row). */
export const POLICY_CSV_VERSION = "v2";

/** Canonical v2 flat column block (~106 columns). */
export const POLICY_CSV_FLAT_HEADERS = [
  "year",
  "month",
  "grouping",
  "Customer ID",
  "SVKK ID",
  "Holder name",
  "Holder PAN",
  "Holder Aadhaar",
  "previous policy no",
  "PRE. END DATE",
  "policy no",
  "Policy start",
  "Policy end",
  "Person Count*",
  "Insurance company",
  "TPA",
  "Product Type",
  "Village",
  "Category",
  "Holder DOB",
  "Holder gender",
  "Holder age",
  "Holder relationship",
  "Persons insured",
  "Sum insured",
  "holder cumulative bonus",
  "holder joining year",
  "holder basic premium",
  "mode of payment",
  "policy_cheque_no",
  "bank",
  "account_no",
  "branch",
  "name_as_per_cheque",
  "ifsc",
  "not_over",
  "cheque_date",
  "cheque_status",
  "reason_dishonoured",
  "return charge",
  "other carges",
  "Gross premium",
  "Tax %",
  "Tax amount",
  "SVKK premium",
  "Net premium",
  "VKK commission",
  "Commission amount",
  "Policy Holder Premium",
  "Two lac floater",
  "Gaam mahajan contribution",
  "Excess / short",
  "Diff paid by holder",
  "loan_status",
  "loan_amt",
  "cd_account_status",
  "cd_amount",
  "Refund Cheque Amount",
  "Refund Cheque Number",
  "Refund Cheque Date",
  "Member 1 Name",
  "Member 1 DOB",
  "Member 1 Relationship",
  "Member 1 Gender",
  "MEMBER 1 DATE OF JOINING",
  "Member 1 Sum insured",
  "Member 1 Basic premium",
  "Member 1 Cumulative bonus",
  "Member 1 Phone",
  "Member 1 Age at entry",
  "nominee_name",
  "nominee_relation",
  "nominee mobile",
  "Address Line 1: House/Flat No, Building Name",
  "Address Line 2: Street/Road Name",
  "Address Line 3: Landmark / Locality",
  "Address Line 4: Additional Details (optional)",
  "area",
  "city",
  "pincode",
  "Primary Mobile Number",
  "Secondary Mobile Number",
  "whatsapp",
  "email",
  "not_courier",
  "courier_date",
  "courier_address",
  "pod",
  "courier co",
  "gen remark",
  "policy remarK",
  "ref no",
  "Created at",
  "Updated at",
  "policy url",
  "url",
] as const;

/** @deprecated Use POLICY_CSV_FLAT_HEADERS */
export const POLICY_CSV_LEGACY_HEADERS = POLICY_CSV_FLAT_HEADERS;

export type PolicyCsvFlatHeader = (typeof POLICY_CSV_FLAT_HEADERS)[number];

/** Full export: flat + extended member 2–12 + payment 2–8. */
export function buildPolicyCsvHeaders(
  maxMembers = POLICY_CSV_MAX_MEMBER_SLOTS,
  maxPayments = POLICY_CSV_MAX_PAYMENT_SLOTS,
): string[] {
  return [
    ...POLICY_CSV_FLAT_HEADERS,
    ...buildExtendedMemberHeaders(maxMembers),
    ...buildExtendedPaymentHeaders(maxPayments),
  ];
}

/**
 * Policy list export headers (all member/payment slots).
 * Import sample (`buildPolicyCsvSample`) stays flat-only for simplicity.
 */
export const POLICY_CSV_EXPORT_HEADERS = buildPolicyCsvHeaders();

export const POLICY_CSV_HEADERS = POLICY_CSV_EXPORT_HEADERS;

export function normalizeCsvHeader(h: string): string {
  return h.trim().toLowerCase();
}

export function isLegacyPolicyCsvFormat(header: string[]): boolean {
  const h = header.map(normalizeCsvHeader);
  return h.includes("ref no") && h.includes("svkk id") && h.includes("policy no");
}

/** Detect v2 vs legacy from header row. */
export function detectFormatFromHeaders(header: string[]): string {
  const h = header.map(normalizeCsvHeader);
  if (h.includes("pre. end date") && h.includes("member 1 name")) return POLICY_CSV_VERSION;
  if (h.includes("member 3 name") && !h.includes("member 1 name")) return "legacy";
  if (isLegacyPolicyCsvFormat(header)) return POLICY_CSV_VERSION;
  return "unknown";
}

const SUPPORTED_CSV_VERSIONS = new Set(["v2", "legacy"]);

export type ParsedCsvLayout = {
  csvVersion: string;
  header: string[];
  dataRows: string[][];
};

/** Optional first-row CSV_VERSION metadata; otherwise header-based detection. */
export function parseCsvWithOptionalVersion(rows: string[][]): ParsedCsvLayout {
  if (!rows.length) {
    return { csvVersion: "unknown", header: [], dataRows: [] };
  }

  const firstCell = rows[0]?.[0]?.trim().toUpperCase() ?? "";
  if (firstCell === "CSV_VERSION") {
    const version = rows[0]?.[1]?.trim().toLowerCase() ?? "unknown";
    if (!SUPPORTED_CSV_VERSIONS.has(version) && version !== "unknown") {
      throw new Error(`Unsupported CSV_VERSION: ${rows[0]?.[1]?.trim() ?? ""}. Supported: v2`);
    }
    const header = rows[1] ?? [];
    return { csvVersion: version, header, dataRows: rows.slice(2) };
  }

  const header = rows[0] ?? [];
  return {
    csvVersion: detectFormatFromHeaders(header),
    header,
    dataRows: rows.slice(1),
  };
}

function formatPolicyUrl(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown[];
      if (Array.isArray(arr)) return `${arr.length} document(s)`;
    } catch {
      /* fall through */
    }
  }
  return t.length > 200 ? `${t.slice(0, 197)}…` : t;
}

function cdAccountStatusLabel(used: boolean | null | undefined): string {
  if (used == null) return "";
  return used ? "Yes" : "No";
}

function isImportablePolicyUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (t.includes("document(s)")) return false;
  return t.startsWith("http://") || t.startsWith("https://") || t.startsWith("[");
}

export function buildLegacyPolicyCsvCells(
  r: PolicyExportRow,
  party: Record<string, unknown> | null,
  year: PolicyExportRow["years"][number] | undefined,
  categoryByKey: Map<string, CategoryRef>,
): string[] {
  const members = year?.members ?? [];
  const payments = year?.payments ?? [];
  const premium = resolveYearPremiumForExport(year);
  const category = formatCategoryLabel(
    r.category ? { id: "", key: r.category.key, name: r.category.name } : null,
    r.categoryText,
    categoryByKey,
  );

  const byHeader: Record<string, string> = {
    year: r.periodYearText ?? year?.yearLabel ?? "",
    month: r.periodMonthText ?? "",
    grouping: r.policyGrouping ?? "",
    "Customer ID": String(party?.customerId ?? ""),
    "SVKK ID": String(party?.svkkPublicId ?? ""),
    "Holder name": String(party?.name ?? ""),
    "Holder PAN": String(party?.pan ?? ""),
    "Holder Aadhaar": String(party?.aadhaarNo ?? ""),
    "previous policy no": r.previousPolicyNo ?? "",
    "PRE. END DATE": fmtCsvDate(r.previousEndDate),
    "policy no": r.policyNo ?? "",
    "Policy start": fmtCsvDate(year?.policyStart),
    "Policy end": fmtCsvDate(year?.policyEnd),
    "Person Count*": r.personsInsuredCount != null ? String(r.personsInsuredCount) : "",
    "Insurance company": r.insuranceCompany ?? "",
    TPA: r.tpa ?? "",
    "Product Type": r.policyType?.name ?? "",
    Village: r.village ?? "",
    Category: category,
    "Holder DOB": fmtCsvDate(party?.dateOfBirth as Date | null | undefined),
    "Holder gender": r.holderGender ?? "",
    "Holder age": r.holderAge != null ? String(r.holderAge) : "",
    "Holder relationship": r.holderRelationship ?? "",
    "Persons insured": r.personsInsuredCount != null ? String(r.personsInsuredCount) : "",
    "Sum insured": fmtCsvDecimal(year?.sumInsured),
    "holder cumulative bonus": fmtCsvDecimal(year?.holderCumulativeBonus),
    "holder joining year": year?.holderJoiningYear ?? "",
    "holder basic premium": fmtCsvDecimal(year?.holderBasicPremium),
    "Gross premium": fmtCsvDecimal(premium.grossPremium),
    "Tax %": fmtCsvDecimal(premium.taxPercent),
    "Tax amount": fmtCsvDecimal(premium.taxAmount),
    "SVKK premium": fmtCsvDecimal(premium.svkkPremium),
    "Net premium": fmtCsvDecimal(premium.netPremium),
    "VKK commission": fmtCsvDecimal(premium.vkkCommission),
    "Commission amount": fmtCsvDecimal(premium.commissionAmount),
    "Policy Holder Premium": fmtCsvDecimal(premium.yearPolicyHolderPremium),
    "Two lac floater": fmtCsvDecimal(premium.twoLacFloater),
    "Gaam mahajan contribution": fmtCsvDecimal(premium.gaamMahajanContribution),
    "Excess / short": fmtCsvDecimal(premium.excessShortAmount),
    "Diff paid by holder": fmtCsvDecimal(premium.diffPaidByHolder),
    loan_status: r.loanStatus ?? "",
    loan_amt: fmtCsvDecimal(r.loanAmount),
    cd_account_status: cdAccountStatusLabel(r.cdAccountUsed),
    cd_amount: fmtCsvDecimal(r.cdAmount),
    "Refund Cheque Amount": fmtCsvDecimal(r.refundChequeAmount),
    "Refund Cheque Number": r.refundChequeNo ?? "",
    "Refund Cheque Date": fmtCsvDate(r.refundChequeDate),
    nominee_name: r.nomineeName ?? "",
    nominee_relation: r.nomineeRelation ?? "",
    "nominee mobile": formatPhoneForCsvExport(r.contactPhone),
    "Address Line 1: House/Flat No, Building Name": r.addressLine1 ?? "",
    "Address Line 2: Street/Road Name": r.addressLine2 ?? "",
    "Address Line 3: Landmark / Locality": r.addressLine3 ?? "",
    "Address Line 4: Additional Details (optional)": r.addressLine4 ?? "",
    area: r.area ?? "",
    city: r.city ?? "",
    pincode: r.pincode ?? "",
    "Primary Mobile Number": formatPhoneForCsvExport(String(party?.mobile ?? "")),
    "Secondary Mobile Number": formatPhoneForCsvExport(r.mobileSecondary),
    whatsapp: formatPhoneForCsvExport(r.whatsappNo),
    email: String(party?.email ?? ""),
    not_courier: r.courierStatus ?? "",
    courier_date: fmtCsvDate(r.courierDate),
    courier_address: r.courierAddress ?? "",
    pod: r.podNumber ?? r.pod ?? "",
    "courier co": r.courierCompany ?? "",
    "gen remark": r.remarks ?? "",
    "policy remarK": year?.yearRemarks ?? "",
    "ref no": r.referenceNo ?? "",
    "Created at": r.createdAt.toISOString(),
    "Updated at": r.updatedAt.toISOString(),
    "policy url": formatPolicyUrl(r.policyUrl),
    url: r.policyUrl2 ?? "",
    ...buildFlatMember1Cells(members),
    ...buildExtendedMemberSlotCells(members),
    ...buildAllPaymentSlotCells(payments, year?.paymentMode),
  };

  return POLICY_CSV_EXPORT_HEADERS.map((h) => byHeader[h] ?? "");
}

export function buildPolicyCsvExportHeaderLine(): string {
  return POLICY_CSV_EXPORT_HEADERS.map(csvCell).join(",");
}

export function buildPolicyCsvHeaderLine(): string {
  return buildPolicyCsvExportHeaderLine();
}

/** Sample CSV: flat v2 headers + one demo row (no CSV_VERSION row). */
export function buildPolicyCsvSample(): string {
  const sampleHeaders = [...POLICY_CSV_FLAT_HEADERS];
  const demo = buildPolicyCsvSampleDemoRow();
  const headerLine = sampleHeaders.map(csvCell).join(",");
  const cells = sampleHeaders.map((h) => demo[h] ?? "");
  return `\uFEFF${headerLine}\r\n${cells.map(csvCell).join(",")}\r\n`;
}

export function buildLegacyPoliciesCsv(
  rows: PolicyExportRow[],
  partyByRow: Array<Record<string, unknown> | null>,
  years: Array<PolicyExportRow["years"][number] | undefined>,
  categoryByKey: Map<string, CategoryRef>,
): string {
  const lines = [buildPolicyCsvHeaderLine()];
  for (let i = 0; i < rows.length; i++) {
    const cells = buildLegacyPolicyCsvCells(
      rows[i]!,
      partyByRow[i] ?? null,
      years[i],
      categoryByKey,
    );
    lines.push(cells.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export { isImportablePolicyUrl };
