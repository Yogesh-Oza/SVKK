import { policyTypeKeyForForm } from "./ad-product-variant";
import type { AdMemberRow } from "./ad-member-types";
import type {
  AdPolicyFormValues,
  AdPolicyPaymentTransactionForm,
} from "./ad-policy-form-values";
import { getAdPolicyInitialValues } from "./ad-policy-form-values";
import { sortPaymentRowsNewestFirst } from "./ad-policy-payments";
import {
  canonicalMonthName,
  POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER,
} from "@/lib/svkk/policy-period-months";
import { formatDateForFormInput } from "@/lib/svkk/form-date";

export function parsePolicyUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.filter((u: unknown) => typeof u === "string" && u);
    } catch { /* legacy single-URL fallback */ }
  }
  return trimmed ? [trimmed] : [];
}

type Decimalish = string | number | { toString(): string } | null | undefined;

function decStr(v: Decimalish): string {
  if (v == null || v === "") {
    return "";
  }
  return String(v).replace(/,/g, "");
}

function isoToDateInput(iso: string | null | undefined): string {
  return formatDateForFormInput(iso);
}

type ChequeApi = {
  number: string;
  bankName: string;
  ifsc?: string | null;
  status?: string;
  reason?: string | null;
  accountNo?: string | null;
  branch?: string | null;
  nameAsPerCheque?: string | null;
  notOver?: string | null;
  chequeDate?: string | Date | null;
} | null;

/** Subset of `GET /policies/:id` JSON used to prefill the AD policy form. */
export type SvkkPolicyDetailForForm = {
  id: string;
  updatedAt: string;
  adProductVariant?: string | null;
  policyNo: string | null;
  village: string | null;
  insuranceCompany: string | null;
  tpa: string | null;
  personsInsuredCount: number | null;
  policyGrouping: string | null;
  policyUrl: string | null;
  policyUrl2: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  area: string | null;
  city: string | null;
  pincode: string | null;
  nomineeName: string | null;
  nomineeRelation: string | null;
  contactPhone: string | null;
  whatsappNo?: string | null;
  remarks: string | null;
  referenceNo: string | null;
  periodYearText: string | null;
  periodMonthText: string | null;
  holderRelationship: string | null;
  holderGender: string | null;
  holderName?: string | null;
  holderDateOfBirth?: string | null;
  holderPan?: string | null;
  holderAadhaarNo?: string | null;
  holderJoiningDate: string | null;
  holderAge: number | null;
  holderAddOns: Decimalish;
  categoryText: string | null;
  mobileSecondary: string | null;
  loanStatus: string | null;
  loanAmount: Decimalish;
  previousPolicyNo: string | null;
  previousEndDate: string | null;
  policyGroup: string | null;
  refundChequeAmount: Decimalish;
  refundChequeNo: string | null;
  refundChequeDate: string | null;
  cdAccountUsed: boolean | null;
  cdAmount: Decimalish;
  courierStatus: string | null;
  courierDate: string | null;
  courierCompany: string | null;
  podNumber: string | null;
  courierAddress: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    email: string | null;
    customerId: string | null;
    pan: string | null;
    aadhaarNo: string | null;
    dateOfBirth: string | null;
  };
  policyType?: { id: string; name: string; key?: string | null } | null;
  category: { key: string; name: string } | null;
  years: Array<{
    yearLabel: string;
    policyStart: string | null;
    policyEnd: string | null;
    amountReceived?: Decimalish;
    policyChart?: { id: string } | null;
    sumInsured: Decimalish;
    expectedNetPremium: Decimalish;
    taxPercent?: Decimalish;
    taxAmount?: Decimalish;
    svkkPremium?: Decimalish;
    netPremium?: Decimalish;
    vkkCommission?: Decimalish;
    gaamMahajanContribution?: Decimalish;
    differenceAmountPaidByHolder?: Decimalish;
    vkkPremium: Decimalish;
    grossPremium: Decimalish;
    commissionAmount: Decimalish;
    twoLacFloater: Decimalish;
    premiumOneOrTwoLakh?: Decimalish;
    yearPolicyHolderPremium: Decimalish;
    gaamMahajanVkk: Decimalish;
    excessShortAmount: Decimalish;
    diffPaidByHolder: Decimalish;
    holderCumulativeBonus: Decimalish;
    holderJoiningYear: string | null;
    holderBasicPremium: Decimalish;
    utrRef?: string | null;
    bankName?: string | null;
    bankAccountLast4?: string | null;
    paymentMode?: string | null;
    payments?: Array<{
      id?: string | null;
      createdAt?: string | null;
      method: string;
      amount: Decimalish;
      transactionNumber?: string | null;
      transactionDate?: string | null;
      bankName?: string | null;
      branchName?: string | null;
      accountNumber?: string | null;
      nameAsPerCheque?: string | null;
      ifscCode?: string | null;
      notOver?: string | null;
      dishonourReason?: string | null;
      returnCharges?: Decimalish;
      otherCharges?: Decimalish;
      status?: string | null;
      cheque: ChequeApi;
    }>;
    members: Array<{
      name: string;
      relationship: string;
      dob: string;
      gender: string;
      sumInsured: Decimalish;
      cumulativeBonus: Decimalish;
      dateOfJoining: string | null;
      memberPhone: string | null;
      addOnsAmount: Decimalish;
      basicPremium: Decimalish;
      ageAtEntry: number | null;
    }>;
  }>;
};

