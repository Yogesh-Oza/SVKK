import { parseRemarks } from "@/features/svkk-policies/ad-policy-detail-to-form";
import type { SvkkPolicyDetailForForm } from "@/features/svkk-policies/ad-policy-detail-to-form";
import {
  buildPolicyCsvExportColumnGroups,
  buildPolicyCsvExportLayoutHeaders,
  expandExportColumnSelection,
  memberJoiningHeader,
  memberSlotHeader,
  PAYMENT_FIELD_ORDER,
  paymentCsvHeader,
  pickExportHeaders,
  POLICY_CSV_MAX_MEMBER_SLOTS,
  POLICY_CSV_MAX_PAYMENT_SLOTS,
  sanitizeSelectedExportHeaders,
  type PaymentCsvFieldKey,
} from "@/features/svkk-policies/policy-csv-export-columns";
import type { OfflineListFilters } from "@/lib/svkk/offline/list-group-offline";
import type { OfflinePolicyListRow } from "@/lib/svkk/offline/types";
import { dateParse } from "@/lib/svkk/premium/engine";

const CSV_TIME_ZONE = "Asia/Kolkata";

function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvDateParts(d: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CSV_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { day: pick("day"), month: pick("month"), year: pick("year") };
}

function fmtCsvDate(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : dateParse(value);
  if (!d || Number.isNaN(d.getTime())) {
    const t = String(value).trim().replace(/^\t+/, "");
    return t ? `\t${t}` : "";
  }
  const { day, month, year } = csvDateParts(d);
  return `\t${day}-${month}-${year}`;
}

function fmtCsvDateTime(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CSV_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("day")}-${pick("month")}-${pick("year")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

function fmtCsvDecimal(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value).replace(/,/g, "");
}

function formatPhone(raw: string | null | undefined): string {
  if (raw == null) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  return `\t${local}`;
}

function formatAadhaar(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `\t${digits}` : trimmed;
}

function formatDigits(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 10 && /^\d[\d\s]*$/.test(trimmed)) return `\t${digits}`;
  return trimmed;
}

function formatGender(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const t = raw.trim().toUpperCase();
  if (t === "O" || t === "OTHER") return "Other";
  if (t === "M" || t === "MALE") return "Male";
  if (t === "F" || t === "FEMALE") return "Female";
  return raw.trim();
}

function formatPolicyUrl(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw.trim();
}

function cdStatus(used: boolean | null | undefined): string {
  if (used == null) return "";
  return used ? "Yes" : "No";
}

function categoryLabel(
  detail: SvkkPolicyDetailForForm | null | undefined,
  list: OfflinePolicyListRow,
): string {
  const name = detail?.category?.name?.trim() || list.categoryName?.trim();
  const key = detail?.category?.key?.trim() || list.categoryKey?.trim();
  const text = detail?.categoryText?.trim() || list.categoryText?.trim();
  return name || text || key || "";
}

function pickYear(
  detail: SvkkPolicyDetailForForm | null | undefined,
  preferredYearLabels: string[],
  listYearLabel: string,
): SvkkPolicyDetailForForm["years"][number] | undefined {
  const years = detail?.years ?? [];
  if (!years.length) return undefined;
  if (preferredYearLabels.length) {
    for (const label of preferredYearLabels) {
      const found = years.find((y) => y.yearLabel === label);
      if (found) return found;
    }
  }
  if (listYearLabel) {
    const found = years.find((y) => y.yearLabel === listYearLabel);
    if (found) return found;
  }
  return [...years].sort((a, b) => b.yearLabel.localeCompare(a.yearLabel))[0];
}

function sortPayments<T extends { createdAt?: string | Date | null; id?: string | null }>(
  payments: readonly T[],
): T[] {
  return [...payments].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return tb - ta;
    if (a.id && b.id) return b.id.localeCompare(a.id);
    return 0;
  });
}

