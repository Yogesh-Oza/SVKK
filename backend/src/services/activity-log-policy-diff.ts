export type PolicyFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

const SKIP_KEYS = new Set([
  "id",
  "policyId",
  "insuredPartyId",
  "policyTypeId",
  "policyChartId",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "version",
  "years",
  "insuredParty",
  "policyType",
  "members",
  "payments",
  "cheque",
  "chequeId",
]);

const POLICY_LABELS: Record<string, string> = {
  referenceNo: "Reference",
  policyNo: "Policy number",
  village: "Village",
  area: "Area",
  city: "City",
  remarks: "Remarks",
  policyUrl: "Document link",
  holderAge: "Holder age",
  holderGender: "Holder gender",
  whatsappNo: "WhatsApp",
  contactPhone: "Contact phone",
  nomineeDateOfBirth: "Nominee date of birth",
  loanRepaymentAmount: "Loan repayment",
  loanPendingAmount: "Loan pending amount",
  policyBankHolderName: "Bank account holder",
  policyBankAccountNo: "Bank account no.",
  policyBankIfsc: "Bank IFSC",
  policyBankBranch: "Bank branch",
  policyBankName: "Policy bank name",
  categoryText: "Category",
  personsInsuredCount: "Persons insured",
  periodYearText: "Period year",
  periodMonthText: "Period month",
  adProductVariant: "Product variant",
  listVkkPremium: "VKK premium",
};

const PARTY_LABELS: Record<string, string> = {
  name: "Holder name",
  mobile: "Holder mobile",
  email: "Holder email",
  pan: "PAN",
  svkkPublicId: "SVKK ID",
  aadhaarNo: "Aadhaar",
  customerId: "Customer ID",
  dateOfBirth: "Date of birth",
};

