import {
  getEmptyPaymentTransaction,
  type AdPolicyFormValues,
  type AdPolicyPaymentTransactionForm,
} from "./ad-policy-form-values";
import { toApiDateIso } from "@/lib/svkk/form-date";

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
  return [...rows].reverse().map((row) => ({
      amount: parseNum(row.amountReceived)!,
      method: mapTransactionModeToPayMethod(row.mode),
      status: row.transactionStatus || null,
      transactionNumber: row.transactionNumber.trim() || null,
      transactionDate: toApiDateIso(row.transactionDate),
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

  if (mode === "UPI") {
    body.paymentMode = "UPI";
    body.utrRef =
      values.onlineTransactionRef.trim() || firstTxn?.transactionNumber?.trim() || null;
    const bank = firstTxn?.bankName?.trim();
    if (bank) body.bankName = bank;
    const amt = parseNum(firstTxn?.amountReceived ?? "");
    if (amt != null) body.amountReceived = amt;
  } else if (mode === "ONLINE") {
    body.paymentMode = "NEFT";
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
