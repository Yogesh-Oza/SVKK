import type { Prisma } from "@prisma/client";
import { PayMethod, ChequeStatus } from "@prisma/client";
import type { PolicyMemberReplaceRow, PaymentReplaceRow } from "./policy.schemas.js";
import type { PolicyExportRow } from "./policy.export-csv.js";
import { fmtCsvDate, fmtCsvDecimal } from "./policy-csv-utils.js";
import { getCsvField } from "./policy-csv-parse.js";

export const POLICY_CSV_MAX_MEMBER_SLOTS = 12;
export const POLICY_CSV_MAX_PAYMENT_SLOTS = 8;

/** Sample CSV uses flat headers only (Member 1 in flat block). */
export const POLICY_CSV_SAMPLE_MEMBER_SLOTS = 1;
export const POLICY_CSV_SAMPLE_PAYMENT_SLOTS = 1;

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

type MemberSlotFieldKey =
  | "name"
  | "dob"
  | "relationship"
  | "gender"
  | "sumInsured"
  | "basicPremium"
  | "cumulativeBonus"
  | "memberPhone"
  | "ageAtEntry"
  | "dateOfJoining";

const MEMBER_LABEL_TO_KEY: Record<(typeof MEMBER_SLOT_FIELD_LABELS)[number], MemberSlotFieldKey> = {
  Name: "name",
  DOB: "dob",
  Relationship: "relationship",
  Gender: "gender",
  "Sum insured": "sumInsured",
  "Basic premium": "basicPremium",
  "Cumulative bonus": "cumulativeBonus",
  Phone: "memberPhone",
  "Age at entry": "ageAtEntry",
};

/** Canonical v2 header for member slot (slot 1 lives in flat block). */
export function memberSlotHeader(slot: number, label: (typeof MEMBER_SLOT_FIELD_LABELS)[number]): string {
  return `Member ${slot} ${label}`;
}

/** Legacy Member 3 headers (deprecated; import aliases only). */
export function legacyMember3Header(label: (typeof MEMBER_SLOT_FIELD_LABELS)[number]): string {
  if (label === "Name") return "Member 3 Name";
  if (label === "DOB") return "Member 3 DOB";
  if (label === "Relationship") return "Member 3 Relationship";
  if (label === "Gender") return "Member 3 Gender";
  if (label === "Sum insured") return "Member 3 Sum insured";
  if (label === "Basic premium") return "Member 3 Basic premium";
  if (label === "Cumulative bonus") return "Member 3 Cumulative bonus";
  if (label === "Phone") return "Member 3 Phone";
  if (label === "Age at entry") return "Member 3 Age at entry";
  return memberSlotHeader(3, label);
}

export function memberJoiningHeader(slot: number): string {
  if (slot === 1) return "MEMBER 1 DATE OF JOINING";
  return `Member ${slot} Date of joining`;
}

const LEGACY_MEMBER3_JOINING = "member_date_of_joining1";

/** Extended member columns: slots 2–12 (slot 1 is in flat block). */
export function buildExtendedMemberHeaders(maxSlots = POLICY_CSV_MAX_MEMBER_SLOTS): string[] {
  const headers: string[] = [];
  for (let slot = 2; slot <= maxSlots; slot++) {
    for (const label of MEMBER_SLOT_FIELD_LABELS) {
      headers.push(memberSlotHeader(slot, label));
    }
    headers.push(memberJoiningHeader(slot));
  }
  return headers;
}

export const PAYMENT_SLOT_FIELD_KEYS = [
  "amount",
  "method",
  "transactionNumber",
  "transactionDate",
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
] as const;

export type PaymentSlotFieldKey = (typeof PAYMENT_SLOT_FIELD_KEYS)[number];

const PAYMENT_FIELD_LABEL: Record<PaymentSlotFieldKey, string> = {
  amount: "amount",
  method: "method",
  transactionNumber: "transaction number",
  transactionDate: "transaction date",
  policy_cheque_no: "policy_cheque_no",
  bank: "bank",
  account_no: "account_no",
  branch: "branch",
  name_as_per_cheque: "name_as_per_cheque",
  ifsc: "ifsc",
  not_over: "not_over",
  cheque_date: "cheque_date",
  cheque_status: "cheque_status",
  reason_dishonoured: "reason_dishonoured",
  "return charge": "return charge",
  "other carges": "other carges",
};