const YEAR_LABELS: Record<string, string> = {
  yearLabel: "Year",
  sumInsured: "Sum insured",
  grossPremium: "Gross premium",
  netPremium: "Net premium",
  taxAmount: "Tax amount",
  taxPercent: "Tax %",
  vkkPremium: "VKK premium",
  svkkPremium: "SVKK premium",
  yearRemarks: "Year remarks",
  paymentMode: "Payment mode",
  paymentType: "Payment type",
  policyStart: "Policy start",
  policyEnd: "Policy end",
  amountReceived: "Amount received",
  commissionAmount: "Commission",
  vkkCommission: "VKK commission",
  gaamMahajanVkk: "Gaam mahajan VKK",
  gaamMahajanContribution: "Contribution",
  diffPaidByHolder: "Diff paid by holder",
  yearPolicyHolderPremium: "Holder premium",
  differenceAmountPaidByHolder: "Difference paid by holder",
  excessShortAmount: "Excess / short",
  twoLacFloater: "Two lac floater",
  expectedNetPremium: "Expected net premium",
  holderBasicPremium: "Holder basic premium",
  utrRef: "UTR reference",
  bankName: "Bank name",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "—";
  if (typeof v === "string") {
    if (v.startsWith("[") && v.includes("http")) {
      try {
        const arr = JSON.parse(v) as unknown[];
        if (Array.isArray(arr)) return `${arr.length} document(s)`;
      } catch {
        /* fall through */
      }
    }
    if (v.length > 120) return `${v.slice(0, 117)}…`;
    return v;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return `${v.length} item(s)`;
  return "—";
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return formatValue(a) === formatValue(b);
}

function summarizePayments(payments: unknown): string {
  if (!Array.isArray(payments) || payments.length === 0) return "—";
  const parts = payments.map((p) => {
    const row = asRecord(p);
    if (!row) return "payment";
    const method = typeof row.method === "string" ? row.method : "—";
    const amount = row.amount != null ? String(row.amount) : "—";
    const status = typeof row.status === "string" ? row.status : "";
    return status ? `${method} ${amount} (${status})` : `${method} ${amount}`;
  });
  return `${payments.length} payment(s): ${parts.join("; ")}`;
}

function summarizeMembers(members: unknown): string {
  if (!Array.isArray(members) || members.length === 0) return "—";
  return `${members.length} member(s)`;
}

function pickYear(
  policy: Record<string, unknown> | null,
  yearLabel?: string,
): Record<string, unknown> | null {
  if (!policy) return null;
  const years = policy.years;
  if (!Array.isArray(years) || years.length === 0) return null;
  if (yearLabel) {
    for (const y of years) {
      const yr = asRecord(y);
      if (yr?.yearLabel === yearLabel) return yr;
    }
  }
  return asRecord(years[0]);
}

function flattenPolicySnapshot(
  payload: unknown,
  yearLabelHint?: string,
): Map<string, { label: string; value: unknown }> {
  const raw = asRecord(payload);
  if (!raw) return new Map();

  const policy = asRecord(raw.policy) ?? raw;
  const party = asRecord(policy.insuredParty);
  const yearLabel = pickStr(raw.yearLabel, yearLabelHint);
  const year = pickYear(policy, yearLabel ?? undefined);

  const map = new Map<string, { label: string; value: unknown }>();

  const add = (prefix: string, key: string, label: string, value: unknown) => {
    if (SKIP_KEYS.has(key)) return;
    map.set(`${prefix}.${key}`, { label, value });
  };

  for (const [key, value] of Object.entries(policy)) {
    if (SKIP_KEYS.has(key)) continue;
    const label = POLICY_LABELS[key];
    if (label) add("policy", key, label, value);
  }

  if (party) {
    for (const [key, value] of Object.entries(party)) {
      if (SKIP_KEYS.has(key)) continue;
      const label = PARTY_LABELS[key];
      if (label) add("party", key, label, value);
    }
  }

  if (year) {
    for (const [key, value] of Object.entries(year)) {
      if (SKIP_KEYS.has(key)) continue;
      const label = YEAR_LABELS[key];
      if (label) add("year", key, label, value);
    }
  }

  return map;
}

/** Human-readable diff of policy update snapshots; only changed fields. */
export function computePolicyFieldChanges(
  beforeData: unknown,
  afterData: unknown,
): PolicyFieldChange[] {
  const beforeRaw = asRecord(beforeData);
  const afterRaw = asRecord(afterData);
  const yearLabel = pickStr(afterRaw?.yearLabel, beforeRaw?.yearLabel);

  const beforeMap = flattenPolicySnapshot(beforeData, yearLabel);
  const afterMap = flattenPolicySnapshot(afterData, yearLabel);

  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: PolicyFieldChange[] = [];

  for (const key of keys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    const beforeVal = b?.value;
    const afterVal = a?.value;
    if (valuesEqual(beforeVal, afterVal)) continue;

    const label = a?.label ?? b?.label ?? key;
    changes.push({
      field: key,
      label,
      before: formatValue(beforeVal),
      after: formatValue(afterVal),
    });
  }

  const beforePolicy = asRecord(asRecord(beforeData)?.policy) ?? asRecord(beforeData);
  const afterPolicy = asRecord(asRecord(afterData)?.policy) ?? asRecord(afterData);
  const beforeYear = pickYear(beforePolicy, yearLabel ?? undefined);
  const afterYear = pickYear(afterPolicy, yearLabel ?? undefined);

  const beforePayments = summarizePayments(beforeYear?.payments);
  const afterPayments = summarizePayments(afterYear?.payments);
  if (beforePayments !== afterPayments) {
    changes.push({
      field: "year.payments",
      label: "Payments",
      before: beforePayments,
      after: afterPayments,
    });
  }

  const beforeMembers = summarizeMembers(beforeYear?.members);
  const afterMembers = summarizeMembers(afterYear?.members);
  if (beforeMembers !== afterMembers) {
    changes.push({
      field: "year.members",
      label: "Insured members",
      before: beforeMembers,
      after: afterMembers,
    });
  }

  return changes.sort((x, y) => x.label.localeCompare(y.label));
}
