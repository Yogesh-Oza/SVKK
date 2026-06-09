import type {
  AdPolicyFormValues,
  AdPolicyPaymentTransactionForm,
} from "./ad-policy-form-values";

/** Form transaction mode — keep in sync with backend `policy-payment-sanitize.ts`. */
export type FormPaymentMode = AdPolicyPaymentTransactionForm["mode"];

/**
 * Keys cleared when the active mode does not use them.
 * Form: set to `""`; API boundary: map to `null`.
 */
export const PAYMENT_TRANSACTION_CLEAR_BY_MODE: Record<
  FormPaymentMode,
  readonly (keyof AdPolicyPaymentTransactionForm)[]
> = {
  CASH: [
    "transactionNumber",
    "mobileNumber",
    "bankName",
    "branch",
    "accountNumber",
    "nameAsPerCheque",
    "ifscCode",
    "notOver",
    "dishonourReason",
  ],
  UPI: ["bankName", "branch", "accountNumber", "nameAsPerCheque", "ifscCode", "notOver"],
  ONLINE: ["mobileNumber", "nameAsPerCheque"],
  CHEQUE: ["mobileNumber"],
};

export const LEGACY_CHEQUE_FIELD_KEYS = [
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

export type LegacyChequeFieldKey = (typeof LEGACY_CHEQUE_FIELD_KEYS)[number];

type SanitizeOptions = { apiPayload: boolean };

function clearedValue(options: SanitizeOptions): "" | null {
  return options.apiPayload ? null : "";
}

/**
 * Clears transaction fields that are invalid for the given payment mode.
 */
export function sanitizeByMode<T extends AdPolicyPaymentTransactionForm>(
  mode: FormPaymentMode,
  row: T,
  options: SanitizeOptions,
): T {
  const next = { ...row, mode };
  const empty = clearedValue(options);
  for (const key of PAYMENT_TRANSACTION_CLEAR_BY_MODE[mode]) {
    (next as Record<string, unknown>)[key] = empty;
  }
  return next;
}

export function sanitizePaymentTransactionForMode(
  row: AdPolicyPaymentTransactionForm,
): AdPolicyPaymentTransactionForm {
  return sanitizeByMode(row.mode, row, { apiPayload: false });
}

/** Legacy flat cheque fields — still used by carry-forward and CHEQUE year summary. */
export function legacyPaymentFieldClearsForMode(
  mode: FormPaymentMode,
): Partial<Pick<AdPolicyFormValues, LegacyChequeFieldKey | "onlineTransactionRef">> {
  const clears: Partial<
    Pick<AdPolicyFormValues, LegacyChequeFieldKey | "onlineTransactionRef">
  > = {};
  if (mode !== "CHEQUE") {
    for (const key of LEGACY_CHEQUE_FIELD_KEYS) {
      clears[key] = "";
    }
  }
  if (mode !== "ONLINE" && mode !== "UPI") {
    clears.onlineTransactionRef = "";
  }
  return clears;
}

export function syncTopLevelPaymentMode(
  mode: FormPaymentMode,
): AdPolicyFormValues["paymentMode"] {
  if (mode === "CHEQUE") return "CHEQUE";
  if (mode === "CASH") return "CASH";
  return "ONLINE";
}

/** Policy-year summary fields on create/patch body — must stay aligned with row sanitizer. */
export function applyPolicyYearPaymentFieldsToBody(
  body: Record<string, unknown>,
  mode: FormPaymentMode,
  input: {
    onlineTransactionRef: string;
    bank: string;
    accountNo: string;
    firstTxn?: AdPolicyPaymentTransactionForm;
    amountReceived?: number | null;
  },
): void {
  const firstTxn = input.firstTxn;
  const utr =
    input.onlineTransactionRef.trim() || firstTxn?.transactionNumber?.trim() || null;

  if (mode === "CASH") {
    body.paymentMode = "CASH";
    body.bankName = null;
    body.bankAccountLast4 = null;
    body.utrRef = null;
    if (input.amountReceived != null) body.amountReceived = input.amountReceived;
    return;
  }

  if (mode === "UPI") {
    body.paymentMode = "UPI";
    body.utrRef = utr;
    body.bankName = null;
    body.bankAccountLast4 = null;
    if (input.amountReceived != null) body.amountReceived = input.amountReceived;
    return;
  }

  if (mode === "ONLINE") {
    body.paymentMode = "NEFT";
    body.utrRef = utr;
    const bank = firstTxn?.bankName?.trim() || null;
    body.bankName = bank;
    body.bankAccountLast4 = null;
    if (input.amountReceived != null) body.amountReceived = input.amountReceived;
    return;
  }

  body.paymentMode = "CHQ";
  const bank = input.bank.trim() || firstTxn?.bankName?.trim() || null;
  const acct = input.accountNo.trim() || firstTxn?.accountNumber?.trim() || "";
  body.bankName = bank;
  body.bankAccountLast4 = acct ? acct.replace(/\D/g, "").slice(-4) : null;
  body.utrRef = null;
  if (input.amountReceived != null) body.amountReceived = input.amountReceived;
}