/** Payment 1 uses unprefixed legacy column names in flat block. */
export function paymentSlotHeader(slot: number, field: PaymentSlotFieldKey): string {
  const label = PAYMENT_FIELD_LABEL[field];
  if (slot === 1) {
    if (field === "method") return "mode of payment";
    return label;
  }
  return `Payment ${slot} ${label}`;
}

export function buildExtendedPaymentHeaders(maxSlots = POLICY_CSV_MAX_PAYMENT_SLOTS): string[] {
  const headers: string[] = [];
  for (let slot = 2; slot <= maxSlots; slot++) {
    for (const field of PAYMENT_SLOT_FIELD_KEYS) {
      headers.push(paymentSlotHeader(slot, field));
    }
  }
  return headers;
}

type YearMember = PolicyExportRow["years"][number]["members"][number];
type YearPayment = PolicyExportRow["years"][number]["payments"][number];

export function memberSlotCells(
  member: YearMember | undefined,
  slot: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of MEMBER_SLOT_FIELD_LABELS) {
    const key = MEMBER_LABEL_TO_KEY[label];
    out[memberSlotHeader(slot, label)] = memberFieldValue(member, key);
  }
  out[memberJoiningHeader(slot)] = memberFieldValue(member, "dateOfJoining");
  return out;
}

function memberFieldValue(member: YearMember | undefined, key: MemberSlotFieldKey): string {
  if (!member) return "";
  switch (key) {
    case "name":
    case "relationship":
    case "gender":
    case "memberPhone":
      return member[key] ?? "";
    case "dob":
    case "dateOfJoining":
      return fmtCsvDate(member[key]);
    case "sumInsured":
    case "basicPremium":
    case "cumulativeBonus":
      return fmtCsvDecimal(member[key]);
    case "ageAtEntry":
      return member.ageAtEntry != null ? String(member.ageAtEntry) : "";
    default:
      return "";
  }
}

export function paymentSlotCells(
  payment: YearPayment | undefined,
  slot: number,
  yearPaymentMode?: string | null,
): Record<string, string> {
  const cheque = payment?.cheque;
  const out: Record<string, string> = {};
  const set = (field: PaymentSlotFieldKey, value: string) => {
    out[paymentSlotHeader(slot, field)] = value;
  };

  if (slot === 1) {
    set("method", yearPaymentMode ?? "");
  }

  if (!payment) {
    for (const field of PAYMENT_SLOT_FIELD_KEYS) {
      if (slot === 1 && field === "method") continue;
      set(field, "");
    }
    return out;
  }

  set("amount", fmtCsvDecimal(payment.amount));
  if (slot > 1) set("method", payment.method);
  set("transactionNumber", payment.transactionNumber ?? "");
  set("transactionDate", fmtCsvDate(payment.transactionDate));
  set("policy_cheque_no", cheque?.number ?? payment.transactionNumber ?? "");
  set("bank", cheque?.bankName ?? payment.bankName ?? "");
  set("account_no", cheque?.accountNo ?? payment.accountNumber ?? "");
  set("branch", cheque?.branch ?? payment.branchName ?? "");
  set("name_as_per_cheque", cheque?.nameAsPerCheque ?? payment.nameAsPerCheque ?? "");
  set("ifsc", cheque?.ifsc ?? payment.ifscCode ?? "");
  set("not_over", cheque?.notOver ?? payment.notOver ?? "");
  set("cheque_date", fmtCsvDate(cheque?.chequeDate ?? payment.transactionDate));
  set("cheque_status", cheque?.status ?? payment.status ?? "");
  set("reason_dishonoured", cheque?.reason ?? payment.dishonourReason ?? "");
  set("return charge", fmtCsvDecimal(payment.returnCharges));
  set("other carges", fmtCsvDecimal(payment.otherCharges));
  return out;
}

/** Flat block: member slot 1 only. */
export function buildFlatMember1Cells(members: YearMember[]): Record<string, string> {
  return memberSlotCells(members[0], 1);
}

/** Extended block: member slots 2–12. */
export function buildExtendedMemberSlotCells(members: YearMember[]): Record<string, string> {
  const cells: Record<string, string> = {};
  for (let slot = 2; slot <= POLICY_CSV_MAX_MEMBER_SLOTS; slot++) {
    Object.assign(cells, memberSlotCells(members[slot - 1], slot));
  }
  return cells;
}

