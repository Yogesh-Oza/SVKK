import {
  POLICY_CSV_FLAT_CORE_HEADERS,
  POLICY_CSV_FLAT_PREMIUM_HEADERS,
  POLICY_CSV_FLAT_TAIL_HEADERS,
} from "./policy-csv-export-layout.js";
import {
  buildWidestPaymentExportPlan,
  PAYMENT_CSV_FIELD_LABELS,
  type PaymentCsvFieldKey,
} from "./policy-csv-payment-columns.js";
import {
  MEMBER_SLOT_FIELD_LABELS,
  memberJoiningHeader,
  memberSlotHeader,
  POLICY_CSV_MAX_MEMBER_SLOTS,
  POLICY_CSV_MAX_PAYMENT_SLOTS,
} from "./policy-csv-slots.js";

const COMMISSION_HEADERS = new Set(["VKK commission", "Commission amount"]);

const PAYMENT_FIELD_ORDER: PaymentCsvFieldKey[] = [
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

const NOMINEE_HEADERS = ["nominee_name", "nominee_relation", "nominee mobile"] as const;

const ADDRESS_CONTACT_HEADERS = [
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

const COURIER_HEADERS = [
  "Courier Status",
  "courier_date",
  "courier_address",
  "pod",
  "Courier Company",
] as const;

const REMARKS_META_HEADERS = [
  "gen remark",
  "policy remarK",
  "category change remark",
  "ref no",
  "Created at",
  "Updated at",
  "policy url",
  "url",
] as const;

export type PolicyCsvExportColumn = {
  key: string;
  label: string;
  description?: string;
  /** CSV headers included when this picker option is selected. */
  expandsTo: string[];
};

export type PolicyCsvExportColumnGroup = {
  id: string;
  label: string;
  columns: PolicyCsvExportColumn[];
};

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
  const plan = buildWidestPaymentExportPlan(POLICY_CSV_MAX_PAYMENT_SLOTS);
  const headersInPlan = new Set(plan.headers);

  return PAYMENT_FIELD_ORDER.filter((field) =>
    plan.headers.some((h) => h.endsWith(` ${PAYMENT_CSV_FIELD_LABELS[field]}`)),
  ).map((field) => {
    const label = PAYMENT_CSV_FIELD_LABELS[field];
    const expandsTo: string[] = [];
    for (let slot = 1; slot <= POLICY_CSV_MAX_PAYMENT_SLOTS; slot++) {
      const header = `Payment ${slot} ${label}`;
      if (headersInPlan.has(header)) expandsTo.push(header);
    }
    return {
      key: `payments:${field}`,
      label,
      expandsTo,
    };
  });
}

function memberFieldColumns(): PolicyCsvExportColumn[] {
  // Widen `label` to `PolicyCsvExportColumn["label"]` so we can extend with
  // additional non-slot fields (e.g. "Date of joining") without TS rejecting it.
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

/** Client picker payload — field labels only; slot expansion stays server-side. */
export function serializePolicyCsvExportColumnGroups(
  groups: PolicyCsvExportColumnGroup[],
): Array<{ id: string; label: string; columns: Array<{ key: string; label: string }> }> {
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    columns: group.columns.map(({ key, label }) => ({ key, label })),
  }));
}

/** Widest export column catalogue for the policies CSV picker (grouped for UI). */
export function buildPolicyCsvExportColumnGroups(options?: {
  includeCommission?: boolean;
}): PolicyCsvExportColumnGroup[] {
  const includeCommission = options?.includeCommission ?? false;
  const premium = filterCommission(POLICY_CSV_FLAT_PREMIUM_HEADERS, includeCommission);
  const tailSet = new Set<string>([
    ...NOMINEE_HEADERS,
    ...ADDRESS_CONTACT_HEADERS,
    ...COURIER_HEADERS,
    ...REMARKS_META_HEADERS,
  ]);

  const groups: PolicyCsvExportColumnGroup[] = [
    {
      id: "policy_holder",
      label: "Policy & holder",
      columns: toColumns(POLICY_CSV_FLAT_CORE_HEADERS),
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
      columns: toColumns(NOMINEE_HEADERS),
    },
    {
      id: "address_contact",
      label: "Address & contact",
      columns: toColumns(ADDRESS_CONTACT_HEADERS),
    },
    {
      id: "courier",
      label: "Courier",
      columns: toColumns(COURIER_HEADERS),
    },
    {
      id: "remarks_meta",
      label: "Remarks & system",
      columns: toColumns(REMARKS_META_HEADERS),
    },
  ];

  const assigned = new Set(expandExportColumnSelection(groups, allPolicyCsvExportUiKeys(groups)));
  const orphans = POLICY_CSV_FLAT_TAIL_HEADERS.filter((h) => tailSet.has(h) && !assigned.has(h));
  if (orphans.length) {
    groups.push({ id: "other", label: "Other", columns: toColumns(orphans) });
  }

  return groups.filter((g) => g.columns.length > 0);
}

/** UI checkbox keys shown in the export picker. */
export function allPolicyCsvExportUiKeys(groups: PolicyCsvExportColumnGroup[]): string[] {
  return groups.flatMap((g) => g.columns.map((c) => c.key));
}

/** All CSV headers covered by the picker catalogue. */
export function allPolicyCsvExportHeaderKeys(groups: PolicyCsvExportColumnGroup[]): string[] {
  return expandExportColumnSelection(groups, allPolicyCsvExportUiKeys(groups));
}

/** @deprecated Use allPolicyCsvExportUiKeys or allPolicyCsvExportHeaderKeys. */
export function allPolicyCsvExportColumnKeys(groups: PolicyCsvExportColumnGroup[]): string[] {
  return allPolicyCsvExportUiKeys(groups);
}

/** Map selected picker keys to CSV header names (deduped, picker order). */
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
      for (const header of col.expandsTo) {
        if (seen.has(header)) continue;
        seen.add(header);
        out.push(header);
      }
    }
  }

  return out;
}

/** Keep canonical export order; drop unknown or unavailable headers. */
export function pickExportHeaders(
  layoutHeaders: string[],
  selectedHeaders?: string[] | null,
): string[] {
  if (!selectedHeaders?.length) return layoutHeaders;
  const picked = new Set(selectedHeaders);
  return layoutHeaders.filter((h) => picked.has(h));
}

/** Strip commission columns when the caller lacks permission. */
export function sanitizeSelectedExportHeaders(
  selectedHeaders: string[],
  includeCommission: boolean,
): string[] {
  if (includeCommission) return selectedHeaders;
  return selectedHeaders.filter((h) => !COMMISSION_HEADERS.has(h));
}