function ageFromDob(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) {
    a -= 1;
  }
  return a >= 0 ? String(a) : "";
}

function groupingFromApi(g: string | null | undefined): string {
  return g?.trim() ?? "";
}

export function parseRemarks(raw: string | null | undefined): { generalRemark: string; policyChangeRemark: string } {
  const text = raw?.trim() ?? "";
  if (!text) {
    return { generalRemark: "", policyChangeRemark: "" };
  }

  const generalMarker = "General Remark:";
  const policyMarker = "Policy Change Remark:";
  const gIdx = text.indexOf(generalMarker);
  const pIdx = text.indexOf(policyMarker);

  if (gIdx !== -1 || pIdx !== -1) {
    let generalRemark = "";
    let policyChangeRemark = "";

    if (gIdx !== -1) {
      const gStart = gIdx + generalMarker.length;
      const gEnd = pIdx !== -1 && pIdx > gStart ? pIdx : text.length;
      generalRemark = text.slice(gStart, gEnd).trim();
    }
    if (pIdx !== -1) {
      const pStart = pIdx + policyMarker.length;
      policyChangeRemark = text.slice(pStart).trim();
    }
    return { generalRemark, policyChangeRemark };
  }

  // Backward-compatible: old single remark becomes general remark.
  return { generalRemark: text, policyChangeRemark: "" };
}

export type PolicyDetailToFormOptions = {
  /** When editing/viewing a specific year row (matches `?year=` on edit URL). */
  yearLabel?: string;
};

function monthFromIsoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER[d.getMonth()] ?? "";
}

const REF_MONTH_ABBR_TO_LABEL: Record<string, string> = {
  JAN: "January",
  FEB: "February",
  MAR: "March",
  APR: "April",
  MAY: "May",
  JUN: "June",
  JUL: "July",
  AUG: "August",
  SEP: "September",
  OCT: "October",
  NOV: "November",
  DEC: "December",
};

/** Parses month token from reference numbers like `NVKK2026JAN0003`. */
export function monthFromReferenceNo(referenceNo: string | null | undefined): string {
  const ref = referenceNo?.trim();
  if (!ref) return "";
  const m = ref.match(/(?:19|20)\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d*/i);
  if (!m) return "";
  return REF_MONTH_ABBR_TO_LABEL[m[1].toUpperCase()] ?? "";
}

function resolveMonthFormValue(
  row: SvkkPolicyDetailForForm,
  y: SvkkPolicyDetailForForm["years"][number],
): string {
  const fromText = canonicalMonthName(row.periodMonthText ?? "") ?? "";
  if (fromText) return fromText;
  const fromRef = monthFromReferenceNo(row.referenceNo);
  if (fromRef) return fromRef;
  return monthFromIsoDate(y.policyStart) || monthFromIsoDate(y.policyEnd);
}

function mapPaymentMethodToForm(method: string | null | undefined): AdPolicyPaymentTransactionForm["mode"] {
  const m = (method ?? "").toUpperCase();
  if (m === "CHQ" || m === "CHEQUE") return "CHEQUE";
  if (m === "CASH") return "CASH";
  if (m === "UPI") return "UPI";
  if (m === "ONLINE" || m === "NEFT") return "ONLINE";
  return "CHEQUE";
}

function mapPaymentStatusToForm(
  p: NonNullable<SvkkPolicyDetailForForm["years"][number]["payments"]>[number],
  ch: ChequeApi,
): AdPolicyPaymentTransactionForm["transactionStatus"] {
  if (ch?.status === "DISHONOURED" || p.status === "FAILED") return "DISHONOURED";
  if (ch?.status === "CLEARED" || p.status === "COMPLETED") return "CLEARED";
  if (ch?.status === "PENDING" || p.status === "PENDING") return "PENDING";
  return "";
}

