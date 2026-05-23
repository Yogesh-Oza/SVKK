import type { Prisma } from "@prisma/client";
import {
  formatCategoryLabel,
  type CategoryRef,
} from "../../lib/category-display.js";
import type { PolicyExportRow } from "./policy.export-csv.js";
import {
  buildAllMemberSlotCells,
  buildAllPaymentSlotCells,
  buildExtendedMemberHeaders,
  buildExtendedPaymentHeaders,
  buildPolicyCsvSampleDemoRow,
  POLICY_CSV_MAX_MEMBER_SLOTS,
  POLICY_CSV_MAX_PAYMENT_SLOTS,
} from "./policy-csv-slots.js";
import { csvCell } from "./policy-csv-utils.js";

export { csvCell } from "./policy-csv-utils.js";

/** Base 95 columns from `policies-export-23 05 2026.xlsx` (includes Member 3 + payment 1). */
export const POLICY_CSV_LEGACY_HEADERS = [
  "year",
  "month",
  "grouping",
  "Customer ID",
  "SVKK ID",
  "Holder name",
  "Holder PAN",
  "Holder Aadhaar",
  "previous policy no",
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
  "Member 3 Name",
  "Member 3 DOB",
  "Member 3 Relationship",
  "Member 3 Gender",
  "Member 3 Sum insured",
  "Member 3 Basic premium",
  "Member 3 Cumulative bonus",
  "Member 3 Phone",
  "Member 3 Age at entry",
  "member_date_of_joining1",
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
  "policy remar",
  "ref no",
  "Created at",
  "Updated at",
  "policy url",
  "url",
] as const;

export type PolicyCsvLegacyHeader = (typeof POLICY_CSV_LEGACY_HEADERS)[number];

/** Legacy + extra member slots (1,2,4..12) + extra payments (2..8). */
export function buildPolicyCsvHeaders(
  maxMembers = POLICY_CSV_MAX_MEMBER_SLOTS,
  maxPayments = POLICY_CSV_MAX_PAYMENT_SLOTS,
): string[] {
  return [
    ...POLICY_CSV_LEGACY_HEADERS,
    ...buildExtendedMemberHeaders(maxMembers),
    ...buildExtendedPaymentHeaders(maxPayments),
  ];
}

export const POLICY_CSV_HEADERS = buildPolicyCsvHeaders();

export function normalizeCsvHeader(h: string): string {
  return h.trim().toLowerCase();
}

export function isLegacyPolicyCsvFormat(header: string[]): boolean {
  const h = header.map(normalizeCsvHeader);
  return h.includes("ref no") && h.includes("svkk id") && h.includes("policy no");
}

export function fmtCsvDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function fmtCsvDecimal(v: Prisma.Decimal | null | undefined): string {
  if (v == null) return "";
  return v.toString();
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

export function buildLegacyPolicyCsvCells(
  r: PolicyExportRow,
  party: Record<string, unknown> | null,
  year: PolicyExportRow["years"][number] | undefined,
  categoryByKey: Map<string, CategoryRef>,
): string[] {
  const members = year?.members ?? [];
  const payments = year?.payments ?? [];
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
    "Gross premium": fmtCsvDecimal(year?.grossPremium),
    "Tax %": fmtCsvDecimal(year?.taxPercent),
    "Tax amount": fmtCsvDecimal(year?.taxAmount),
    "SVKK premium": fmtCsvDecimal(year?.svkkPremium),
    "Net premium": fmtCsvDecimal(year?.netPremium),
    "VKK commission": fmtCsvDecimal(year?.vkkCommission),
    "Commission amount": fmtCsvDecimal(year?.commissionAmount),
    "Policy Holder Premium": fmtCsvDecimal(
      year?.yearPolicyHolderPremium ?? year?.policyHolderContribution,
    ),
    "Two lac floater": fmtCsvDecimal(year?.twoLacFloater ?? year?.premiumOneOrTwoLakh),
    "Gaam mahajan contribution": fmtCsvDecimal(year?.gaamMahajanContribution),
    "Excess / short": fmtCsvDecimal(year?.excessShortAmount),
    "Diff paid by holder": fmtCsvDecimal(
      year?.diffPaidByHolder ?? year?.differenceAmountPaidByHolder,
    ),
    loan_status: r.loanStatus ?? "",
    loan_amt: fmtCsvDecimal(r.loanAmount),
    cd_account_status: cdAccountStatusLabel(r.cdAccountUsed),
    cd_amount: fmtCsvDecimal(r.cdAmount),
    "Refund Cheque Amount": fmtCsvDecimal(r.refundChequeAmount),
    "Refund Cheque Number": r.refundChequeNo ?? "",
    "Refund Cheque Date": fmtCsvDate(r.refundChequeDate),
    nominee_name: r.nomineeName ?? "",
    nominee_relation: r.nomineeRelation ?? "",
    "nominee mobile": "",
    "Address Line 1: House/Flat No, Building Name": r.addressLine1 ?? "",
    "Address Line 2: Street/Road Name": r.addressLine2 ?? "",
    "Address Line 3: Landmark / Locality": r.addressLine3 ?? "",
    "Address Line 4: Additional Details (optional)": r.addressLine4 ?? "",
    area: r.area ?? "",
    city: r.city ?? "",
    pincode: r.pincode ?? "",
    "Primary Mobile Number": String(party?.mobile ?? r.contactPhone ?? ""),
    "Secondary Mobile Number": r.mobileSecondary ?? "",
    whatsapp: r.whatsappNo ?? "",
    email: String(party?.email ?? ""),
    not_courier: r.courierStatus ?? "",
    courier_date: fmtCsvDate(r.courierDate),
    courier_address: r.courierAddress ?? "",
    pod: r.podNumber ?? r.pod ?? "",
    "courier co": r.courierCompany ?? "",
    "gen remark": r.remarks ?? "",
    "policy remar": year?.yearRemarks ?? "",
    "ref no": r.referenceNo ?? "",
    "Created at": r.createdAt.toISOString(),
    "Updated at": r.updatedAt.toISOString(),
    "policy url": formatPolicyUrl(r.policyUrl),
    url: r.policyUrl2 ?? "",
    ...buildAllMemberSlotCells(members),
    ...buildAllPaymentSlotCells(payments, year?.paymentMode),
  };

  return POLICY_CSV_HEADERS.map((h) => byHeader[h] ?? "");
}

export function buildPolicyCsvHeaderLine(): string {
  return POLICY_CSV_HEADERS.map(csvCell).join(",");
}

export function buildPolicyCsvSample(): string {
  const demo = buildPolicyCsvSampleDemoRow();
  const cells = POLICY_CSV_HEADERS.map((h) => demo[h] ?? "");
  return `\uFEFF${buildPolicyCsvHeaderLine()}\r\n${cells.map(csvCell).join(",")}\r\n`;
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