export function buildAllPaymentSlotCells(
  payments: YearPayment[],
  yearPaymentMode?: string | null,
): Record<string, string> {
  const cells: Record<string, string> = {};
  for (let slot = 1; slot <= POLICY_CSV_MAX_PAYMENT_SLOTS; slot++) {
    Object.assign(cells, paymentSlotCells(payments[slot - 1], slot, yearPaymentMode));
  }
  return cells;
}

function getMemberFieldFromMap(
  map: Map<string, string>,
  slot: number,
  label: (typeof MEMBER_SLOT_FIELD_LABELS)[number],
): string {
  const canonical = getCsvField(map, memberSlotHeader(slot, label));
  if (canonical) return canonical;
  if (slot === 1) {
    return getCsvField(map, legacyMember3Header(label));
  }
  return "";
}

function getMemberJoiningFromMap(map: Map<string, string>, slot: number): string {
  const canonical = getCsvField(map, memberJoiningHeader(slot));
  if (canonical) return canonical;
  if (slot === 1) return getCsvField(map, LEGACY_MEMBER3_JOINING);
  return "";
}

/** Detect deprecated column headers present in CSV. */
export function collectDeprecatedHeaderWarnings(header: string[]): string[] {
  const normalized = new Set(header.map((h) => h.trim().toLowerCase()));
  const warnings: string[] = [];
  if (normalized.has("member 3 name")) {
    warnings.push("Deprecated column 'Member 3 Name' — migrate to 'Member 1 Name'");
  }
  if (normalized.has("member_date_of_joining1")) {
    warnings.push("Deprecated column 'member_date_of_joining1' — migrate to 'MEMBER 1 DATE OF JOINING'");
  }
  if (normalized.has("policy remar") && !normalized.has("policy remark")) {
    warnings.push("Deprecated column 'policy remar' — migrate to 'policy remarK'");
  }
  return warnings;
}

function parsePayMethod(raw: string): PayMethod | undefined {
  const t = raw.trim().toUpperCase();
  if (!t) return undefined;
  if (t === "CHQ" || t === "CHEQUE" || t === "CHECK") return PayMethod.CHQ;
  if (t === "CASH") return PayMethod.CASH;
  if (t === "NEFT" || t === "RTGS" || t === "IMPS") return PayMethod.NEFT;
  if (t === "UPI") return PayMethod.UPI;
  const values = Object.values(PayMethod) as string[];
  if (values.includes(t)) return t as PayMethod;
  return undefined;
}

function parseChequeStatus(raw: string): ChequeStatus | undefined {
  const t = raw.trim().toUpperCase();
  if (!t) return undefined;
  if (t === "CLEARED" || t === "CLEAR") return ChequeStatus.CLEARED;
  if (t === "DISHONOURED" || t === "DISHONORED" || t === "BOUNCED") return ChequeStatus.DISHONOURED;
  if (t === "PENDING") return ChequeStatus.PENDING;
  const values = Object.values(ChequeStatus) as string[];
  if (values.includes(t)) return t as ChequeStatus;
  return undefined;
}

function parseOptionalDate(raw: string): Date | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${raw}`);
  return d;
}

function parseOptionalDecimal(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${raw}`);
  return n;
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  if (Number.isNaN(n)) throw new Error(`invalid integer: ${raw}`);
  return n;
}

function paymentFieldFromMap(
  map: Map<string, string>,
  slot: number,
  field: PaymentSlotFieldKey,
): string {
  if (slot === 1) {
    if (field === "method") return getCsvField(map, "mode of payment");
    return getCsvField(map, paymentSlotHeader(1, field));
  }
  return getCsvField(map, paymentSlotHeader(slot, field));
}

export function collectMembersFromCsvMap(
  map: Map<string, string>,
): PolicyMemberReplaceRow[] {
  const members: PolicyMemberReplaceRow[] = [];
  for (let slot = 1; slot <= POLICY_CSV_MAX_MEMBER_SLOTS; slot++) {
    const name = getMemberFieldFromMap(map, slot, "Name");
    if (!name) continue;
    const dobRaw = getMemberFieldFromMap(map, slot, "DOB");
    members.push({
      name,
      dob: parseOptionalDate(dobRaw) ?? new Date("1970-01-01"),
      relationship: getMemberFieldFromMap(map, slot, "Relationship") || "Other",
      gender: getMemberFieldFromMap(map, slot, "Gender") || "Other",
      sumInsured: parseOptionalDecimal(getMemberFieldFromMap(map, slot, "Sum insured")),
      cumulativeBonus: parseOptionalDecimal(
        getMemberFieldFromMap(map, slot, "Cumulative bonus"),
      ),
      basicPremium: parseOptionalDecimal(getMemberFieldFromMap(map, slot, "Basic premium")),
      memberPhone: getMemberFieldFromMap(map, slot, "Phone") || null,
      ageAtEntry: parseOptionalInt(getMemberFieldFromMap(map, slot, "Age at entry")),
      dateOfJoining: parseOptionalDate(getMemberJoiningFromMap(map, slot)),
    });
  }
  return members;
}

