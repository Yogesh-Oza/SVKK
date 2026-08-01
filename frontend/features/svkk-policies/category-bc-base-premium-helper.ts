import { quoteFromInput } from "@/lib/svkk/premium/engine";
import { normPolicyKey } from "@/lib/svkk/premium/storage";
import type { MemberInput, PolicyKey, PremiumState, Quote } from "@/lib/svkk/premium/types";
import { normalizeCategoryKey } from "@/lib/svkk/category-display";
import type { AdPolicyFormValues } from "./ad-policy-form-values";
import { genderToQuoteInput, parseInrForCalc } from "./ad-policy-auto-calc";

/** Policy types that participate in the Category B/C base-premium helper. */
export const CATEGORY_BC_HELPER_POLICY_TYPES = [
  "individual",
  "family_floater",
  "asha_kiran",
] as const;

export type CategoryBcHelperPolicyType = (typeof CATEGORY_BC_HELPER_POLICY_TYPES)[number];

/** Minimum actual SI (inclusive) that triggers the helper popup. */
export const CATEGORY_BC_HELPER_TRIGGER_SI: Record<CategoryBcHelperPolicyType, number> = {
  individual: 200_000,
  family_floater: 200_000,
  asha_kiran: 300_000,
};

/** Base SI used for the helper chart quote (1L / 2L / 3L). */
export const CATEGORY_BC_HELPER_BASE_SI: Record<CategoryBcHelperPolicyType, number> = {
  individual: 100_000,
  family_floater: 200_000,
  asha_kiran: 300_000,
};

export function isCategoryBcHelperPolicyType(key: string): key is CategoryBcHelperPolicyType {
  return (CATEGORY_BC_HELPER_POLICY_TYPES as readonly string[]).includes(key);
}

/** True for Category B or C only. */
export function isCategoryBc(categoryRaw: string | null | undefined): boolean {
  const cat = normalizeCategoryKey(categoryRaw);
  return cat === "b" || cat === "c";
}

export type CategoryBcHelperEligibility = {
  eligible: boolean;
  category: string;
  policyType: CategoryBcHelperPolicyType | null;
  actualSi: number;
  baseSi: number;
  triggerSi: number;
  /**
   * Trigger key for change detection (category|policyType|actualSi).
   * Empty when not eligible. Used only to detect changes — not as a permanent suppress list.
   */
  fingerprint: string;
};

/**
 * Whether the Category B/C base-premium helper should be offered for the current
 * Category + Policy Type + Sum Insured combination.
 *
 * Uses the policy-level Sum Insured field only (not member SI fallback), so member
 * edits do not re-trigger the popup.
 */
export function resolveCategoryBcBasePremiumEligibility(input: {
  category: string;
  policyType: string;
  sumInsured: string;
}): CategoryBcHelperEligibility {
  const category = normalizeCategoryKey(input.category);
  const policyTypeRaw = normPolicyKey(input.policyType || "");
  const policyType = isCategoryBcHelperPolicyType(policyTypeRaw) ? policyTypeRaw : null;
  const actualSi = parseInrForCalc(input.sumInsured);

  const empty: CategoryBcHelperEligibility = {
    eligible: false,
    category,
    policyType,
    actualSi,
    baseSi: 0,
    triggerSi: 0,
    fingerprint: "",
  };

  if (!isCategoryBc(category) || !policyType || actualSi <= 0) {
    return empty;
  }

  const triggerSi = CATEGORY_BC_HELPER_TRIGGER_SI[policyType];
  const baseSi = CATEGORY_BC_HELPER_BASE_SI[policyType];
  const eligible = actualSi >= triggerSi;
  const fingerprint = eligible ? `${category}|${policyType}|${actualSi}` : "";

  return {
    eligible,
    category,
    policyType,
    actualSi,
    baseSi,
    triggerSi,
    fingerprint,
  };
}

/**
 * Change-driven open decision: open whenever the eligibility trigger key changes
 * to a new eligible combination — even if that combination was shown earlier.
 * Unrelated field edits leave the key unchanged → do not open.
 * Ineligible / empty key resets tracking so the next eligible change opens again.
 */
export function shouldOpenCategoryBcBasePremiumOnTriggerChange(input: {
  eligible: boolean;
  fingerprint: string;
  previousFingerprint: string | null;
}): { open: boolean; nextPreviousFingerprint: string | null } {
  if (!input.eligible || !input.fingerprint) {
    return { open: false, nextPreviousFingerprint: null };
  }
  if (input.fingerprint === input.previousFingerprint) {
    return { open: false, nextPreviousFingerprint: input.previousFingerprint };
  }
  return { open: true, nextPreviousFingerprint: input.fingerprint };
}

/** Human label for the base SI slab used in the helper. */
export function categoryBcHelperBaseSiLabel(policyType: CategoryBcHelperPolicyType): string {
  switch (policyType) {
    case "individual":
      return "₹1 Lakh (Individual base)";
    case "family_floater":
      return "₹2 Lakh (Family Floater base)";
    case "asha_kiran":
      return "₹3 Lakh (Asha Kiran base)";
  }
}

/** Short label for Apply / field context (avoid wrong “2 Lakh Floater” for AK). */
export function categoryBcHelperFieldHint(policyType: CategoryBcHelperPolicyType): string {
  switch (policyType) {
    case "individual":
      return "1 Lakh Individual base premium";
    case "family_floater":
      return "2 Lakh Floater base premium";
    case "asha_kiran":
      return "3 Lakh Asha Kiran base premium";
  }
}

export function formatCategoryBcHelperPremiumValue(net: number): string {
  if (!Number.isFinite(net) || net < 0) {
    return "";
  }
  return String(Math.round(net * 100) / 100);
}

/**
 * Build a chart quote for the helper using the policy-type base SI
 * (not the actual policy SI), reusing `quoteFromInput`.
 */
export function quoteCategoryBcBasePremium(input: {
  values: AdPolicyFormValues;
  premiumState: PremiumState;
  baseSi: number;
  policyType: CategoryBcHelperPolicyType;
}): Quote {
  const { values, premiumState, baseSi, policyType } = input;
  const rawKey = normPolicyKey(values.adProduct || "");
  const policyKey: PolicyKey = premiumState.charts[rawKey] ? rawKey : policyType;
  const isIndividual = policyType === "individual" || policyKey === "individual";
  const endDate = values.previousEndDate || values.policyEnd || "";
  const validMembers = (values.members || []).filter((m) => Boolean(m.name?.trim()) && Boolean(m.dob));
  const memberCount = 1 + validMembers.length;

  const holderMember: MemberInput = {
    name: values.policyHolder || "Policy Holder",
    dob: values.dob || "",
    relationship: (values.relation || "self").toLowerCase() || "self",
    gender: genderToQuoteInput(values.holderGender),
    addOnRider: parseInrForCalc(values.holderAddOns),
    ...(isIndividual ? { sumInsured: baseSi } : {}),
  };

  const memberInputs: MemberInput[] = validMembers.map((m, i) => ({
    name: m.name.trim() || `Member ${i + 1}`,
    dob: m.dob,
    relationship: (m.relationship || "member").toLowerCase() || "member",
    gender: genderToQuoteInput(m.gender),
    addOnRider: parseInrForCalc(m.addOnsAmount),
    ...(isIndividual ? { sumInsured: baseSi } : {}),
  }));

  return quoteFromInput(premiumState, {
    policyType: policyKey,
    memberCount,
    sumInsured: baseSi,
    endDate,
    members: [holderMember, ...memberInputs],
  });
}
