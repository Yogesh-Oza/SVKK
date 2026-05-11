import { apiPatch, apiPost } from "@/lib/svkk/api";
import { toAdProductVariant } from "./ad-product-variant";
import type { AdPolicyFormValues } from "./ad-policy-form-values";

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
  const dobDate = new Date(dob);
  const anchorDate = new Date(anchor);
  if (Number.isNaN(dobDate.getTime()) || Number.isNaN(anchorDate.getTime())) {
    return undefined;
  }
  const diff = anchorDate.getTime() - dobDate.getTime();
  if (diff < 0) {
    return undefined;
  }
  return Math.floor(diff / (365.2425 * 24 * 60 * 60 * 1000));
}

function buildCombinedRemarks(values: AdPolicyFormValues): string | null {
  const parts: string[] = [];
  if (values.generalRemark.trim()) {
    parts.push(`General Remark:\n${values.generalRemark.trim()}`);
  }
  if (values.policyChangeRemark.trim()) {
    parts.push(`Policy Change Remark:\n${values.policyChangeRemark.trim()}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export type SubmitAdPolicyParams = {
  values: AdPolicyFormValues;
  policyTypeId: string;
  policyChartId: string;
  idemKey: string;
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
  const primaryPaymentMode = values.paymentTransactions[0]?.mode ?? values.paymentMode;
  const yearLabel = values.year.trim() || String(new Date().getFullYear());
  const combinedRemarks = buildCombinedRemarks(values);

  const body: Record<string, unknown> = {
    mobile: values.mobileFirst.replace(/\D/g, "").slice(0, 12),
    partyName: values.policyHolder.trim(),
    email: values.email.trim() || null,
    pan: values.panNo.trim() || null,
    dateOfBirth: values.dob ? new Date(values.dob).toISOString() : null,
    policyTypeId,
    policyChartId,
    yearLabel,
    policyStart: values.policyStart ? new Date(values.policyStart).toISOString() : null,
    policyEnd: values.policyEnd ? new Date(values.policyEnd).toISOString() : null,
    sumInsured: si,
    expectedNetPremium: co ?? null,
    policyNo: values.policyNo.trim() || null,
    village: values.village.trim() || null,
    adProductVariant: variant,
    customerId: values.customerId.trim() || null,
    svkkPublicId: values.svkkPublicId.trim() || null,
    insuranceCompany: values.company.trim() || null,
    tpa: values.tpa.trim() || null,
    categoryText: values.cat.trim() || null,
    holderRelationship: values.relation.trim() || null,
    holderGender: values.holderGender.trim() || null,
    holderJoiningDate: values.holderJoiningDate ? new Date(values.holderJoiningDate).toISOString() : null,
    holderAddOns: parseNum(values.holderAddOns) ?? null,
    holderAge:
      parseNum(values.age) != null ? Math.round(parseNum(values.age)!) : ageAtDate(values.dob, ageAnchor) ?? null,
    personsInsuredCount:
      parseNum(values.person) != null ? Math.round(parseNum(values.person)!) : validMembers.length,
    area: values.area.trim() || null,
    referenceNo: values.refNo.trim(),
    mobileSecondary: values.mobileSecond.trim() || null,
    policyGrouping: values.policyGrouping || null,
    policyUrl: values.url.trim() || null,
    loanStatus: values.loanStatus || null,
    loanAmount: parseNum(values.loanAmt) ?? null,
    previousPolicyNo: values.previousPolicyNo.trim() || null,
    previousEndDate: values.previousEndDate ? new Date(values.previousEndDate).toISOString() : null,
    policyGroup: values.policyGroup.trim() || null,
    refundChequeAmount: parseNum(values.refundChequeAmt) ?? null,
    refundChequeNo: values.refundChequeNo.trim() || null,
    refundChequeDate: values.refundChequeDate ? new Date(values.refundChequeDate).toISOString() : null,
    cdAccountUsed: values.cdAccountStatus === "YES" ? true : values.cdAccountStatus === "NO" ? false : null,
    cdAmount: parseNum(values.cdAmount) ?? null,
    courierStatus: values.notCourier || null,
    courierDate: values.courierDate ? new Date(values.courierDate).toISOString() : null,
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
    contactPhone: values.nomineePhoneNumber.trim() || values.mobileFirst.replace(/\D/g, "").slice(0, 12) || null,
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
      dob: new Date(m.dob).toISOString(),
      relationship: m.relationship.trim() || "Self",
      gender: m.gender || "M",
      sumInsured: parseNum(m.sumInsured) ?? null,
      cumulativeBonus: parseNum(m.cumulativeBonus) ?? null,
      dateOfJoining: m.dateOfJoining ? new Date(m.dateOfJoining).toISOString() : null,
      memberPhone: m.phNo.trim() || null,
      addOnsAmount: parseNum(m.addOnsAmount) ?? null,
      basicPremium: parseNum(m.basicPremium) ?? null,
      ageAtEntry:
        parseNum(m.age) != null ? Math.round(parseNum(m.age)!) : ageAtDate(m.dob, ageAnchor) ?? null,
    })),
    payments: values.paymentTransactions
      .filter((row) => parseNum(row.amountReceived) != null)
      .map((row) => ({
        amount: parseNum(row.amountReceived)!,
        method:
          row.mode === "CHEQUE" ? "CHQ" : row.mode === "NEFT" ? "NEFT" : row.mode === "CASH" ? "CASH" : "UPI",
        status: row.transactionStatus || null,
        transactionNumber: row.transactionNumber.trim() || null,
        transactionDate: row.transactionDate ? new Date(row.transactionDate).toISOString() : null,
        bankName: row.bankName.trim() || null,
        branchName: row.branch.trim() || null,
        accountNumber: row.accountNumber.trim() || null,
        nameAsPerCheque: row.nameAsPerCheque.trim() || null,
        ifscCode: row.ifscCode.trim() || null,
        notOver: row.notOver.trim() || null,
        dishonourReason: row.dishonourReason.trim() || null,
        returnCharges: parseNum(row.returnCharges) ?? null,
      })),
  };

  if (primaryPaymentMode === "ONLINE" || primaryPaymentMode === "NEFT") {
    body.paymentMode = "UPI";
    body.utrRef = values.onlineTransactionRef.trim() || null;
    if (co != null) {
      body.expectedNetPremium = co;
    }
  } else if (primaryPaymentMode === "CHEQUE") {
    if (co == null) {
      throw new Error("Net premium is required for cheque payment.");
    }
    if (!values.policyChequeNo.trim() || !values.bank.trim()) {
      throw new Error("Cheque details incomplete.");
    }
    const st =
      values.chequeStatus === "DISHONOURED"
        ? "DISHONOURED"
        : values.chequeStatus === "CLEARED"
          ? "CLEARED"
          : "PENDING";
    body.initialPayment = {
      amount: co,
      method: "CHQ",
      cheque: {
        number: values.policyChequeNo.trim(),
        bankName: values.bank.trim(),
        ifsc: values.ifsc.trim() || null,
        status: st,
        reason: st === "DISHONOURED" ? values.reasonDishonoured.trim() || "Dishonoured" : null,
        accountNo: values.accountNo.trim() || null,
        branch: values.branch.trim() || null,
        nameAsPerCheque: values.nameAsPerCheque.trim() || null,
        notOver: values.notOver.trim() || null,
        chequeDate: values.chequeDate ? new Date(values.chequeDate).toISOString() : null,
      },
    };
    body.paymentMode = "CHQ";
    body.bankName = values.bank.trim() || null;
    body.bankAccountLast4 = values.accountNo.trim() ? values.accountNo.replace(/\D/g, "").slice(-4) : null;
  } else if (primaryPaymentMode === "CASH") {
    body.paymentMode = "CASH";
  }

  const res = await apiPost<Record<string, unknown>>("/policies", body, {
    headers: { "Idempotency-Key": idemKey },
  });
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
};

/**
 * Full AD policy update via `PATCH /policies/:id` (same field set as create, plus optimistic concurrency).
 */
export async function submitAdPolicyPatchRequest({
  policyId,
  values,
  expectedUpdatedAt,
  yearLabel,
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
  const primaryPaymentMode = values.paymentTransactions[0]?.mode ?? values.paymentMode;
  const combinedRemarks = buildCombinedRemarks(values);

  const body: Record<string, unknown> = {
    expectedUpdatedAt,
    yearLabel,
    insuredParty: {
      partyName: values.policyHolder.trim(),
      mobile: values.mobileFirst.replace(/\D/g, "").slice(0, 12),
      email: values.email.trim() || null,
      pan: values.panNo.trim() || null,
      dateOfBirth: values.dob ? new Date(values.dob).toISOString() : null,
      customerId: values.customerId.trim() || null,
      svkkPublicId: values.svkkPublicId.trim() || null,
    },
    members: validMembers.map((m) => ({
      name: m.name.trim(),
      dob: new Date(m.dob).toISOString(),
      relationship: m.relationship.trim() || "Self",
      gender: m.gender || "M",
      sumInsured: parseNum(m.sumInsured) ?? null,
      cumulativeBonus: parseNum(m.cumulativeBonus) ?? null,
      dateOfJoining: m.dateOfJoining ? new Date(m.dateOfJoining).toISOString() : null,
      memberPhone: m.phNo.trim() || null,
      addOnsAmount: parseNum(m.addOnsAmount) ?? null,
      basicPremium: parseNum(m.basicPremium) ?? null,
      ageAtEntry:
        parseNum(m.age) != null ? Math.round(parseNum(m.age)!) : ageAtDate(m.dob, ageAnchor) ?? null,
    })),
    policyStart: values.policyStart ? new Date(values.policyStart).toISOString() : null,
    policyEnd: values.policyEnd ? new Date(values.policyEnd).toISOString() : null,
    sumInsured: si,
    expectedNetPremium: co ?? null,
    policyNo: values.policyNo.trim() || null,
    village: values.village.trim() || null,
    adProductVariant: variant,
    insuranceCompany: values.company.trim() || null,
    tpa: values.tpa.trim() || null,
    categoryText: values.cat.trim() || null,
    holderRelationship: values.relation.trim() || null,
    holderGender: values.holderGender.trim() || null,
    holderJoiningDate: values.holderJoiningDate ? new Date(values.holderJoiningDate).toISOString() : null,
    holderAddOns: parseNum(values.holderAddOns) ?? null,
    holderAge:
      parseNum(values.age) != null ? Math.round(parseNum(values.age)!) : ageAtDate(values.dob, ageAnchor) ?? null,
    personsInsuredCount:
      parseNum(values.person) != null ? Math.round(parseNum(values.person)!) : validMembers.length,
    area: values.area.trim() || null,
    referenceNo: values.refNo.trim(),
    mobileSecondary: values.mobileSecond.trim() || null,
    policyGrouping: values.policyGrouping || null,
    policyUrl: values.url.trim() || null,
    loanStatus: values.loanStatus || null,
    loanAmount: parseNum(values.loanAmt) ?? null,
    previousPolicyNo: values.previousPolicyNo.trim() || null,
    previousEndDate: values.previousEndDate ? new Date(values.previousEndDate).toISOString() : null,
    policyGroup: values.policyGroup.trim() || null,
    refundChequeAmount: parseNum(values.refundChequeAmt) ?? null,
    refundChequeNo: values.refundChequeNo.trim() || null,
    refundChequeDate: values.refundChequeDate ? new Date(values.refundChequeDate).toISOString() : null,
    cdAccountUsed: values.cdAccountStatus === "YES" ? true : values.cdAccountStatus === "NO" ? false : null,
    cdAmount: parseNum(values.cdAmount) ?? null,
    courierStatus: values.notCourier || null,
    courierDate: values.courierDate ? new Date(values.courierDate).toISOString() : null,
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
    contactPhone: values.nomineePhoneNumber.trim() || values.mobileFirst.replace(/\D/g, "").slice(0, 12) || null,
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
    payments: values.paymentTransactions
      .filter((row) => parseNum(row.amountReceived) != null)
      .map((row) => ({
        amount: parseNum(row.amountReceived)!,
        method:
          row.mode === "CHEQUE" ? "CHQ" : row.mode === "NEFT" ? "NEFT" : row.mode === "CASH" ? "CASH" : "UPI",
        status: row.transactionStatus || null,
        transactionNumber: row.transactionNumber.trim() || null,
        transactionDate: row.transactionDate ? new Date(row.transactionDate).toISOString() : null,
        bankName: row.bankName.trim() || null,
        branchName: row.branch.trim() || null,
        accountNumber: row.accountNumber.trim() || null,
        nameAsPerCheque: row.nameAsPerCheque.trim() || null,
        ifscCode: row.ifscCode.trim() || null,
        notOver: row.notOver.trim() || null,
        dishonourReason: row.dishonourReason.trim() || null,
        returnCharges: parseNum(row.returnCharges) ?? null,
      })),
  };

  if (primaryPaymentMode === "ONLINE" || primaryPaymentMode === "NEFT") {
    body.paymentMode = "UPI";
    body.utrRef = values.onlineTransactionRef.trim() || null;
  } else if (primaryPaymentMode === "CHEQUE") {
    body.paymentMode = "CHQ";
    body.bankName = values.bank.trim() || null;
    body.bankAccountLast4 = values.accountNo.trim() ? values.accountNo.replace(/\D/g, "").slice(-4) : null;
  } else if (primaryPaymentMode === "CASH") {
    body.paymentMode = "CASH";
  }

  await apiPatch(`/policies/${policyId}`, body);
}
