/** Cheque row linked from a payment (GET /policies/:id). */
export type PolicyChequeDetail = {
  number: string;
  bankName: string;
  ifsc?: string | null;
  accountNo?: string | null;
  branch?: string | null;
  nameAsPerCheque?: string | null;
  notOver?: string | null;
  chequeDate?: string | null;
  status?: string | null;
  reason?: string | null;
} | null;

/** Payment row with optional cheque and inline bank fields. */
export type PolicyPaymentBankSource = {
  method?: string | null;
  amount?: unknown;
  transactionNumber?: string | null;
  transactionDate?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  accountNumber?: string | null;
  nameAsPerCheque?: string | null;
  ifscCode?: string | null;
  notOver?: string | null;
  dishonourReason?: string | null;
  status?: string | null;
  cheque?: PolicyChequeDetail;
};

export type PolicyYearBankSource = {
  bankName?: string | null;
  bankAccountLast4?: string | null;
  utrRef?: string | null;
  paymentMode?: string | null;
  payments?: PolicyPaymentBankSource[] | null;
};

export type ResolvedPolicyBankInfo = {
  number: string;
  bankName: string;
  accountNo: string;
  branch: string;
  nameAsPerCheque: string;
  ifsc: string;
  notOver: string;
  chequeDate: string | null;
  status: string;
  reason: string;
};

export type PaymentDisplayField = { label: string; value: string };

export type PolicyPaymentDisplayRow = {
  index: number;
  modeLabel: string;
  amount: string;
  fields: PaymentDisplayField[];
};

type PaymentModeKind = "CHEQUE" | "CASH" | "UPI" | "ONLINE" | "OTHER";