export function collectPaymentsFromCsvMap(map: Map<string, string>): PaymentReplaceRow[] {
  const payments: PaymentReplaceRow[] = [];
  for (let slot = 1; slot <= POLICY_CSV_MAX_PAYMENT_SLOTS; slot++) {
    const amountRaw = paymentFieldFromMap(map, slot, "amount");
    const methodRaw = paymentFieldFromMap(map, slot, "method");
    const chequeNo = paymentFieldFromMap(map, slot, "policy_cheque_no");
    const bank = paymentFieldFromMap(map, slot, "bank");
    if (!amountRaw && !methodRaw && !chequeNo && !bank) continue;

    const method = parsePayMethod(methodRaw) ?? (chequeNo || bank ? PayMethod.CHQ : PayMethod.CASH);
    const amount = parseOptionalDecimal(amountRaw) ?? 0;
    const status = parseChequeStatus(paymentFieldFromMap(map, slot, "cheque_status"));

    payments.push({
      amount,
      method,
      status: status ?? null,
      transactionNumber:
        paymentFieldFromMap(map, slot, "transactionNumber") || chequeNo || null,
      transactionDate:
        parseOptionalDate(paymentFieldFromMap(map, slot, "cheque_date")) ??
        parseOptionalDate(paymentFieldFromMap(map, slot, "transactionDate")) ??
        null,
      bankName: bank || null,
      branchName: paymentFieldFromMap(map, slot, "branch") || null,
      accountNumber: paymentFieldFromMap(map, slot, "account_no") || null,
      nameAsPerCheque: paymentFieldFromMap(map, slot, "name_as_per_cheque") || null,
      ifscCode: paymentFieldFromMap(map, slot, "ifsc") || null,
      notOver: paymentFieldFromMap(map, slot, "not_over") || null,
      dishonourReason: paymentFieldFromMap(map, slot, "reason_dishonoured") || null,
      returnCharges: parseOptionalDecimal(paymentFieldFromMap(map, slot, "return charge")),
      otherCharges: parseOptionalDecimal(paymentFieldFromMap(map, slot, "other carges")),
    });
  }
  return payments;
}

/** Demo row for sample CSV (flat format v2). */
export function buildPolicyCsvSampleDemoRow(): Record<string, string> {
  const cells: Record<string, string> = {
    year: "2026-27",
    month: "May",
    grouping: "Demo",
    "Customer ID": "DEMO-CUST-001",
    "SVKK ID": "DEMO-SVKK-001",
    "Holder name": "Demo Policyholder",
    "previous policy no": "PREV-DEMO-001",
    "PRE. END DATE": "2026-04-30",
    "policy no": "DEMO-POL-001",
    "Policy start": "2026-05-01",
    "Policy end": "2027-04-30",
    "Product Type": "Family Floater",
    Village: "Demo Village",
    area: "Demo Area",
    Category: "A",
    "Person Count*": "2",
    "Persons insured": "2",
    "Sum insured": "500000",
    "Primary Mobile Number": "9876543210",
    whatsapp: "9876543210",
    email: "demo@example.com",
    "ref no": "DEMO-REF-001",
    "policy remarK": "Sample import row",
  };

  cells[memberSlotHeader(1, "Name")] = "Demo Member One";
  cells[memberSlotHeader(1, "DOB")] = "1990-01-15";
  cells[memberSlotHeader(1, "Relationship")] = "Self";
  cells[memberSlotHeader(1, "Gender")] = "M";
  cells[memberSlotHeader(1, "Phone")] = "9876543210";
  cells[memberSlotHeader(1, "Age at entry")] = "36";
  cells[memberJoiningHeader(1)] = "2020-04-01";

  return cells;
}
