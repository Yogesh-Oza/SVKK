import { adProductFormValueFromApi } from "./ad-product-variant";
import { emptyMemberRow, type AdMemberRow } from "./ad-member-types";
import type { AdPolicyFormValues } from "./ad-policy-form-values";
import { getAdPolicyInitialValues } from "./ad-policy-form-values";

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
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toISOString().slice(0, 10);
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
  category: { key: string; name: string } | null;
  years: Array<{
    yearLabel: string;
    policyStart: string | null;
    policyEnd: string | null;
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
      method: string;
      amount: Decimalish;
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

function parseRemarks(raw: string | null | undefined): { generalRemark: string; policyChangeRemark: string } {
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

function pickPolicyYear(
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
    }
    if (!bank && y.bankName) {
      bank = y.bankName;
    }
    if (!accountNo && y.bankAccountLast4) {
      accountNo = y.bankAccountLast4;
    }
  }

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
            addOnsAmount: "",
            gender: m.gender || "M",
          };
        })
      : [];

  const holderDob = isoToDateInput(row.insuredParty.dateOfBirth ?? "");

  return {
    ...base,
    policyNo: row.policyNo ?? "",
    adProduct: adProductFormValueFromApi(row.adProductVariant),
    customerId: row.insuredParty.customerId ?? "",
    svkkPublicId: row.insuredParty.svkkPublicId ?? "",
    policyHolder: row.insuredParty.name ?? "",
    panNo: row.insuredParty.pan ?? "",
    aadhaarNo: row.insuredParty.aadhaarNo ?? "",
    company: row.insuranceCompany ?? "",
    tpa: row.tpa ?? "",
    policyStart: isoToDateInput(y.policyStart ?? ""),
    policyEnd: isoToDateInput(y.policyEnd ?? ""),
    village: row.village ?? "",
    cat: row.category?.key ?? row.categoryText ?? "",
    dob: holderDob,
    age: row.holderAge != null ? String(row.holderAge) : ageFromDob(row.insuredParty.dateOfBirth ?? ""),
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
    policyGroup: row.policyGroup ?? "",
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
    paymentTransactions: [],
    generalRemark,
    policyChangeRemark,
    refNo: row.referenceNo ?? "",
    year: row.periodYearText ?? "",
    month: row.periodMonthText ?? "",
    policyGrouping: groupingFromApi(row.policyGrouping),
    urls: parsePolicyUrls(row.policyUrl),
    url2: row.policyUrl2 ?? "",
  };
}
