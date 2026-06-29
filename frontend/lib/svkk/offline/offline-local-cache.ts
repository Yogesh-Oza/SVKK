import type { SvkkPolicyDetailForForm } from "@/features/svkk-policies/ad-policy-detail-to-form";
import { compressDetail, compressListRowFromDetail, expandDetail } from "./compress";
import { getOfflineDb } from "./db";
import { getCachedReferenceBundle } from "./offline-reference";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function mergeInsuredParty(
  existing: SvkkPolicyDetailForForm["insuredParty"],
  patch: Record<string, unknown> | undefined,
): SvkkPolicyDetailForForm["insuredParty"] {
  if (!patch) return existing;
  return {
    ...existing,
    name: str(patch.partyName) ?? str(patch.name) ?? existing.name,
    mobile: str(patch.mobile) ?? existing.mobile,
    email: str(patch.email) ?? existing.email,
    pan: str(patch.pan) ?? existing.pan,
    customerId: str(patch.customerId) ?? existing.customerId,
    svkkPublicId: str(patch.svkkPublicId) ?? existing.svkkPublicId,
    aadhaarNo: str(patch.aadhaarNo) ?? existing.aadhaarNo,
    dateOfBirth: str(patch.dateOfBirth) ?? existing.dateOfBirth,
  };
}

async function resolveCategoryFromPatch(
  patch: Record<string, unknown>,
  existing: SvkkPolicyDetailForForm,
): Promise<SvkkPolicyDetailForForm["category"]> {
  const categoryId = str(patch.categoryId);
  const categoryText = str(patch.categoryText);
  if (categoryId) {
    const ref = await getCachedReferenceBundle();
    const cat = ref?.categories.find((c) => c.id === categoryId);
    if (cat) {
      return { key: cat.value?.trim() || cat.label, name: cat.label || cat.value };
    }
  }
  if (categoryText) {
    return existing.category ?? { key: categoryText, name: categoryText };
  }
  return existing.category;
}

async function resolvePolicyTypeFromPatch(
  patch: Record<string, unknown>,
  existing: SvkkPolicyDetailForForm,
): Promise<SvkkPolicyDetailForForm["policyType"]> {
  const policyTypeId = str(patch.policyTypeId);
  if (policyTypeId) {
    const ref = await getCachedReferenceBundle();
    const pt = ref?.policyTypes.find((t) => t.id === policyTypeId);
    if (pt) {
      return { id: pt.id, name: pt.label, key: pt.value };
    }
  }
  return existing.policyType ?? null;
}

/** Apply queued PATCH payload onto local IDB so list/detail show edits while offline. */
export async function applyOfflineUpdateToLocalCache(
  policyId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getOfflineDb();
  const stored = await db.policies_detail.get(policyId);
  if (!stored) return;

  const detail = expandDetail(stored);
  const yearLabel =
    str(payload.yearLabel) ??
    str(payload.periodYearText) ??
    detail.periodYearText ??
    detail.years[0]?.yearLabel ??
    "";
  const ip = payload.insuredParty as Record<string, unknown> | undefined;

  const mergeYearFields = (
    y: SvkkPolicyDetailForForm["years"][number],
  ): SvkkPolicyDetailForForm["years"][number] => ({
    ...y,
    sumInsured: payload.sumInsured ?? y.sumInsured,
    vkkPremium: payload.vkkPremium ?? y.vkkPremium,
    expectedNetPremium: payload.expectedNetPremium ?? y.expectedNetPremium,
    policyStart: str(payload.policyStart) ?? y.policyStart,
    policyEnd: str(payload.policyEnd) ?? y.policyEnd,
    members: Array.isArray(payload.members)
      ? (payload.members as SvkkPolicyDetailForForm["years"][number]["members"])
      : y.members,
    payments: Array.isArray(payload.payments)
      ? (payload.payments as SvkkPolicyDetailForForm["years"][number]["payments"])
      : y.payments,
  });

  const yearIdx = detail.years.findIndex((y) => y.yearLabel === yearLabel);
  const years =
    yearIdx >= 0
      ? detail.years.map((y, i) => (i === yearIdx ? mergeYearFields(y) : y))
      : detail.years.length === 1
        ? [mergeYearFields(detail.years[0]!)]
        : detail.years;

  const merged: SvkkPolicyDetailForForm = {
    ...detail,
    updatedAt: new Date().toISOString(),
    holderName: str(ip?.partyName) ?? detail.holderName,
    policyNo: str(payload.policyNo) ?? detail.policyNo,
    village: str(payload.village) ?? detail.village,
    area: str(payload.area) ?? detail.area,
    remarks: str(payload.remarks) ?? detail.remarks,
    referenceNo: str(payload.referenceNo) ?? detail.referenceNo,
    periodYearText: str(payload.periodYearText) ?? detail.periodYearText,
    periodMonthText: str(payload.periodMonthText) ?? detail.periodMonthText,
    adProductVariant: str(payload.adProductVariant) ?? detail.adProductVariant,
    policyGrouping: str(payload.policyGrouping) ?? detail.policyGrouping,
    whatsappNo: str(payload.whatsappNo) ?? detail.whatsappNo,
    personsInsuredCount:
      typeof payload.personsInsuredCount === "number"
        ? payload.personsInsuredCount
        : detail.personsInsuredCount,
    categoryText: str(payload.categoryText) ?? detail.categoryText,
    insuredParty: mergeInsuredParty(detail.insuredParty, ip),
    category: await resolveCategoryFromPatch(payload, detail),
    policyType: await resolvePolicyTypeFromPatch(payload, detail),
    years,
  };

  await db.policies_detail.put(compressDetail(merged as unknown as Record<string, unknown>));
  await db.policies_list.put(compressListRowFromDetail(merged));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("svkk-cache-synced"));
  }
}