function paymentStatus(
  payment: NonNullable<SvkkPolicyDetailForForm["years"][number]["payments"]>[number],
): string {
  const cheque = payment.cheque;
  if (cheque?.status === "DISHONOURED" || payment.status === "FAILED") return "DISHONOURED";
  if (cheque?.status === "CLEARED" || payment.status === "COMPLETED") return "CLEARED";
  if (cheque?.status === "PENDING" || payment.status === "PENDING") return "PENDING";
  return cheque?.status ?? payment.status ?? "";
}

function paymentFieldValue(
  payment: NonNullable<SvkkPolicyDetailForForm["years"][number]["payments"]>[number] | undefined,
  field: PaymentCsvFieldKey,
  yearPaymentMode: string | null | undefined,
): string {
  if (!payment) return field === "method" ? (yearPaymentMode ?? "") : "";
  const cheque = payment.cheque;
  const method = String(payment.method ?? "").toUpperCase();
  const accountOrMobile = cheque?.accountNo ?? payment.accountNumber ?? "";

  switch (field) {
    case "method":
      return String(payment.method ?? yearPaymentMode ?? "");
    case "mobileNumber":
      return method === "UPI" || method === "NEFT" ? formatPhone(accountOrMobile) : "";
    case "transactionNumber":
      return cheque?.number ?? payment.transactionNumber ?? "";
    case "transactionDate":
      return fmtCsvDate(payment.transactionDate ?? cheque?.chequeDate ?? null);
    case "transactionStatus":
      return paymentStatus(payment);
    case "bankName":
      return method === "CHQ" || method === "CHEQUE" ? (cheque?.bankName ?? payment.bankName ?? "") : "";
    case "branch":
      return method === "CHQ" || method === "CHEQUE" ? (cheque?.branch ?? payment.branchName ?? "") : "";
    case "accountNumber":
      return method === "CHQ" || method === "CHEQUE"
        ? formatDigits(cheque?.accountNo ?? payment.accountNumber ?? "")
        : "";
    case "nameAsPerCheque":
      return method === "CHQ" || method === "CHEQUE"
        ? (cheque?.nameAsPerCheque ?? payment.nameAsPerCheque ?? "")
        : "";
    case "ifscCode":
      return method === "CHQ" || method === "CHEQUE" ? (cheque?.ifsc ?? payment.ifscCode ?? "") : "";
    case "notOver":
      return method === "CHQ" || method === "CHEQUE" ? (cheque?.notOver ?? payment.notOver ?? "") : "";
    case "dishonourReason":
      return method === "CHQ" || method === "CHEQUE"
        ? (cheque?.reason ?? payment.dishonourReason ?? "")
        : "";
    case "returnCharges":
      return fmtCsvDecimal(payment.returnCharges);
    case "otherCharges":
      return fmtCsvDecimal(payment.otherCharges);
    case "amountReceived":
      return fmtCsvDecimal(payment.amount);
    default:
      return "";
  }
}

function memberCells(
  members: SvkkPolicyDetailForForm["years"][number]["members"] | undefined,
  maxMembers: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const list = members ?? [];
  for (let slot = 1; slot <= maxMembers; slot++) {
    const member = list[slot - 1];
    out[memberSlotHeader(slot, "Name")] = member?.name ?? "";
    out[memberSlotHeader(slot, "DOB")] = fmtCsvDate(member?.dob);
    out[memberSlotHeader(slot, "Relationship")] = member?.relationship ?? "";
    out[memberSlotHeader(slot, "Gender")] = formatGender(member?.gender);
    out[memberSlotHeader(slot, "Sum insured")] = fmtCsvDecimal(member?.sumInsured);
    out[memberSlotHeader(slot, "Basic premium")] = fmtCsvDecimal(member?.basicPremium);
    out[memberSlotHeader(slot, "Cumulative bonus")] = fmtCsvDecimal(member?.cumulativeBonus);
    out[memberSlotHeader(slot, "Phone")] = formatPhone(member?.memberPhone);
    out[memberSlotHeader(slot, "Age at entry")] =
      member?.ageAtEntry != null ? String(member.ageAtEntry) : "";
    out[memberJoiningHeader(slot)] = fmtCsvDate(member?.dateOfJoining);
  }
  return out;
}

