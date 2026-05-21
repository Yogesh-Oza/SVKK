import type { AdPolicyFormValues, AdPolicyPaymentTransactionForm } from "./ad-policy-form-values";

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

function getEmptyPaymentTransaction(): AdPolicyPaymentTransactionForm {
  return {
    mode: "CHEQUE",
    mobileNumber: "",
    transactionNumber: "",
    bankName: "",
    branch: "",
    accountNumber: "",
    nameAsPerCheque: "",
    ifscCode: "",
    notOver: "",
    transactionDate: "",
    transactionStatus: "",
    dishonourReason: "",
    returnCharges: "",
    otherCharges: "",
    amountReceived: "",
  };
}

function parseNum(s: string): number | undefined {
  const t = s.replace(/,/g, "").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function mapPaymentTransactionsToApi(values: AdPolicyFormValues) {
  return values.paymentTransactions
    .filter((row) => parseNum(row.amountReceived) != null)
    .map((row) => ({
      amount: parseNum(row.amountReceived)!,
      method: row.mode === "CHEQUE" ? "CHQ" : row.mode === "CASH" ? "CASH" : "UPI",
      status: row.transactionStatus || null,
      transactionNumber: row.transactionNumber.trim() || null,
      transactionDate: row.transactionDate ? new Date(row.transactionDate).toISOString() : null,
      bankName: row.bankName.trim() || null,
      branchName: row.branch.trim() || null,
      accountNumber:
        (row.mode === "UPI" ? row.mobileNumber?.trim() : row.accountNumber.trim()) || null,
      nameAsPerCheque: row.nameAsPerCheque.trim() || null,
      ifscCode: row.ifscCode.trim() || null,
      notOver: row.notOver.trim() || null,
      dishonourReason: row.dishonourReason.trim() || null,
      returnCharges: parseNum(row.returnCharges) ?? null,
      otherCharges: parseNum(row.otherCharges) ?? null,
    }));
}

/** Validates rows that have an amount — cheque rows need bank + transaction/cheque number. */
export function validatePaymentTransactions(values: AdPolicyFormValues): void {
  values.paymentTransactions.forEach((row, index) => {
    if (parseNum(row.amountReceived) == null) return;
    if (row.mode === "CHEQUE") {
      if (!row.bankName.trim() || !row.transactionNumber.trim()) {
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
  const firstTxn = values.paymentTransactions[0];
  const mode = primaryTransactionMode(values);

  if (mode === "ONLINE" || mode === "UPI") {
    body.paymentMode = "UPI";
    body.utrRef =
      values.onlineTransactionRef.trim() || firstTxn?.transactionNumber?.trim() || null;
    const bank = firstTxn?.bankName?.trim();
    if (bank) body.bankName = bank;
    const amt = parseNum(firstTxn?.amountReceived ?? "");
    if (amt != null) body.amountReceived = amt;
  } else if (mode === "CHEQUE") {
    body.paymentMode = "CHQ";
    const bank = values.bank.trim() || firstTxn?.bankName?.trim() || null;
    const acct = values.accountNo.trim() || firstTxn?.accountNumber?.trim() || "";
    body.bankName = bank;
    body.bankAccountLast4 = acct ? acct.replace(/\D/g, "").slice(-4) : null;
    const amt = parseNum(firstTxn?.amountReceived ?? "");
    if (amt != null) body.amountReceived = amt;
  } else if (mode === "CASH") {
    body.paymentMode = "CASH";
    const amt = parseNum(firstTxn?.amountReceived ?? "");
    if (amt != null) body.amountReceived = amt;
  }
}
