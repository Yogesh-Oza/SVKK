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

function firstPaymentWithData(year: PolicyYearBankSource | undefined): PolicyPaymentBankSource | undefined {
  if (!year?.payments?.length) return undefined;
  for (const p of year.payments) {
    if (
      p.cheque ||
      p.bankName ||
      p.accountNumber ||
      p.transactionNumber ||
      p.nameAsPerCheque ||
      p.ifscCode
    ) {
      return p;
    }
  }
  return year.payments[0];
}

function firstChequeFromPayments(payments: PolicyPaymentBankSource[] | null | undefined): PolicyChequeDetail {
  if (!payments?.length) return null;
  for (const p of payments) {
    if (p.cheque) return p.cheque;
  }
  return null;
}

/**
 * Merges cheque-linked and payment-level bank fields for policy view / receipts.
 * Payment & Bank Details are stored on Payment when no Cheque row exists.
 */
export function resolvePolicyBankInfo(year: PolicyYearBankSource | undefined): ResolvedPolicyBankInfo {
  const pay = firstPaymentWithData(year);
  const ch = firstChequeFromPayments(year?.payments ?? undefined);

  const status =
    ch?.status ??
    (pay?.status === "FAILED" ? "DISHONOURED" : pay?.status === "COMPLETED" ? "CLEARED" : pay?.status) ??
    "";

  return {
    number: ch?.number ?? pay?.transactionNumber ?? "",
    bankName: ch?.bankName ?? pay?.bankName ?? year?.bankName ?? "",
    accountNo: ch?.accountNo ?? pay?.accountNumber ?? year?.bankAccountLast4 ?? "",
    branch: ch?.branch ?? pay?.branchName ?? "",
    nameAsPerCheque: ch?.nameAsPerCheque ?? pay?.nameAsPerCheque ?? "",
    ifsc: ch?.ifsc ?? pay?.ifscCode ?? "",
    notOver: ch?.notOver ?? pay?.notOver ?? "",
    chequeDate: ch?.chequeDate ?? pay?.transactionDate ?? null,
    status: status ? String(status) : "",
    reason: ch?.reason ?? pay?.dishonourReason ?? "",
  };
}