function paymentCells(
  payments: NonNullable<SvkkPolicyDetailForForm["years"][number]["payments"]> | undefined,
  maxPayments: number,
  yearPaymentMode: string | null | undefined,
): Record<string, string> {
  const ordered = sortPayments(payments ?? []);
  const out: Record<string, string> = {};
  for (let slot = 1; slot <= maxPayments; slot++) {
    const payment = ordered[slot - 1];
    for (const field of PAYMENT_FIELD_ORDER) {
      out[paymentCsvHeader(slot, field)] = paymentFieldValue(payment, field, yearPaymentMode);
    }
  }
  return out;
}

function holderJoiningYear(
  detail: SvkkPolicyDetailForForm | null | undefined,
  year: SvkkPolicyDetailForForm["years"][number] | undefined,
): string {
  const fromYear = year?.holderJoiningYear?.trim();
  if (fromYear) return fromYear;
  const d = dateParse(detail?.holderJoiningDate);
  return d ? String(d.getFullYear()) : "";
}

function remarkCells(remarks: string | null | undefined): {
  genRemark: string;
  policyRemark: string;
  categoryChangeRemark: string;
} {
  const parsed = parseRemarks(remarks);
  return {
    genRemark: parsed.generalRemark,
    policyRemark: parsed.policyChangeRemark,
    categoryChangeRemark: parsed.categoryChangeRemark,
  };
}

