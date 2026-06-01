import {
  getEmptyPaymentTransaction,
  type AdPolicyFormValues,
  type AdPolicyPaymentTransactionForm,
} from "./ad-policy-form-values";
import {
  applyPolicyYearPaymentFieldsToBody,
  legacyPaymentFieldClearsForMode,
  sanitizeByMode,
  sanitizePaymentTransactionForMode,
  syncTopLevelPaymentMode,
  type FormPaymentMode,
} from "./ad-policy-payment-mode-fields";
import { toApiDateIso } from "@/lib/svkk/form-date";

export {
  applyPolicyYearPaymentFieldsToBody,
  legacyPaymentFieldClearsForMode,
  sanitizeByMode,
  sanitizePaymentTransactionForMode,
  syncTopLevelPaymentMode,
  type FormPaymentMode,
} from "./ad-policy-payment-mode-fields";

const PAYMENT_CARRY_FORWARD_KEYS = [
  "paymentMode",
  "onlineTransactionRef",
  "policyChequeNo",
  "bank",
  "accountNo",
  "branch",
  "nameAsPerCheque",
  "ifsc",
  "notOver",
  "chequeDate",
  "chequeStatus",
  "reasonDishonoured",
] as const satisfies readonly (keyof AdPolicyFormValues)[];

export type PaymentDetailsCarryForward = Pick<
  AdPolicyFormValues,
  (typeof PAYMENT_CARRY_FORWARD_KEYS)[number] | "paymentTransactions"
>;

/** Copy all payment / bank fields from a loaded policy into a new renewal year. */
export function clonePaymentDetailsForCarryForward(
  carried: AdPolicyFormValues,
): PaymentDetailsCarryForward {
  const flat = Object.fromEntries(
    PAYMENT_CARRY_FORWARD_KEYS.map((key) => [key, carried[key]]),
  ) as Pick<AdPolicyFormValues, (typeof PAYMENT_CARRY_FORWARD_KEYS)[number]>;

  const paymentTransactions =
    carried.paymentTransactions.length > 0
      ? carried.paymentTransactions.map((row) => ({ ...row }))
      : [{ ...getEmptyPaymentTransaction() }];

  return { ...flat, paymentTransactions };
}

type PaymentWithCreatedAt = { createdAt?: string | Date | null; id?: string | null };

/** Newest first for display; index 1 = latest payment. */
export function sortPaymentRowsNewestFirst<T extends PaymentWithCreatedAt>(
  payments: T[],
): T[] {
  return [...payments].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return tb - ta;
    if (a.id && b.id) return b.id.localeCompare(a.id);
    return 0;
  });
}

function parseNum(s: string): number | undefined {
  const t = s.replace(/,/g, "").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function apiStr(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t || null;
}

/** Form transaction mode → API/DB `PayMethod` (Prisma: NEFT, UPI, CHQ, CASH). */
export function mapTransactionModeToPayMethod(
  mode: AdPolicyPaymentTransactionForm["mode"],
): "CHQ" | "CASH" | "UPI" | "NEFT" {
  if (mode === "CHEQUE") return "CHQ";
  if (mode === "CASH") return "CASH";
  if (mode === "UPI") return "UPI";
  return "NEFT";
}

export function mapPaymentTransactionsToApi(values: AdPolicyFormValues) {
  const rows = values.paymentTransactions.filter(
    (row) => parseNum(row.amountReceived) != null,
  );
  // Form shows newest first; persist oldest-first so createdAt desc matches display on reload.
  return [...rows].reverse().map((row) => {
    const sanitized = sanitizeByMode(row.mode, row, { apiPayload: true });
    const accountSource =
      sanitized.mode === "UPI" ? sanitized.mobileNumber : sanitized.accountNumber;
    return {
      amount: parseNum(sanitized.amountReceived)!,
      method: mapTransactionModeToPayMethod(sanitized.mode),
      status: sanitized.transactionStatus || null,
      transactionNumber: apiStr(sanitized.transactionNumber),
      transactionDate: toApiDateIso(sanitized.transactionDate),
      bankName: apiStr(sanitized.bankName),
      branchName: apiStr(sanitized.branch),
      accountNumber: apiStr(accountSource),
      nameAsPerCheque: apiStr(sanitized.nameAsPerCheque),
      ifscCode: apiStr(sanitized.ifscCode),
      notOver: apiStr(sanitized.notOver),
      dishonourReason: apiStr(sanitized.dishonourReason),
      returnCharges: parseNum(sanitized.returnCharges) ?? null,
      otherCharges: parseNum(sanitized.otherCharges) ?? null,
    };
  });
}

/** Validates rows that have an amount — cheque rows need bank + transaction/cheque number. */
export function validatePaymentTransactions(values: AdPolicyFormValues): void {
  values.paymentTransactions.forEach((row, index) => {
    if (parseNum(row.amountReceived) == null) return;
    const check = sanitizePaymentTransactionForMode(row);
    if (check.mode === "CHEQUE") {
      if (!check.bankName.trim() || !check.transactionNumber.trim()) {
        throw new Error(
          `Payment ${index + 1} (Cheque): enter bank name and cheque/transaction number.`,
        );
      }
    }
  });
}

export function primaryTransactionMode(
  values: AdPolicyFormValues,
): AdPolicyPaymentTransactionForm["mode"] | AdPolicyFormValues["paymentMode"] {
  return values.paymentTransactions[0]?.mode ?? values.paymentMode;
}

/** Sets policy-year payment mode / UTR / bank summary from the first transaction. */
export function applyPrimaryPaymentModeToBody(
  body: Record<string, unknown>,
  values: AdPolicyFormValues,
): void {
  const rawFirst = values.paymentTransactions[0];
  const mode = primaryTransactionMode(values) as FormPaymentMode;
  const firstTxn = rawFirst
    ? sanitizePaymentTransactionForMode(rawFirst)
    : undefined;
  const amt = parseNum(firstTxn?.amountReceived ?? "");

  applyPolicyYearPaymentFieldsToBody(body, mode, {
    onlineTransactionRef:
      mode === "ONLINE" || mode === "UPI" ? values.onlineTransactionRef : "",
    bank: mode === "CHEQUE" ? values.bank : "",
    accountNo: mode === "CHEQUE" ? values.accountNo : "",
    firstTxn,
    amountReceived: amt ?? null,
  });
}
