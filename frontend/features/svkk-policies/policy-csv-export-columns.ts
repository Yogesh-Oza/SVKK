/**
 * Client catalogue for the policies CSV picker.
 * Keys and labels match GET /policies/export-columns; slot expansion is local
 * so the picker and offline export still work without the network.
 */

export const POLICY_CSV_MAX_MEMBER_SLOTS = 12;
export const POLICY_CSV_MAX_PAYMENT_SLOTS = 8;

export const POLICY_CSV_CORE_HEADERS = [
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
] as const;

export const POLICY_CSV_PREMIUM_HEADERS = [
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
  "loan_repayment",
  "loan_pending_amt",
  "cd_account_status",
  "cd_amount",
  "date_of_submission",
  "Refund Cheque Amount",
  "Refund Cheque Number",
  "Refund Cheque Date",
] as const;

export const POLICY_CSV_NOMINEE_HEADERS = [
  "nominee_name",
  "nominee_relation",
  "nominee mobile",
  "nominee_dob",
] as const;

export const POLICY_CSV_BANK_HEADERS = [
  "bank_ac_holder_name",
  "bank_ac_no",
  "bank_ifsc",
  "bank_branch",
  "bank_name",
] as const;

export const POLICY_CSV_ADDRESS_HEADERS = [
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
] as const;

export const POLICY_CSV_COURIER_HEADERS = [
  "Courier Status",
  "courier_date",
  "courier_address",
  "pod",
  "Courier Company",
] as const;

export const POLICY_CSV_REMARKS_HEADERS = [
  "gen remark",
  "policy remarK",
  "category change remark",
  "ref no",
  "Receipt No",
  "Created at",
  "Updated at",
  "policy url",
  "url",
] as const;

export const MEMBER_SLOT_FIELD_LABELS = [
  "Name",
  "DOB",
  "Relationship",
  "Gender",
  "Sum insured",
  "Basic premium",
  "Cumulative bonus",
  "Phone",
  "Age at entry",
] as const;

export type PaymentCsvFieldKey =
  | "method"
  | "mobileNumber"
  | "transactionNumber"
  | "transactionDate"
  | "transactionStatus"
  | "bankName"
  | "branch"
  | "accountNumber"
  | "nameAsPerCheque"
  | "ifscCode"
  | "notOver"
  | "dishonourReason"
  | "returnCharges"
  | "otherCharges"
  | "amountReceived";

export const PAYMENT_CSV_FIELD_LABELS: Record<PaymentCsvFieldKey, string> = {
  method: "Mode of Payment",
  mobileNumber: "Mobile Number",
  transactionNumber: "Transaction Number",
  transactionDate: "Transaction Date",
  transactionStatus: "Transaction Status",
  bankName: "Bank Name",
  branch: "Branch",
  accountNumber: "Account Number",
  nameAsPerCheque: "Name as per Cheque",
  ifscCode: "IFSC Code",
  notOver: "Not over",
  dishonourReason: "Dishonour Reason",
  returnCharges: "Return Charges",
  otherCharges: "Other Charges",
  amountReceived: "Amount Received",
};

export const PAYMENT_FIELD_ORDER: PaymentCsvFieldKey[] = [
  "method",
  "mobileNumber",
  "transactionNumber",
  "transactionDate",
  "transactionStatus",
  "bankName",
  "branch",
  "accountNumber",
  "nameAsPerCheque",
  "ifscCode",
  "notOver",
  "dishonourReason",
  "returnCharges",
  "otherCharges",
  "amountReceived",
];

const COMMISSION_HEADERS = new Set(["VKK commission", "Commission amount"]);

export type PolicyCsvExportColumn = {
  key: string;
  label: string;
  expandsTo?: string[];
};

export type PolicyCsvExportColumnGroup = {
  id: string;
  label: string;
  columns: PolicyCsvExportColumn[];
};

export function memberSlotHeader(slot: number, label: (typeof MEMBER_SLOT_FIELD_LABELS)[number]): string {
  return `Member ${slot} ${label}`;
}

export function memberJoiningHeader(slot: number): string {
  if (slot === 1) return "MEMBER 1 DATE OF JOINING";
  return `Member ${slot} Date of joining`;
}

export function paymentCsvHeader(slot: number, field: PaymentCsvFieldKey): string {
  return `Payment ${slot} ${PAYMENT_CSV_FIELD_LABELS[field]}`;
}

function leafColumn(key: string, label?: string): PolicyCsvExportColumn {
  return { key, label: label ?? key, expandsTo: [key] };
}

function toColumns(headers: readonly string[]): PolicyCsvExportColumn[] {
  return headers.map((key) => leafColumn(key));
}

function filterCommission(headers: readonly string[], includeCommission: boolean): string[] {
  if (includeCommission) return [...headers];
  return headers.filter((h) => !COMMISSION_HEADERS.has(h));
}

function paymentFieldColumns(): PolicyCsvExportColumn[] {
  return PAYMENT_FIELD_ORDER.map((field) => {
    const label = PAYMENT_CSV_FIELD_LABELS[field];
    return {
      key: `payments:${field}`,
      label,
      expandsTo: Array.from({ length: POLICY_CSV_MAX_PAYMENT_SLOTS }, (_, i) =>
        paymentCsvHeader(i + 1, field),
      ),
    };
  });
}