function paymentRowFromApi(
  p: NonNullable<SvkkPolicyDetailForForm["years"][number]["payments"]>[number],
): AdPolicyPaymentTransactionForm {
  const ch = p.cheque;
  const mode = mapPaymentMethodToForm(p.method ?? (ch ? "CHQ" : null));
  const accountOrMobile = ch?.accountNo ?? p.accountNumber ?? "";
  return {
    mode,
    mobileNumber: mode === "UPI" ? accountOrMobile : "",
    transactionNumber: ch?.number ?? p.transactionNumber ?? "",
    bankName: ch?.bankName ?? p.bankName ?? "",
    branch: ch?.branch ?? p.branchName ?? "",
    accountNumber: mode === "UPI" ? "" : accountOrMobile,
    nameAsPerCheque: ch?.nameAsPerCheque ?? p.nameAsPerCheque ?? "",
    ifscCode: ch?.ifsc ?? p.ifscCode ?? "",
    notOver: ch?.notOver ?? p.notOver ?? "",
    transactionDate: isoToDateInput(
      ch?.chequeDate == null
        ? p.transactionDate ?? ""
        : typeof ch.chequeDate === "string"
          ? ch.chequeDate
          : ch.chequeDate.toISOString(),
    ),
    transactionStatus: mapPaymentStatusToForm(p, ch),
    dishonourReason: ch?.reason ?? p.dishonourReason ?? "",
    returnCharges: decStr(p.returnCharges),
    otherCharges: decStr(p.otherCharges),
    amountReceived: decStr(p.amount),
  };
}

function legacyPaymentTransactionsFromYear(
  y: SvkkPolicyDetailForForm["years"][number],
  legacy: {
    paymentMode: AdPolicyFormValues["paymentMode"];
    onlineTransactionRef: string;
    policyChequeNo: string;
    bank: string;
    accountNo: string;
    branch: string;
    nameAsPerCheque: string;
    ifsc: string;
    notOver: string;
    chequeDate: string;
    chequeStatus: string;
    reasonDishonoured: string;
  },
): AdPolicyPaymentTransactionForm[] {
  const hasLegacy =
    legacy.policyChequeNo ||
    legacy.bank ||
    legacy.onlineTransactionRef ||
    y.amountReceived != null;
  if (!hasLegacy) return [];

  const mode =
    legacy.paymentMode === "CHEQUE"
      ? "CHEQUE"
      : legacy.paymentMode === "CASH"
        ? "CASH"
        : legacy.onlineTransactionRef
          ? "ONLINE"
          : "CHEQUE";

  let transactionStatus: AdPolicyPaymentTransactionForm["transactionStatus"] = "";
  if (legacy.chequeStatus === "DISHONOURED") transactionStatus = "DISHONOURED";
  else if (legacy.chequeStatus === "CLEARED") transactionStatus = "CLEARED";
  else if (legacy.chequeStatus) transactionStatus = "PENDING";

  return [
    {
      mode,
      mobileNumber: "",
      transactionNumber: legacy.policyChequeNo || legacy.onlineTransactionRef,
      bankName: legacy.bank,
      branch: legacy.branch,
      accountNumber: legacy.accountNo,
      nameAsPerCheque: legacy.nameAsPerCheque,
      ifscCode: legacy.ifsc,
      notOver: legacy.notOver,
      transactionDate: legacy.chequeDate,
      transactionStatus,
      dishonourReason: legacy.reasonDishonoured,
      returnCharges: "",
      otherCharges: "",
      amountReceived: decStr(y.amountReceived),
    },
  ];
}

export function pickPolicyYear(
  years: SvkkPolicyDetailForForm["years"],
  yearLabel?: string,
): SvkkPolicyDetailForForm["years"][number] | undefined {
  if (!years.length) {
    return undefined;
  }
  if (yearLabel?.trim()) {
    return years.find((yy) => yy.yearLabel === yearLabel.trim()) ?? years[0];
  }
  return years[0];
}

/**
 * Maps a policy year from `GET /policies/:id` into the same shape as Add policy.
 * Defaults to `years[0]` (API returns years desc by label).
 */
