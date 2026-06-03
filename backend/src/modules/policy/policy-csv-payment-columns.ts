import { PayMethod } from "@prisma/client";
import type { PaymentReplaceRow } from "./policy.schemas.js";
import type { PolicyExportRow } from "./policy.export-csv.js";
import {
  fmtCsvDate,
  fmtCsvDecimal,
  formatDigitsForCsvExport,
  formatPhoneForCsvExport,
  parseCsvDate,
} from "./policy-csv-utils.js";
import { getCsvField } from "./policy-csv-parse.js";

export const PAYMENT_CSV_MAX_SLOTS = 8;

/** UI-aligned payment CSV field keys. */
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

const UPI_FIELD_ORDER: PaymentCsvFieldKey[] = [
  "method",
  "mobileNumber",
  "transactionNumber",
  "transactionDate",
  "transactionStatus",
  "returnCharges",
  "otherCharges",
  "amountReceived",
];

const CHEQUE_FIELD_ORDER: PaymentCsvFieldKey[] = [
  "method",
  "transactionNumber",
  "bankName",
  "branch",
  "accountNumber",
  "nameAsPerCheque",
  "ifscCode",
  "notOver",
  "transactionDate",
  "transactionStatus",
  "dishonourReason",
  "returnCharges",
  "otherCharges",
  "amountReceived",
];

const CASH_FIELD_ORDER: PaymentCsvFieldKey[] = [
  "method",
  "transactionDate",
  "transactionStatus",
  "returnCharges",
  "otherCharges",
  "amountReceived",
];

const DEFAULT_EMPTY_SLOT_FIELDS: PaymentCsvFieldKey[] = CASH_FIELD_ORDER;

type YearPayment = PolicyExportRow["years"][number]["payments"][number];