function memberFieldColumns(): PolicyCsvExportColumn[] {
  const standard: PolicyCsvExportColumn[] = MEMBER_SLOT_FIELD_LABELS.map((label) => ({
    key: `members:${label}`,
    label,
    expandsTo: Array.from({ length: POLICY_CSV_MAX_MEMBER_SLOTS }, (_, i) =>
      memberSlotHeader(i + 1, label),
    ),
  }));

  standard.push({
    key: "members:dateOfJoining",
    label: "Date of joining",
    expandsTo: Array.from({ length: POLICY_CSV_MAX_MEMBER_SLOTS }, (_, i) =>
      memberJoiningHeader(i + 1),
    ),
  });

  return standard;
}

/** Field labels only — same shape as GET /policies/export-columns. */
export function serializePolicyCsvExportColumnGroups(
  groups: PolicyCsvExportColumnGroup[],
): PolicyCsvExportColumnGroup[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    columns: group.columns.map(({ key, label }) => ({ key, label })),
  }));
}

export function buildPolicyCsvExportColumnGroups(options?: {
  includeCommission?: boolean;
}): PolicyCsvExportColumnGroup[] {
  const includeCommission = options?.includeCommission ?? false;
  const premium = filterCommission(POLICY_CSV_PREMIUM_HEADERS, includeCommission);

  return [
    {
      id: "policy_holder",
      label: "Policy & holder",
      columns: toColumns(POLICY_CSV_CORE_HEADERS),
    },
    {
      id: "payments",
      label: "Payments",
      columns: paymentFieldColumns(),
    },
    {
      id: "premium_financials",
      label: "Premium & financials",
      columns: toColumns(premium),
    },
    {
      id: "members",
      label: "Members",
      columns: memberFieldColumns(),
    },
    {
      id: "nominee",
      label: "Nominee",
      columns: toColumns(POLICY_CSV_NOMINEE_HEADERS),
    },
    {
      id: "bank_ac",
      label: "Bank account",
      columns: toColumns(POLICY_CSV_BANK_HEADERS),
    },
    {
      id: "address_contact",
      label: "Address & contact",
      columns: toColumns(POLICY_CSV_ADDRESS_HEADERS),
    },
    {
      id: "courier",
      label: "Courier",
      columns: toColumns(POLICY_CSV_COURIER_HEADERS),
    },
    {
      id: "remarks_meta",
      label: "Remarks & system",
      columns: toColumns(POLICY_CSV_REMARKS_HEADERS),
    },
  ].filter((g) => g.columns.length > 0);
}

export function allExportUiKeys(groups: PolicyCsvExportColumnGroup[]): string[] {
  return groups.flatMap((g) => g.columns.map((c) => c.key));
}

export function expandExportColumnSelection(
  groups: PolicyCsvExportColumnGroup[],
  selectedUiKeys: Iterable<string>,
): string[] {
  const picked = new Set(selectedUiKeys);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const col of group.columns) {
      if (!picked.has(col.key)) continue;
      const headers = col.expandsTo?.length ? col.expandsTo : [col.key];
      for (const header of headers) {
        if (seen.has(header)) continue;
        seen.add(header);
        out.push(header);
      }
    }
  }

  return out;
}

export function pickExportHeaders(
  layoutHeaders: string[],
  selectedHeaders?: string[] | null,
): string[] {
  if (!selectedHeaders?.length) return layoutHeaders;
  const picked = new Set(selectedHeaders);
  return layoutHeaders.filter((h) => picked.has(h));
}

export function sanitizeSelectedExportHeaders(
  selectedHeaders: string[],
  includeCommission: boolean,
): string[] {
  if (includeCommission) return selectedHeaders;
  return selectedHeaders.filter((h) => !COMMISSION_HEADERS.has(h));
}

export function buildPolicyCsvExportLayoutHeaders(
  maxMembers: number,
  maxPayments: number,
  includeCommission: boolean,
): string[] {
  const members = Math.min(Math.max(maxMembers, 1), POLICY_CSV_MAX_MEMBER_SLOTS);
  const payments = Math.min(Math.max(maxPayments, 1), POLICY_CSV_MAX_PAYMENT_SLOTS);

  const paymentHeaders: string[] = [];
  for (let slot = 1; slot <= payments; slot++) {
    for (const field of PAYMENT_FIELD_ORDER) {
      paymentHeaders.push(paymentCsvHeader(slot, field));
    }
  }

  const memberHeaders: string[] = [];
  for (let slot = 1; slot <= members; slot++) {
    for (const label of MEMBER_SLOT_FIELD_LABELS) {
      memberHeaders.push(memberSlotHeader(slot, label));
    }
    memberHeaders.push(memberJoiningHeader(slot));
  }

  return [
    ...POLICY_CSV_CORE_HEADERS,
    ...paymentHeaders,
    ...filterCommission(POLICY_CSV_PREMIUM_HEADERS, includeCommission),
    ...memberHeaders,
    ...POLICY_CSV_NOMINEE_HEADERS,
    ...POLICY_CSV_BANK_HEADERS,
    ...POLICY_CSV_ADDRESS_HEADERS,
    ...POLICY_CSV_COURIER_HEADERS,
    ...POLICY_CSV_REMARKS_HEADERS,
  ];
}