function emptyDetailShell(id: string): SvkkPolicyDetailForForm {
  return {
    id,
    updatedAt: new Date().toISOString(),
    policyNo: null,
    village: null,
    insuranceCompany: null,
    tpa: null,
    personsInsuredCount: null,
    policyGrouping: null,
    policyUrl: null,
    policyUrl2: null,
    addressLine1: null,
    addressLine2: null,
    addressLine3: null,
    addressLine4: null,
    area: null,
    city: null,
    pincode: null,
    nomineeName: null,
    nomineeRelation: null,
    contactPhone: null,
    remarks: null,
    referenceNo: null,
    periodYearText: null,
    periodMonthText: null,
    holderRelationship: null,
    holderGender: null,
    holderJoiningDate: null,
    holderAge: null,
    holderAddOns: null,
    categoryText: null,
    mobileSecondary: null,
    loanStatus: null,
    loanAmount: null,
    previousPolicyNo: null,
    previousEndDate: null,
    policyGroup: null,
    refundChequeAmount: null,
    refundChequeNo: null,
    refundChequeDate: null,
    cdAccountUsed: null,
    cdAmount: null,
    courierStatus: null,
    courierDate: null,
    courierCompany: null,
    podNumber: null,
    courierAddress: null,
    insuredParty: {
      svkkPublicId: "",
      name: "",
      mobile: "",
      email: null,
      customerId: null,
      pan: null,
      aadhaarNo: null,
      dateOfBirth: null,
    },
    category: null,
    years: [],
  };
}

function emptyYearShell(yearLabel: string): SvkkPolicyDetailForForm["years"][number] {
  return {
    yearLabel,
    policyStart: null,
    policyEnd: null,
    sumInsured: null,
    expectedNetPremium: null,
    vkkPremium: null,
    grossPremium: null,
    commissionAmount: null,
    twoLacFloater: null,
    yearPolicyHolderPremium: null,
    gaamMahajanVkk: null,
    excessShortAmount: null,
    diffPaidByHolder: null,
    holderCumulativeBonus: null,
    holderJoiningYear: null,
    holderBasicPremium: null,
    members: [],
    payments: [],
  };
}

/** Insert offline-created policy into IDB so list/detail work before server sync. */
export async function applyOfflineCreateToLocalCache(
  clientTempId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const shell = emptyDetailShell(clientTempId);
  const yearLabel =
    str(payload.yearLabel) ?? str(payload.periodYearText) ?? String(new Date().getFullYear());

  const detail: SvkkPolicyDetailForForm = {
    ...shell,
    updatedAt: new Date().toISOString(),
    holderName: str(payload.partyName),
    policyNo: str(payload.policyNo),
    village: str(payload.village),
    area: str(payload.area),
    remarks: str(payload.remarks),
    referenceNo: str(payload.referenceNo),
    periodYearText: str(payload.periodYearText) ?? yearLabel,
    periodMonthText: str(payload.periodMonthText),
    adProductVariant: str(payload.adProductVariant),
    policyGrouping: str(payload.policyGrouping),
    whatsappNo: str(payload.whatsappNo),
    insuranceCompany: str(payload.insuranceCompany),
    tpa: str(payload.tpa),
    personsInsuredCount:
      typeof payload.personsInsuredCount === "number" ? payload.personsInsuredCount : null,
    categoryText: str(payload.categoryText),
    addressLine1: str(payload.addressLine1),
    addressLine2: str(payload.addressLine2),
    addressLine3: str(payload.addressLine3),
    addressLine4: str(payload.addressLine4),
    city: str(payload.city),
    pincode: str(payload.pincode),
    insuredParty: {
      svkkPublicId: str(payload.svkkPublicId) ?? "",
      name: str(payload.partyName) ?? "",
      mobile: str(payload.mobile) ?? "",
      email: str(payload.email),
      customerId: str(payload.customerId),
      pan: str(payload.pan),
      aadhaarNo: str(payload.aadhaarNo),
      dateOfBirth: str(payload.dateOfBirth),
    },
    category: await resolveCategoryFromPatch(payload, shell),
    policyType: await resolvePolicyTypeFromPatch(payload, shell),
    years: [
      {
        ...emptyYearShell(yearLabel),
        policyStart: str(payload.policyStart),
        policyEnd: str(payload.policyEnd),
        sumInsured: (payload.sumInsured as SvkkPolicyDetailForForm["years"][number]["sumInsured"]) ?? null,
        vkkPremium: (payload.vkkPremium as SvkkPolicyDetailForForm["years"][number]["vkkPremium"]) ?? null,
        expectedNetPremium:
          (payload.expectedNetPremium as SvkkPolicyDetailForForm["years"][number]["expectedNetPremium"]) ??
          null,
        grossPremium:
          (payload.grossPremium as SvkkPolicyDetailForForm["years"][number]["grossPremium"]) ?? null,
        commissionAmount:
          (payload.commissionAmount as SvkkPolicyDetailForForm["years"][number]["commissionAmount"]) ??
          null,
        members: Array.isArray(payload.members)
          ? (payload.members as SvkkPolicyDetailForForm["years"][number]["members"])
          : [],
        payments: Array.isArray(payload.payments)
          ? (payload.payments as SvkkPolicyDetailForForm["years"][number]["payments"])
          : [],
      },
    ],
  };

  const db = getOfflineDb();
  await db.policies_detail.put(compressDetail(detail as unknown as Record<string, unknown>));
  await db.policies_list.put(compressListRowFromDetail(detail));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("svkk-cache-synced"));
  }
}