function buildRowCells(
  list: OfflinePolicyListRow,
  detail: SvkkPolicyDetailForForm | null | undefined,
  preferredYearLabels: string[],
  maxMembers: number,
  maxPayments: number,
): Record<string, string> {
  const year = pickYear(detail, preferredYearLabels, list.yearLabel || list.periodYearText || "");
  const party = detail?.insuredParty;
  const remarks = remarkCells(detail?.remarks ?? list.remarks);

  return {
    year: detail?.periodYearText ?? year?.yearLabel ?? list.periodYearText ?? list.yearLabel ?? "",
    month: detail?.periodMonthText ?? list.periodMonthText ?? "",
    grouping: detail?.policyGrouping ?? list.policyGrouping ?? "",
    "Customer ID": party?.customerId ?? list.customerId ?? "",
    "SVKK ID": party?.svkkPublicId ?? list.svkkId ?? "",
    "Holder name": detail?.holderName?.trim() || party?.name || list.holderName || "",
    "Holder PAN": detail?.holderPan ?? party?.pan ?? list.pan ?? "",
    "Holder Aadhaar": formatAadhaar(detail?.holderAadhaarNo ?? party?.aadhaarNo),
    "previous policy no": detail?.previousPolicyNo ?? list.previousPolicyNo ?? "",
    "PRE. END DATE": fmtCsvDate(detail?.previousEndDate),
    "policy no": detail?.policyNo ?? list.policyNo ?? "",
    "Policy start": fmtCsvDate(year?.policyStart),
    "Policy end": fmtCsvDate(year?.policyEnd),
    "Person Count*":
      detail?.personsInsuredCount != null
        ? String(detail.personsInsuredCount)
        : list.personsInsuredCount != null
          ? String(list.personsInsuredCount)
          : "",
    "Insurance company": detail?.insuranceCompany ?? "",
    TPA: detail?.tpa ?? "",
    "Product Type": detail?.policyType?.name ?? list.policyTypeName ?? "",
    Village: detail?.village ?? list.village ?? "",
    Category: categoryLabel(detail, list),
    "Holder DOB": fmtCsvDate(detail?.holderDateOfBirth ?? party?.dateOfBirth),
    "Holder gender": formatGender(detail?.holderGender),
    "Holder age": detail?.holderAge != null ? String(detail.holderAge) : "",
    "Holder relationship": detail?.holderRelationship ?? "",
    "Persons insured":
      detail?.personsInsuredCount != null
        ? String(detail.personsInsuredCount)
        : list.personsInsuredCount != null
          ? String(list.personsInsuredCount)
          : "",
    "Sum insured": fmtCsvDecimal(year?.sumInsured ?? list.sumInsured),
    "holder cumulative bonus": fmtCsvDecimal(year?.holderCumulativeBonus),
    "holder joining year": holderJoiningYear(detail, year),
    "holder basic premium": fmtCsvDecimal(year?.holderBasicPremium),
    "Gross premium": fmtCsvDecimal(year?.grossPremium),
    "Tax %": fmtCsvDecimal(year?.taxPercent),
    "Tax amount": fmtCsvDecimal(year?.taxAmount),
    "SVKK premium": fmtCsvDecimal(year?.svkkPremium ?? year?.vkkPremium ?? list.vkkPremium),
    "Net premium": fmtCsvDecimal(year?.netPremium ?? year?.expectedNetPremium),
    "VKK commission": fmtCsvDecimal(year?.vkkCommission),
    "Commission amount": fmtCsvDecimal(year?.commissionAmount),
    "Policy Holder Premium": fmtCsvDecimal(year?.yearPolicyHolderPremium),
    "Two lac floater": fmtCsvDecimal(year?.twoLacFloater ?? year?.premiumOneOrTwoLakh),
    "Gaam mahajan contribution": fmtCsvDecimal(year?.gaamMahajanContribution ?? year?.gaamMahajanVkk),
    "Excess / short": fmtCsvDecimal(year?.excessShortAmount),
    "Diff paid by holder": fmtCsvDecimal(year?.diffPaidByHolder ?? year?.differenceAmountPaidByHolder),
    loan_status: detail?.loanStatus ?? "",
    loan_amt: fmtCsvDecimal(detail?.loanAmount),
    loan_repayment: fmtCsvDecimal(detail?.loanRepaymentAmount),
    loan_pending_amt: fmtCsvDecimal(detail?.loanPendingAmount),
    cd_account_status: cdStatus(detail?.cdAccountUsed),
    cd_amount: fmtCsvDecimal(detail?.cdAmount),
    date_of_submission: fmtCsvDate(detail?.dateOfSubmission),
    "Refund Cheque Amount": fmtCsvDecimal(detail?.refundChequeAmount),
    "Refund Cheque Number": detail?.refundChequeNo ?? "",
    "Refund Cheque Date": fmtCsvDate(detail?.refundChequeDate),
    nominee_name: detail?.nomineeName ?? "",
    nominee_relation: detail?.nomineeRelation ?? "",
    "nominee mobile": formatPhone(detail?.contactPhone),
    nominee_dob: fmtCsvDate(detail?.nomineeDateOfBirth),
    bank_ac_holder_name: detail?.policyBankHolderName ?? "",
    bank_ac_no: detail?.policyBankAccountNo ?? "",
    bank_ifsc: detail?.policyBankIfsc ?? "",
    bank_branch: detail?.policyBankBranch ?? "",
    bank_name: detail?.policyBankName ?? "",
    "Address Line 1: House/Flat No, Building Name": detail?.addressLine1 ?? "",
    "Address Line 2: Street/Road Name": detail?.addressLine2 ?? "",
    "Address Line 3: Landmark / Locality": detail?.addressLine3 ?? "",
    "Address Line 4: Additional Details (optional)": detail?.addressLine4 ?? "",
    area: detail?.area ?? list.area ?? "",
    city: detail?.city ?? "",
    pincode: detail?.pincode ?? "",
    "Primary Mobile Number": formatPhone(party?.mobile ?? list.mobile),
    "Secondary Mobile Number": formatPhone(detail?.mobileSecondary),
    whatsapp: formatPhone(detail?.whatsappNo ?? list.whatsappNo),
    email: party?.email ?? list.email ?? "",
    "Courier Status": detail?.courierStatus ?? "",
    courier_date: fmtCsvDate(detail?.courierDate),
    courier_address: detail?.courierAddress ?? "",
    pod: detail?.podNumber ?? "",
    "Courier Company": detail?.courierCompany ?? "",
    "gen remark": remarks.genRemark,
    "policy remarK": remarks.policyRemark,
    "category change remark": remarks.categoryChangeRemark,
    "ref no": detail?.referenceNo ?? list.referenceNo ?? "",
    "Receipt No": "",
    "Created at": fmtCsvDateTime(list.createdAt),
    "Updated at": fmtCsvDateTime(detail?.updatedAt ?? list.updatedAt),
    "policy url": formatPolicyUrl(detail?.policyUrl),
    url: detail?.policyUrl2 ?? "",
    ...memberCells(year?.members, maxMembers),
    ...paymentCells(year?.payments, maxPayments, year?.paymentMode),
  };
}