/** Newest first — matches Payment Transactions UI (Transaction 1 = latest). */
export function sortPaymentsForCsvExport<T extends { createdAt?: Date | null; id?: string | null }>(
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

export type PaymentExportPlan = {
  headers: string[];
  fieldsBySlot: PaymentCsvFieldKey[][];
};

/** Canonical header: `Payment {n} {UI label}` for every slot including 1. */
export function paymentCsvHeader(slot: number, field: PaymentCsvFieldKey): string {
  return `Payment ${slot} ${PAYMENT_CSV_FIELD_LABELS[field]}`;
}

function fieldOrderForMethod(method: PayMethod | string | null | undefined): PaymentCsvFieldKey[] {
  const m = String(method ?? "").toUpperCase();
  if (m === PayMethod.UPI || m === PayMethod.NEFT) return UPI_FIELD_ORDER;
  if (m === PayMethod.CHQ || m === "CHEQUE") return CHEQUE_FIELD_ORDER;
  if (m === PayMethod.CASH) return CASH_FIELD_ORDER;
  return DEFAULT_EMPTY_SLOT_FIELDS;
}

/** Union field lists for a slot while preserving first-seen order (batch-wide headers). */
export function unionPaymentFieldsForMethods(
  methods: Array<PayMethod | string | null | undefined>,
): PaymentCsvFieldKey[] {
  const active = methods.filter((m) => m != null && String(m).trim() !== "");
  if (active.length === 0) return DEFAULT_EMPTY_SLOT_FIELDS;

  const seen = new Set<PaymentCsvFieldKey>();
  const out: PaymentCsvFieldKey[] = [];
  for (const method of active) {
    for (const field of fieldOrderForMethod(method)) {
      if (seen.has(field)) continue;
      seen.add(field);
      out.push(field);
    }
  }
  return out;
}

/**
 * Widest payment column set for import templates (all methods × all slots).
 * Export uses {@link buildPaymentExportPlan} for data-driven columns instead.
 */
export function buildWidestPaymentExportPlan(maxPayments: number): PaymentExportPlan {
  const allMethods = [PayMethod.UPI, PayMethod.CHQ, PayMethod.CASH];
  const fields = unionPaymentFieldsForMethods(allMethods);
  const fieldsBySlot: PaymentCsvFieldKey[][] = [];
  const headers: string[] = [];

  for (let slot = 1; slot <= maxPayments; slot++) {
    fieldsBySlot.push([...fields]);
    for (const field of fields) {
      headers.push(paymentCsvHeader(slot, field));
    }
  }

  return { headers, fieldsBySlot };
}

/** Builds dynamic payment headers + per-slot field plan for an export batch. */
export function buildPaymentExportPlan(
  years: Array<{ payments?: YearPayment[] } | undefined>,
  maxPayments: number,
): PaymentExportPlan {
  const fieldsBySlot: PaymentCsvFieldKey[][] = [];
  const headers: string[] = [];

  for (let slot = 1; slot <= maxPayments; slot++) {
    const methods = years.map((year) => {
      const ordered = sortPaymentsForCsvExport(year?.payments ?? []);
      return ordered[slot - 1]?.method;
    });
    const fields = unionPaymentFieldsForMethods(methods);
    fieldsBySlot.push(fields);
    for (const field of fields) {
      headers.push(paymentCsvHeader(slot, field));
    }
  }

  return { headers, fieldsBySlot };
}

function formatPaymentStatusForCsv(
  payment: YearPayment,
  cheque: YearPayment["cheque"] | null | undefined,
): string {
  if (cheque?.status === "DISHONOURED" || payment.status === "FAILED") return "DISHONOURED";
  if (cheque?.status === "CLEARED" || payment.status === "COMPLETED") return "CLEARED";
  if (cheque?.status === "PENDING" || payment.status === "PENDING") return "PENDING";
  return cheque?.status ?? payment.status ?? "";
}

function resolvePaymentMethodLabel(
  payment: YearPayment | undefined,
  yearPaymentMode: string | null | undefined,
): string {
  if (payment?.method) return String(payment.method);
  return yearPaymentMode ?? "";
}

function extractPaymentFieldValue(
  payment: YearPayment | undefined,
  field: PaymentCsvFieldKey,
  yearPaymentMode: string | null | undefined,
): string {
  if (!payment) {
    return field === "method" ? (yearPaymentMode ?? "") : "";
  }

  const cheque = payment.cheque;
  const method = String(payment.method ?? "").toUpperCase();
  const accountOrMobile = cheque?.accountNo ?? payment.accountNumber ?? "";

  switch (field) {
    case "method":
      return resolvePaymentMethodLabel(payment, yearPaymentMode);
    case "mobileNumber":
      return method === PayMethod.UPI || method === PayMethod.NEFT
        ? formatPhoneForCsvExport(accountOrMobile)
        : "";
    case "transactionNumber":
      return cheque?.number ?? payment.transactionNumber ?? "";
    case "transactionDate":
      return fmtCsvDate(payment.transactionDate);
    case "transactionStatus":
      return formatPaymentStatusForCsv(payment, cheque);
    case "bankName":
      return method === PayMethod.CHQ ? (cheque?.bankName ?? payment.bankName ?? "") : "";
    case "branch":
      return method === PayMethod.CHQ ? (cheque?.branch ?? payment.branchName ?? "") : "";
    case "accountNumber":
      return method === PayMethod.CHQ
        ? formatDigitsForCsvExport(cheque?.accountNo ?? payment.accountNumber ?? "")
        : "";
    case "nameAsPerCheque":
      return method === PayMethod.CHQ
        ? (cheque?.nameAsPerCheque ?? payment.nameAsPerCheque ?? "")
        : "";
    case "ifscCode":
      return method === PayMethod.CHQ ? (cheque?.ifsc ?? payment.ifscCode ?? "") : "";
    case "notOver":
      return method === PayMethod.CHQ ? (cheque?.notOver ?? payment.notOver ?? "") : "";
    case "dishonourReason":
      return method === PayMethod.CHQ
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

/** Export cells for one payment slot using the batch field plan for that slot. */
export function buildPaymentCellsForSlot(
  payment: YearPayment | undefined,
  slot: number,
  fields: PaymentCsvFieldKey[],
  yearPaymentMode?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    out[paymentCsvHeader(slot, field)] = extractPaymentFieldValue(
      payment,
      field,
      yearPaymentMode ?? null,
    );
  }
  return out;
}

export function buildAllPaymentCellsForExport(
  payments: YearPayment[],
  plan: PaymentExportPlan,
  yearPaymentMode?: string | null,
): Record<string, string> {
  const ordered = sortPaymentsForCsvExport(payments);
  const cells: Record<string, string> = {};
  for (let slot = 0; slot < plan.fieldsBySlot.length; slot++) {
    Object.assign(
      cells,
      buildPaymentCellsForSlot(
        ordered[slot],
        slot + 1,
        plan.fieldsBySlot[slot] ?? [],
        yearPaymentMode,
      ),
    );
  }
  return cells;
}

/** Legacy unprefixed / snake_case import aliases for payment slot 1. */
function legacyPaymentHeaderAliases(slot: number, field: PaymentCsvFieldKey): string[] {
  if (slot !== 1) return [];
  const aliases: string[] = [];
  switch (field) {
    case "method":
      aliases.push("mode of payment", "Payment 1 method");
      break;
    case "mobileNumber":
      aliases.push("account_no");
      break;
    case "transactionNumber":
      aliases.push("transaction number", "policy_cheque_no", "Payment 1 transaction number");
      break;
    case "transactionDate":
      aliases.push("transaction date", "cheque_date", "Payment 1 transaction date");
      break;
    case "transactionStatus":
      aliases.push("cheque_status", "Payment 1 cheque_status");
      break;
    case "bankName":
      aliases.push("bank", "Payment 1 bank");
      break;
    case "branch":
      aliases.push("Payment 1 branch");
      break;
    case "accountNumber":
      aliases.push("Payment 1 account_no");
      break;
    case "nameAsPerCheque":
      aliases.push("name_as_per_cheque", "Payment 1 name_as_per_cheque");
      break;
    case "ifscCode":
      aliases.push("ifsc", "Payment 1 ifsc");
      break;
    case "notOver":
      aliases.push("not_over", "Payment 1 not_over");
      break;
    case "dishonourReason":
      aliases.push("reason_dishonoured", "Payment 1 reason_dishonoured");
      break;
    case "returnCharges":
      aliases.push("return charge", "Payment 1 return charge");
      break;
    case "otherCharges":
      aliases.push("other carges", "Payment 1 other carges");
      break;
    case "amountReceived":
      aliases.push("amount", "Payment 1 amount");
      break;
    default:
      break;
  }
  return aliases;
}

function paymentValueFromMap(
  map: Map<string, string>,
  slot: number,
  field: PaymentCsvFieldKey,
): string {
  const canonical = paymentCsvHeader(slot, field);
  const legacy = legacyPaymentHeaderAliases(slot, field);
  if (slot >= 2) {
    const oldKey = `Payment ${slot} ${field.replace(/([A-Z])/g, "_$1").toLowerCase()}`;
    return getCsvField(map, canonical, ...legacy, oldKey);
  }
  return getCsvField(map, canonical, ...legacy);
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

function parseTransactionStatus(raw: string): PaymentReplaceRow["status"] {
  const t = raw.trim().toUpperCase();
  if (t === "DISHONOURED" || t === "DISHONORED" || t === "BOUNCED" || t === "FAILED") {
    return "DISHONOURED";
  }
  if (t === "CLEARED" || t === "CLEAR" || t === "COMPLETED") return "CLEARED";
  if (t === "PENDING") return "PENDING";
  return null;
}

function parseOptionalDecimal(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`invalid number: ${raw}`);
  return n;
}

function paymentRowFromMap(map: Map<string, string>, slot: number): PaymentReplaceRow | null {
  const methodRaw = paymentValueFromMap(map, slot, "method");
  const amountRaw = paymentValueFromMap(map, slot, "amountReceived");
  const txnNo = paymentValueFromMap(map, slot, "transactionNumber");
  const bank = paymentValueFromMap(map, slot, "bankName");
  const mobile = paymentValueFromMap(map, slot, "mobileNumber");
  if (!amountRaw && !methodRaw && !txnNo && !bank && !mobile) return null;

  const method = parsePayMethod(methodRaw) ?? (bank || txnNo ? PayMethod.CHQ : PayMethod.CASH);
  const accountSource =
    method === PayMethod.UPI || method === PayMethod.NEFT
      ? mobile || paymentValueFromMap(map, slot, "accountNumber")
      : paymentValueFromMap(map, slot, "accountNumber");

  return {
    amount: parseOptionalDecimal(amountRaw) ?? 0,
    method,
    status: parseTransactionStatus(paymentValueFromMap(map, slot, "transactionStatus")),
    transactionNumber: txnNo || null,
    transactionDate: parseCsvDate(paymentValueFromMap(map, slot, "transactionDate")) ?? null,
    bankName: bank || null,
    branchName: paymentValueFromMap(map, slot, "branch") || null,
    accountNumber: accountSource || null,
    nameAsPerCheque: paymentValueFromMap(map, slot, "nameAsPerCheque") || null,
    ifscCode: paymentValueFromMap(map, slot, "ifscCode") || null,
    notOver: paymentValueFromMap(map, slot, "notOver") || null,
    dishonourReason: paymentValueFromMap(map, slot, "dishonourReason") || null,
    returnCharges: parseOptionalDecimal(paymentValueFromMap(map, slot, "returnCharges")),
    otherCharges: parseOptionalDecimal(paymentValueFromMap(map, slot, "otherCharges")),
  };
}

/** CSV slot 1 = newest; persist oldest-first like the policy form save path. */
export function normalizeCsvPaymentsForDb(payments: PaymentReplaceRow[]): PaymentReplaceRow[] {
  if (payments.length <= 1) return payments;
  return [...payments].reverse();
}

/** Reads payment slots from a CSV row (supports legacy and new headers). */
export function collectPaymentsFromCsvMap(map: Map<string, string>): PaymentReplaceRow[] {
  const payments: PaymentReplaceRow[] = [];
  for (let slot = 1; slot <= PAYMENT_CSV_MAX_SLOTS; slot++) {
    const row = paymentRowFromMap(map, slot);
    if (row) payments.push(row);
  }
  return normalizeCsvPaymentsForDb(payments);
}