export function policyDetailToAdFormValues(
  row: SvkkPolicyDetailForForm,
  options?: PolicyDetailToFormOptions,
): AdPolicyFormValues {
  const base = getAdPolicyInitialValues();
  const y = pickPolicyYear(row.years, options?.yearLabel);
  const { generalRemark, policyChangeRemark } = parseRemarks(row.remarks);
  if (!y) {
    return base;
  }

  const pay = y.payments?.[0];
  let paymentMode: AdPolicyFormValues["paymentMode"] = "CHEQUE";
  let onlineTransactionRef = "";
  let policyChequeNo = "";
  let bank = "";
  let accountNo = "";
  let branch = "";
  let nameAsPerCheque = "";
  let ifsc = "";
  let notOver = "";
  let chequeDate = "";
  let chequeStatus = "";
  let reasonDishonoured = "";

  const yPm = y.paymentMode ?? pay?.method;
  if (yPm === "UPI" || yPm === "NEFT" || yPm === "ONLINE") {
    paymentMode = "ONLINE";
    onlineTransactionRef = (y.utrRef ?? "").trim();
  } else {
    paymentMode = "CHEQUE";
    const ch = pay?.cheque;
    if (ch) {
      policyChequeNo = ch.number ?? "";
      bank = ch.bankName ?? "";
      accountNo = ch.accountNo ?? "";
      branch = ch.branch ?? "";
      nameAsPerCheque = ch.nameAsPerCheque ?? "";
      ifsc = ch.ifsc ?? "";
      notOver = ch.notOver ?? "";
      chequeDate = isoToDateInput(
        ch.chequeDate == null ? "" : typeof ch.chequeDate === "string" ? ch.chequeDate : ch.chequeDate.toISOString(),
      );
      if (ch.status === "DISHONOURED") {
        chequeStatus = "DISHONOURED";
        reasonDishonoured = ch.reason ?? "";
      } else if (ch.status === "CLEARED") {
        chequeStatus = "CLEARED";
      }
    } else if (pay) {
      policyChequeNo = pay.transactionNumber ?? "";
      bank = pay.bankName ?? "";
      accountNo = pay.accountNumber ?? "";
      branch = pay.branchName ?? "";
      nameAsPerCheque = pay.nameAsPerCheque ?? "";
      ifsc = pay.ifscCode ?? "";
      notOver = pay.notOver ?? "";
      chequeDate = isoToDateInput(pay.transactionDate ?? "");
      if (pay.status === "FAILED" || pay.dishonourReason) {
        chequeStatus = "DISHONOURED";
        reasonDishonoured = pay.dishonourReason ?? "";
      } else if (pay.status === "COMPLETED") {
        chequeStatus = "CLEARED";
      }
    }
    if (!bank && y.bankName) {
      bank = y.bankName;
    }
    if (!accountNo && y.bankAccountLast4) {
      accountNo = y.bankAccountLast4;
    }
  }

  const paymentTransactions: AdPolicyFormValues["paymentTransactions"] = y.payments?.length
    ? sortPaymentRowsNewestFirst(y.payments).map((p) => paymentRowFromApi(p))
    : legacyPaymentTransactionsFromYear(y, {
        paymentMode,
        onlineTransactionRef,
        policyChequeNo,
        bank,
        accountNo,
        branch,
        nameAsPerCheque,
        ifsc,
        notOver,
        chequeDate,
        chequeStatus,
        reasonDishonoured,
      });

  const memberRows: AdMemberRow[] =
    y.members.length > 0
      ? y.members.map((m) => {
          const dobStr = isoToDateInput(m.dob);
          return {
            name: m.name,
            relationship: m.relationship,
            dob: dobStr,
            age: m.ageAtEntry != null ? String(m.ageAtEntry) : ageFromDob(m.dob),
            dateOfJoining: isoToDateInput(m.dateOfJoining ?? ""),
            sumInsured: decStr(m.sumInsured),
            cumulativeBonus: decStr(m.cumulativeBonus),
            phNo: m.memberPhone ?? "",
            basicPremium: decStr(m.basicPremium),
            addOnsAmount: decStr(m.addOnsAmount),
            gender: m.gender || "M",
          };
        })
      : [];

  const holderDob = isoToDateInput(row.holderDateOfBirth ?? row.insuredParty.dateOfBirth ?? "");

  return {
    ...base,
    policyNo: row.policyNo ?? "",
    adProduct: policyTypeKeyForForm(row.policyType, row.adProductVariant),
    customerId: row.insuredParty.customerId ?? "",
    svkkPublicId: row.insuredParty.svkkPublicId ?? "",
    policyHolder: row.holderName?.trim() || row.insuredParty.name || "",
    panNo: row.holderPan?.trim() || row.insuredParty.pan || "",
    aadhaarNo: row.holderAadhaarNo?.trim() || row.insuredParty.aadhaarNo || "",
    company: row.insuranceCompany ?? "",
    tpa: row.tpa ?? "",
    policyStart: isoToDateInput(y.policyStart ?? ""),
    policyEnd: isoToDateInput(y.policyEnd ?? ""),
    village: row.village ?? "",
    cat: row.category?.key ?? row.categoryText ?? "",
    dob: holderDob,
    age:
      row.holderAge != null
        ? String(row.holderAge)
        : ageFromDob(row.holderDateOfBirth ?? row.insuredParty.dateOfBirth ?? ""),
    relation: row.holderRelationship ?? "",
    holderGender: row.holderGender ?? "",
    holderJoiningDate: isoToDateInput(row.holderJoiningDate ?? ""),
    holderAddOns: decStr(row.holderAddOns),
    person: String(row.personsInsuredCount ?? y.members.length),
    sumInsured: decStr(y.sumInsured),
    comulativeBonus: decStr(y.holderCumulativeBonus),
    joiningYear: y.holderJoiningYear ?? "",
    basicPremiumPs: decStr(y.holderBasicPremium),
    members: memberRows,
    paymentMode,
    onlineTransactionRef,
    policyChequeNo,
    bank,
    accountNo,
    branch,
    nameAsPerCheque,
    ifsc,
    notOver,
    chequeDate,
    chequeStatus,
    reasonDishonoured,
    vkkPremium: decStr(y.vkkPremium),
    coPremium: decStr(y.expectedNetPremium ?? y.netPremium),
    grossPremium: decStr(y.grossPremium),
    taxPercent: decStr(y.taxPercent),
    taxAmount: decStr(y.taxAmount),
    svkkPremiumCalc: decStr(y.svkkPremium ?? y.vkkPremium),
    netPremiumCalc: decStr(y.netPremium ?? y.expectedNetPremium),
    commission: decStr(y.commissionAmount),
    vkkCommission: decStr(y.vkkCommission),
    twoLakhF: decStr(y.twoLacFloater ?? y.premiumOneOrTwoLakh),
    policyHolderPremium: decStr(y.yearPolicyHolderPremium),
    contribution: decStr(y.gaamMahajanContribution ?? y.gaamMahajanVkk),
    gaamMahajan: decStr(y.gaamMahajanVkk),
    excessShort: decStr(y.excessShortAmount),
    differenceAmountPaidByHolder: decStr(y.differenceAmountPaidByHolder ?? y.diffPaidByHolder),
    diffAmt: decStr(y.diffPaidByHolder ?? y.differenceAmountPaidByHolder),
    loanStatus: row.loanStatus ?? "",
    loanNo: "",
    loanAmt: decStr(row.loanAmount),
    previousPolicyNo: row.previousPolicyNo ?? "",
    previousEndDate: isoToDateInput(row.previousEndDate ?? ""),
    policyGroup: row.policyGroup?.trim() || row.policyGrouping?.trim() || "",
    nomineeName: row.nomineeName ?? "",
    nomineeRelation: row.nomineeRelation ?? "",
    nomineePhoneNumber: row.contactPhone ?? "",
    address: row.addressLine1 ?? "",
    addressTwo: row.addressLine2 ?? "",
    addressThree: row.addressLine3 ?? "",
    addressFour: row.addressLine4 ?? "",
    area: row.area ?? "",
    city: row.city ?? "",
    pincode: row.pincode ?? "",
    mobileFirst: row.insuredParty.mobile ?? "",
    mobileSecond: row.mobileSecondary ?? "",
    whatsappNo: row.whatsappNo ?? "",
    email: row.insuredParty.email ?? "",
    refundChequeAmt: decStr(row.refundChequeAmount),
    refundChequeNo: row.refundChequeNo ?? "",
    refundChequeDate: isoToDateInput(row.refundChequeDate ?? ""),
    cdAccountStatus:
      row.cdAccountUsed === true ? "YES" : row.cdAccountUsed === false ? "NO" : "",
    cdAmount: decStr(row.cdAmount),
    notCourier: row.courierStatus ?? "",
    courierDate: isoToDateInput(row.courierDate ?? ""),
    courierCompany: row.courierCompany ?? "",
    podNumber: row.podNumber ?? "",
    courierAddress: row.courierAddress ?? "",
    paymentTransactions:
      paymentTransactions.length > 0 ? paymentTransactions : base.paymentTransactions,
    generalRemark,
    policyChangeRemark,
    refNo: row.referenceNo ?? "",
    year: row.periodYearText ?? "",
    month: resolveMonthFormValue(row, y),
    policyGrouping: groupingFromApi(row.policyGrouping ?? row.policyGroup),
    urls: parsePolicyUrls(row.policyUrl),
    url2: row.policyUrl2 ?? "",
  };
}