function str(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

function normalizePaymentMode(method?: string | null): PaymentModeKind {
  const m = (method ?? "").toUpperCase();
  if (m === "CHQ" || m === "CHEQUE") return "CHEQUE";
  if (m === "CASH") return "CASH";
  if (m === "UPI") return "UPI";
  if (m === "NEFT" || m === "ONLINE") return "ONLINE";
  return "OTHER";
}

export function paymentModeLabel(method?: string | null): string {
  switch (normalizePaymentMode(method)) {
    case "CHEQUE":
      return "Cheque";
    case "CASH":
      return "Cash";
    case "UPI":
      return "UPI";
    case "ONLINE":
      return "Online";
    default:
      return method?.trim() || "—";
  }
}

function resolvePaymentStatus(
  pay: PolicyPaymentBankSource,
  ch: PolicyChequeDetail,
): string {
  if (ch?.status) return String(ch.status);
  if (pay.status === "FAILED") return "DISHONOURED";
  if (pay.status === "COMPLETED") return "CLEARED";
  if (pay.status === "PENDING") return "PENDING";
  return pay.status ? String(pay.status) : "";
}

function field(label: string, value: unknown): PaymentDisplayField | null {
  const s = str(value).trim();
  if (!s) return null;
  return { label, value: s };
}

function buildFields(
  pairs: Array<PaymentDisplayField | null>,
): PaymentDisplayField[] {
  return pairs.filter((p): p is PaymentDisplayField => p != null);
}

function resolveOnePayment(
  pay: PolicyPaymentBankSource,
  index: number,
  formatAmount: (v: unknown) => string,
): PolicyPaymentDisplayRow {
  const ch = pay.cheque ?? null;
  const mode = normalizePaymentMode(pay.method ?? (ch ? "CHQ" : null));
  const modeLabel = paymentModeLabel(pay.method ?? (ch ? "CHQ" : null));
  const amount = formatAmount(pay.amount);
  const status = resolvePaymentStatus(pay, ch);
  const reason = ch?.reason ?? pay.dishonourReason ?? "";
  const txnDate = ch?.chequeDate ?? pay.transactionDate ?? null;

  if (mode === "CHEQUE") {
    return {
      index,
      modeLabel,
      amount,
      fields: buildFields([
        field("Policy cheque no", ch?.number ?? pay.transactionNumber),
        field("Bank name", ch?.bankName ?? pay.bankName),
        field("Account no", ch?.accountNo ?? pay.accountNumber),
        field("Branch", ch?.branch ?? pay.branchName),
        field("Name as per cheque", ch?.nameAsPerCheque ?? pay.nameAsPerCheque),
        field("IFSC code", ch?.ifsc ?? pay.ifscCode),
        field("Not over", ch?.notOver ?? pay.notOver),
        field("Cheque date", txnDate),
        field("Cheque status", status),
        status === "DISHONOURED" ? field("Reason for dishonoured", reason) : null,
      ]),
    };
  }

  if (mode === "CASH") {
    return {
      index,
      modeLabel,
      amount,
      fields: buildFields([field("Transaction date", txnDate)]),
    };
  }

  // ONLINE / UPI / other non-cash
  return {
    index,
    modeLabel,
    amount,
    fields: buildFields([
      field("Transaction / UTR no", pay.transactionNumber),
      field("Mobile no", mode === "UPI" ? pay.accountNumber : null),
      field("Bank name", pay.bankName ?? ch?.bankName),
      field("Branch", pay.branchName ?? ch?.branch),
      field("Account no", mode === "UPI" ? null : pay.accountNumber ?? ch?.accountNo),
      field("Name as per cheque", pay.nameAsPerCheque ?? ch?.nameAsPerCheque),
      field("IFSC code", pay.ifscCode ?? ch?.ifsc),
      field("Transaction date", txnDate),
      field("Transaction status", status),
      status === "DISHONOURED" ? field("Dishonour reason", reason) : null,
      field("Return charges", pay.notOver),
    ]),
  };
}

/** All payment rows for the policy year, with mode-specific fields (supports multiple transactions). */
export function resolvePolicyPaymentDisplays(
  year: PolicyYearBankSource | undefined,
  formatAmount: (v: unknown) => string = (v) => str(v),
): PolicyPaymentDisplayRow[] {
  const payments = year?.payments?.filter(Boolean) ?? [];
  if (payments.length > 0) {
    return payments.map((pay, i) => resolveOnePayment(pay, i + 1, formatAmount));
  }

  if (year?.bankName || year?.bankAccountLast4 || year?.utrRef) {
    return [
      {
        index: 1,
        modeLabel: paymentModeLabel(year.paymentMode),
        amount: "",
        fields: buildFields([
          field("Bank name", year.bankName),
          field("Account no", year.bankAccountLast4),
          field("UTR / transaction ref", year.utrRef),
        ]),
      },
    ];
  }

  return [];
}

/** First payment summary (legacy / receipts). */
export function resolvePolicyBankInfo(year: PolicyYearBankSource | undefined): ResolvedPolicyBankInfo {
  const rows = resolvePolicyPaymentDisplays(year);
  const first = rows[0];
  if (!first) {
    return {
      number: "",
      bankName: year?.bankName ?? "",
      accountNo: year?.bankAccountLast4 ?? "",
      branch: "",
      nameAsPerCheque: "",
      ifsc: "",
      notOver: "",
      chequeDate: null,
      status: "",
      reason: "",
    };
  }

  const pick = (label: string) => first.fields.find((f) => f.label === label)?.value ?? "";

  return {
    number: pick("Policy cheque no") || pick("Transaction / UTR no"),
    bankName: pick("Bank name") || year?.bankName || "",
    accountNo: pick("Account no") || year?.bankAccountLast4 || "",
    branch: pick("Branch"),
    nameAsPerCheque: pick("Name as per cheque"),
    ifsc: pick("IFSC code"),
    notOver: pick("Not over"),
    chequeDate: pick("Cheque date") || pick("Transaction date") || null,
    status: pick("Cheque status") || pick("Transaction status"),
    reason: pick("Reason for dishonoured") || pick("Dishonour reason"),
  };
}
