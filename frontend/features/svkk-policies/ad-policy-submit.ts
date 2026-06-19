import { apiPatch, apiPost } from "@/lib/svkk/api";
import { AxiosError } from "axios";
import {
  applyPrimaryPaymentModeToBody,
  mapPaymentTransactionsToApi,
  validatePaymentTransactions,
} from "./ad-policy-payments";
import { toAdProductVariant } from "./ad-product-variant";
import type { AdPolicyFormValues } from "./ad-policy-form-values";
import { dateParse, toApiDateIso } from "@/lib/svkk/form-date";
import { debugPolicyUpdate } from "@/lib/svkk/policy-update-debug";

function parseNum(s: string): number | undefined {
  const t = s.replace(/,/g, "").trim();
  if (!t) {
    return undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function ageAtDate(dob: string, anchor: string): number | undefined {
  if (!dob || !anchor) {
    return undefined;
  }
  const dobDate = dateParse(dob);
  const anchorDate = dateParse(anchor);
  if (!dobDate || !anchorDate) {
    return undefined;
  }
  const diff = anchorDate.getTime() - dobDate.getTime();
  if (diff < 0) {
    return undefined;
  }
  return Math.floor(diff / (365.2425 * 24 * 60 * 60 * 1000));
}

/** Form "Group" uses policyGroup; legacy rows and ID generation use policyGrouping. */
function resolvePolicyGrouping(values: AdPolicyFormValues): string | null {
  const g = values.policyGroup.trim() || values.policyGrouping.trim();
  return g || null;
}

function mapLoanRepaymentFields(values: AdPolicyFormValues) {
  if (values.loanStatus !== "YES") {
    return { loanRepaymentAmount: null, loanPendingAmount: null };
  }
  return {
    loanRepaymentAmount: parseNum(values.loanRepayment) ?? null,
    loanPendingAmount: parseNum(values.loanPendingAmount) ?? null,
  };
}

function mapPolicyBankFields(values: AdPolicyFormValues) {
  return {
    policyBankHolderName: values.policyBankHolderName.trim() || null,
    policyBankAccountNo: values.policyBankAccountNo.trim() || null,
    policyBankIfsc: values.policyBankIfsc.trim() || null,
    policyBankBranch: values.policyBankBranch.trim() || null,
    policyBankName: values.policyBankName.trim() || null,
  };
}

function buildCombinedRemarks(values: AdPolicyFormValues): string | null {
  const parts: string[] = [];
  if (values.generalRemark.trim()) {
    parts.push(`General Remark:\n${values.generalRemark.trim()}`);
  }
  if (values.policyChangeRemark.trim()) {
    parts.push(`Policy Change Remark:\n${values.policyChangeRemark.trim()}`);
  }
  if (values.categoryChangeRemark.trim()) {
    parts.push(`Category Change Remark:\n${values.categoryChangeRemark.trim()}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export type SubmitAdPolicyParams = {
  values: AdPolicyFormValues;
  policyTypeId: string;
  policyChartId: string;
  idemKey: string;
  categoryId?: string;
};

/**
 * Submits the AD policy create request. Assumes form validation already passed.
 * @throws Error with message on API failure
 */
export async function submitAdPolicyRequest({
  values,
  policyTypeId,
  policyChartId,
  idemKey,
  categoryId,
}: SubmitAdPolicyParams): Promise<string> {
  const variant = toAdProductVariant(values.adProduct);
  if (!variant) {
    throw new Error("Invalid policy type");
  }
  const validMembers = values.members.filter((m) => m.name.trim() && m.dob);

  const si = parseNum(values.sumInsured);
  if (si == null || si <= 0) {
    throw new Error("Invalid sum insured");
  }
  const co = parseNum(values.coPremium);
  const ageAnchor = values.previousEndDate || values.policyEnd;
  const yearLabel = values.year.trim() || String(new Date().getFullYear());
  const combinedRemarks = buildCombinedRemarks(values);
  validatePaymentTransactions(values);

  const mobileRaw = values.mobileFirst.replace(/\D/g, "").slice(0, 12)
    || values.whatsappNo.replace(/\D/g, "").slice(0, 12);

  const body: Record<string, unknown> = {
    mobile: mobileRaw || null,
    partyName: values.policyHolder.trim(),
    email: values.email.trim() || null,
    pan: values.panNo.trim() || null,
    aadhaarNo: values.aadhaarNo.trim() || null,
    dateOfBirth: toApiDateIso(values.dob),
    policyTypeId,
    policyChartId,
    yearLabel,
    policyStart: toApiDateIso(values.policyStart),
    policyEnd: toApiDateIso(values.policyEnd),
    sumInsured: si,
    expectedNetPremium: co ?? null,
    policyNo: values.policyNo.trim() || null,
    village: values.village.trim() || null,
    adProductVariant: variant,
    customerId: values.customerId.trim() || null,
    svkkPublicId: values.svkkPublicId.trim() || null,
    insuranceCompany: values.company.trim() || null,
    tpa: values.tpa.trim() || null,
    categoryId: categoryId ?? undefined,
    categoryText: categoryId ? undefined : values.cat.trim() || null,
    holderRelationship: values.relation.trim() || null,
    holderGender: values.holderGender.trim() || null,
    holderJoiningDate: toApiDateIso(values.holderJoiningDate),
    holderAddOns: parseNum(values.holderAddOns) ?? null,
    holderAge:
      parseNum(values.age) != null ? Math.round(parseNum(values.age)!) : ageAtDate(values.dob, ageAnchor) ?? null,
    personsInsuredCount:
      parseNum(values.person) != null ? Math.round(parseNum(values.person)!) : validMembers.length,
    area: values.area.trim() || null,
    referenceNo: values.refNo.trim(),
    mobileSecondary: values.mobileSecond.trim() || null,
    policyGrouping: resolvePolicyGrouping(values),
    policyUrl: values.urls.length ? JSON.stringify(values.urls) : null,
    policyUrl2: values.url2.trim() || null,
    loanStatus: values.loanStatus || null,
    loanAmount: parseNum(values.loanAmt) ?? null,
    ...mapLoanRepaymentFields(values),
    ...mapPolicyBankFields(values),
    previousPolicyNo: values.previousPolicyNo.trim() || null,
    previousEndDate: toApiDateIso(values.previousEndDate),
    policyGroup: resolvePolicyGrouping(values),
    refundChequeAmount: parseNum(values.refundChequeAmt) ?? null,
    refundChequeNo: values.refundChequeNo.trim() || null,
    refundChequeDate: toApiDateIso(values.refundChequeDate),
    cdAccountUsed: values.cdAccountStatus === "YES" ? true : values.cdAccountStatus === "NO" ? false : null,
    cdAmount: parseNum(values.cdAmount) ?? null,
    courierStatus: values.notCourier || null,
    courierDate: toApiDateIso(values.courierDate),
    courierCompany: values.courierCompany.trim() || null,
    podNumber: values.podNumber.trim() || null,
    courierAddress: values.courierAddress.trim() || null,
    periodYearText: values.year.trim() || null,
    periodMonthText: values.month.trim() || null,
    addressLine1: values.address.trim() || null,
    addressLine2: values.addressTwo.trim() || null,
    addressLine3: values.addressThree.trim() || null,
    addressLine4: values.addressFour.trim() || null,
    city: values.city.trim() || null,
    pincode: values.pincode.trim() || null,
    nomineeName: values.nomineeName.trim() || null,
    nomineeRelation: values.nomineeRelation.trim() || null,
    nomineeDateOfBirth: toApiDateIso(values.nomineeDateOfBirth),
    contactPhone: values.nomineePhoneNumber.trim() || values.mobileFirst.replace(/\D/g, "").slice(0, 12) || null,
    whatsappNo: values.whatsappNo.replace(/\D/g, "").slice(0, 12) || null,
    remarks: combinedRemarks,
    holderCumulativeBonus: parseNum(values.comulativeBonus) ?? null,
    holderJoiningYear: values.joiningYear.trim() || null,
    holderBasicPremium: parseNum(values.basicPremiumPs) ?? null,
    taxPercent: parseNum(values.taxPercent) ?? null,
    taxAmount: parseNum(values.taxAmount) ?? null,
    svkkPremium: parseNum(values.svkkPremiumCalc) ?? null,
    netPremium: parseNum(values.netPremiumCalc) ?? null,
    vkkCommission: parseNum(values.vkkCommission) ?? null,
    policyHolderContribution: parseNum(values.policyHolderPremium) ?? null,
    premiumOneOrTwoLakh: parseNum(values.twoLakhF) ?? null,
    gaamMahajanContribution: parseNum(values.contribution) ?? null,
    differenceAmountPaidByHolder: parseNum(values.differenceAmountPaidByHolder) ?? null,
    vkkPremium: parseNum(values.vkkPremium) ?? null,
    grossPremium: parseNum(values.grossPremium) ?? null,
    commissionAmount: parseNum(values.commission) ?? null,
    twoLacFloater: parseNum(values.twoLakhF) ?? null,
    yearPolicyHolderPremium: parseNum(values.policyHolderPremium) ?? null,
    gaamMahajanVkk: parseNum(values.gaamMahajan) ?? null,
    excessShortAmount: parseNum(values.excessShort) ?? null,
    diffPaidByHolder: parseNum(values.diffAmt) ?? null,
    members: validMembers.map((m) => ({
      name: m.name.trim(),
      dob: toApiDateIso(m.dob)!,
      relationship: m.relationship.trim() || "Self",
      gender: m.gender || "M",
      sumInsured: parseNum(m.sumInsured) ?? null,
      cumulativeBonus: parseNum(m.cumulativeBonus) ?? null,
      dateOfJoining: toApiDateIso(m.dateOfJoining),
      memberPhone: m.phNo.trim() || null,
      addOnsAmount: parseNum(m.addOnsAmount) ?? null,
      basicPremium: parseNum(m.basicPremium) ?? null,
      ageAtEntry:
        parseNum(m.age) != null ? Math.round(parseNum(m.age)!) : ageAtDate(m.dob, ageAnchor) ?? null,
    })),
    payments: mapPaymentTransactionsToApi(values),
  };

  applyPrimaryPaymentModeToBody(body, values);
  if (co != null) {
    body.expectedNetPremium = co;
  }

  let res: Record<string, unknown>;
  try {
    res = await apiPost<Record<string, unknown>>("/policies", body, {
      headers: { "Idempotency-Key": idemKey },
    });
  } catch (e) {
    if (e instanceof AxiosError && e.response?.data && typeof e.response.data === "object") {
      const msg = (e.response.data as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        throw new Error(msg);
      }
    }
    throw e;
  }
  const id = typeof res.id === "string" ? res.id : null;
  if (!id) {
    throw new Error("Created but response had no id");
  }
  return id;
}

export type SubmitAdPolicyPatchParams = {
  policyId: string;
  values: AdPolicyFormValues;
  expectedUpdatedAt: string;
  yearLabel: string;
  categoryId?: string;
  policyTypeId?: string;
  policyChartId?: string;
};

/**
 * Full AD policy update via `PATCH /policies/:id` (same field set as create, plus optimistic concurrency).
 */
export async function submitAdPolicyPatchRequest({
  policyId,
  values,
  expectedUpdatedAt,
  yearLabel,
  categoryId,
  policyTypeId,
  policyChartId,
}: SubmitAdPolicyPatchParams): Promise<void> {
  const variant = toAdProductVariant(values.adProduct);
  if (!variant) {
    throw new Error("Invalid policy type");
  }
  const validMembers = values.members.filter((m) => m.name.trim() && m.dob);

  const si = parseNum(values.sumInsured);
  if (si == null || si <= 0) {
    throw new Error("Invalid sum insured");
  }
  const co = parseNum(values.coPremium);
  const ageAnchor = values.previousEndDate || values.policyEnd;
  const combinedRemarks = buildCombinedRemarks(values);
  validatePaymentTransactions(values);

  const apiPayments = mapPaymentTransactionsToApi(values);

  const body: Record<string, unknown> = {
    expectedUpdatedAt,
    yearLabel,
    insuredParty: {
      partyName: values.policyHolder.trim(),
      mobile: values.mobileFirst.replace(/\D/g, "").slice(0, 12),
      email: values.email.trim() || null,
      pan: values.panNo.trim() || null,
      aadhaarNo: values.aadhaarNo.trim() || null,
      dateOfBirth: toApiDateIso(values.dob),
      customerId: values.customerId.trim() || null,
      svkkPublicId: values.svkkPublicId.trim() || null,
    },
    members: validMembers.map((m) => ({
      name: m.name.trim(),
      dob: toApiDateIso(m.dob)!,
      relationship: m.relationship.trim() || "Self",
      gender: m.gender || "M",
      sumInsured: parseNum(m.sumInsured) ?? null,
      cumulativeBonus: parseNum(m.cumulativeBonus) ?? null,
      dateOfJoining: toApiDateIso(m.dateOfJoining),
      memberPhone: m.phNo.trim() || null,
      addOnsAmount: parseNum(m.addOnsAmount) ?? null,
      basicPremium: parseNum(m.basicPremium) ?? null,
      ageAtEntry:
        parseNum(m.age) != null ? Math.round(parseNum(m.age)!) : ageAtDate(m.dob, ageAnchor) ?? null,
    })),
    policyStart: toApiDateIso(values.policyStart),
    policyEnd: toApiDateIso(values.policyEnd),
    sumInsured: si,
    expectedNetPremium: co ?? null,
    policyNo: values.policyNo.trim() || null,
    village: values.village.trim() || null,
    adProductVariant: variant,
    insuranceCompany: values.company.trim() || null,
    tpa: values.tpa.trim() || null,
    categoryId: categoryId ?? undefined,
    categoryText: categoryId ? undefined : values.cat.trim() || null,
    holderRelationship: values.relation.trim() || null,
    holderGender: values.holderGender.trim() || null,
    holderJoiningDate: toApiDateIso(values.holderJoiningDate),
    holderAddOns: parseNum(values.holderAddOns) ?? null,
    holderAge:
      parseNum(values.age) != null ? Math.round(parseNum(values.age)!) : ageAtDate(values.dob, ageAnchor) ?? null,
    personsInsuredCount:
      parseNum(values.person) != null ? Math.round(parseNum(values.person)!) : validMembers.length,
    area: values.area.trim() || null,
    referenceNo: values.refNo.trim(),
    mobileSecondary: values.mobileSecond.trim() || null,
    policyGrouping: resolvePolicyGrouping(values),
    policyUrl: values.urls.length ? JSON.stringify(values.urls) : null,
    policyUrl2: values.url2.trim() || null,
    loanStatus: values.loanStatus || null,
    loanAmount: parseNum(values.loanAmt) ?? null,
    ...mapLoanRepaymentFields(values),
    ...mapPolicyBankFields(values),
    previousPolicyNo: values.previousPolicyNo.trim() || null,
    previousEndDate: toApiDateIso(values.previousEndDate),
    policyGroup: resolvePolicyGrouping(values),
    refundChequeAmount: parseNum(values.refundChequeAmt) ?? null,
    refundChequeNo: values.refundChequeNo.trim() || null,
    refundChequeDate: toApiDateIso(values.refundChequeDate),
    cdAccountUsed: values.cdAccountStatus === "YES" ? true : values.cdAccountStatus === "NO" ? false : null,
    cdAmount: parseNum(values.cdAmount) ?? null,
    courierStatus: values.notCourier || null,
    courierDate: toApiDateIso(values.courierDate),
    courierCompany: values.courierCompany.trim() || null,
    podNumber: values.podNumber.trim() || null,
    courierAddress: values.courierAddress.trim() || null,
    periodYearText: values.year.trim() || null,
    periodMonthText: values.month.trim() || null,
    addressLine1: values.address.trim() || null,
    addressLine2: values.addressTwo.trim() || null,
    addressLine3: values.addressThree.trim() || null,
    addressLine4: values.addressFour.trim() || null,
    city: values.city.trim() || null,
    pincode: values.pincode.trim() || null,
    nomineeName: values.nomineeName.trim() || null,
    nomineeRelation: values.nomineeRelation.trim() || null,
    nomineeDateOfBirth: toApiDateIso(values.nomineeDateOfBirth),
    contactPhone: values.nomineePhoneNumber.trim() || values.mobileFirst.replace(/\D/g, "").slice(0, 12) || null,
    whatsappNo: values.whatsappNo.replace(/\D/g, "").slice(0, 12) || null,
    remarks: combinedRemarks,
    holderCumulativeBonus: parseNum(values.comulativeBonus) ?? null,
    holderJoiningYear: values.joiningYear.trim() || null,
    holderBasicPremium: parseNum(values.basicPremiumPs) ?? null,
    taxPercent: parseNum(values.taxPercent) ?? null,
    taxAmount: parseNum(values.taxAmount) ?? null,
    svkkPremium: parseNum(values.svkkPremiumCalc) ?? null,
    netPremium: parseNum(values.netPremiumCalc) ?? null,
    vkkCommission: parseNum(values.vkkCommission) ?? null,
    policyHolderContribution: parseNum(values.policyHolderPremium) ?? null,
    premiumOneOrTwoLakh: parseNum(values.twoLakhF) ?? null,
    gaamMahajanContribution: parseNum(values.contribution) ?? null,
    differenceAmountPaidByHolder: parseNum(values.differenceAmountPaidByHolder) ?? null,
    vkkPremium: parseNum(values.vkkPremium) ?? null,
    grossPremium: parseNum(values.grossPremium) ?? null,
    commissionAmount: parseNum(values.commission) ?? null,
    twoLacFloater: parseNum(values.twoLakhF) ?? null,
    yearPolicyHolderPremium: parseNum(values.policyHolderPremium) ?? null,
    gaamMahajanVkk: parseNum(values.gaamMahajan) ?? null,
    excessShortAmount: parseNum(values.excessShort) ?? null,
    diffPaidByHolder: parseNum(values.diffAmt) ?? null,
    payments: apiPayments,
  };

  if (policyTypeId) {
    body.policyTypeId = policyTypeId;
  }
  if (policyChartId) {
    body.policyChartId = policyChartId;
  }

  debugPolicyUpdate("PATCH /policies/:id request", {
    policyId,
    yearLabel,
    adProduct: values.adProduct,
    adProductVariant: variant,
    policyTypeId: policyTypeId ?? null,
    policyChartId: policyChartId ?? null,
    expectedUpdatedAt,
    paymentTransactionCount: values.paymentTransactions.length,
    paymentApiCount: apiPayments.length,
  });

  applyPrimaryPaymentModeToBody(body, values);

  try {
    await apiPatch(`/policies/${policyId}`, body);
    debugPolicyUpdate("PATCH /policies/:id success", { policyId });
  } catch (e) {
    debugPolicyUpdate("PATCH /policies/:id failed", {
      policyId,
      message: e instanceof Error ? e.message : String(e),
      status: e instanceof AxiosError ? e.response?.status : undefined,
    });
    if (e instanceof AxiosError && e.response?.data && typeof e.response.data === "object") {
      const msg = (e.response.data as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        throw new Error(msg);
      }
    }
    throw e;
  }
}