export function buildOfflinePoliciesCsv(input: {
  rows: OfflinePolicyListRow[];
  detailsById: Map<string, SvkkPolicyDetailForForm>;
  selectedUiKeys?: string[];
  includeCommission?: boolean;
  preferredYearLabels?: string[];
}): string {
  const includeCommission = input.includeCommission ?? false;
  const groups = buildPolicyCsvExportColumnGroups({ includeCommission });
  const selectedHeaders = input.selectedUiKeys?.length
    ? sanitizeSelectedExportHeaders(
        expandExportColumnSelection(groups, input.selectedUiKeys),
        includeCommission,
      )
    : null;

  let maxMembers = 1;
  let maxPayments = 1;
  for (const row of input.rows) {
    const year = pickYear(
      input.detailsById.get(row.id),
      input.preferredYearLabels ?? [],
      row.yearLabel || row.periodYearText || "",
    );
    maxMembers = Math.max(maxMembers, year?.members?.length ?? 0);
    maxPayments = Math.max(maxPayments, year?.payments?.length ?? 0);
  }
  maxMembers = Math.min(Math.max(maxMembers, 1), POLICY_CSV_MAX_MEMBER_SLOTS);
  maxPayments = Math.min(Math.max(maxPayments, 1), POLICY_CSV_MAX_PAYMENT_SLOTS);

  const layout = buildPolicyCsvExportLayoutHeaders(maxMembers, maxPayments, includeCommission);
  const headers = pickExportHeaders(layout, selectedHeaders);
  const lines = [headers.map(csvCell).join(",")];

  for (const row of input.rows) {
    const cells = buildRowCells(
      row,
      input.detailsById.get(row.id),
      input.preferredYearLabels ?? [],
      maxMembers,
      maxPayments,
    );
    lines.push(headers.map((h) => csvCell(cells[h] ?? "")).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsvText(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export async function exportCachedPoliciesCsv(input: {
  search?: string;
  filters?: OfflineListFilters;
  sort?: string;
  selectedUiKeys: string[];
  includeCommission: boolean;
}): Promise<{ rowCount: number; truncated: boolean; filename: string }> {
  const { loadOfflinePoliciesForCsvExport } = await import("@/lib/svkk/offline/policy-data");
  const { rows, detailsById, truncated } = await loadOfflinePoliciesForCsvExport({
    search: input.search,
    filters: input.filters,
    sort: input.sort,
  });
  if (!rows.length) {
    throw new Error("No cached policies match the current filters. Download policies for offline use first.");
  }

  const csv = buildOfflinePoliciesCsv({
    rows,
    detailsById,
    selectedUiKeys: input.selectedUiKeys,
    includeCommission: input.includeCommission,
    preferredYearLabels: input.filters?.periodYears,
  });

  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const filename = `policies-export-${stamp}.csv`;
  downloadCsvText(filename, csv);
  return { rowCount: rows.length, truncated, filename };
}
