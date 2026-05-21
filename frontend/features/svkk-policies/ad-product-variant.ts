import type { AdProductVariant } from "./ad-policy-types";

export const AD_PRODUCT_MAP: Record<string, AdProductVariant> = {
  "Family-Floater": "FAMILY_FLOATER",
  Individual: "INDIVIDUAL",
  "Asha-Kiran": "ASHA_KIRAN",
  "Senior-Citizen": "SENIOR_CITIZEN",
};

export function toAdProductVariant(v: string): AdProductVariant | undefined {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const fromForm = AD_PRODUCT_MAP[trimmed];
  if (fromForm) return fromForm;
  return policyTypeKeyToAdVariant(trimmed);
}

/** Maps admin PolicyType.key (e.g. family_floater) to API AdProductVariant. */
export function policyTypeKeyToAdVariant(key: string): AdProductVariant | undefined {
  const k = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const map: Record<string, AdProductVariant> = {
    family_floater: "FAMILY_FLOATER",
    individual: "INDIVIDUAL",
    asha_kiran: "ASHA_KIRAN",
    senior_citizen: "SENIOR_CITIZEN",
    ad_policy: "FAMILY_FLOATER",
  };
  return map[k];
}

const VARIANT_TO_FORM: Record<AdProductVariant, string> = {
  FAMILY_FLOATER: "Family-Floater",
  INDIVIDUAL: "Individual",
  ASHA_KIRAN: "Asha-Kiran",
  SENIOR_CITIZEN: "Senior-Citizen",
};

/** Maps API `AdProductVariant` enum string to Add-policy form select value. */
export function adProductFormValueFromApi(v: string | null | undefined): string {
  return resolveAdProductFormValue(v, null);
}

/**
 * Resolves the Policy Type dropdown value from API variant and/or policy type name.
 */
const POLICY_TYPE_KEY_TO_FORM: Record<string, string> = {
  asha_kiran: "Asha-Kiran",
  family_floater: "Family-Floater",
  individual: "Individual",
  senior_citizen: "Senior-Citizen",
};

export function resolveAdProductFormValue(
  variant: string | null | undefined,
  policyTypeName: string | null | undefined,
  policyTypeKey?: string | null | undefined,
): string {
  if (variant) {
    const fromEnum = VARIANT_TO_FORM[variant as AdProductVariant];
    if (fromEnum) return fromEnum;
  }
  const key = policyTypeKey?.trim().toLowerCase();
  if (key && POLICY_TYPE_KEY_TO_FORM[key]) {
    return POLICY_TYPE_KEY_TO_FORM[key];
  }
  const name = policyTypeName?.trim();
  if (!name) return "";

  const byOption = AD_PRODUCT_OPTIONS.find(
    (o) =>
      o.value === name ||
      o.label === name ||
      o.value.replace(/-/g, " ").toLowerCase() === name.replace(/-/g, " ").toLowerCase(),
  );
  if (byOption) return byOption.value;

  if (name in AD_PRODUCT_MAP) return name;

  const lower = name.toLowerCase();
  for (const [formVal] of Object.entries(AD_PRODUCT_MAP)) {
    if (formVal.toLowerCase() === lower) return formVal;
  }
  for (const [formVal, enumVal] of Object.entries(AD_PRODUCT_MAP)) {
    if (enumVal.toLowerCase().replace(/_/g, " ") === lower.replace(/-/g, " ")) {
      return formVal;
    }
  }
  return "";
}

export const AD_PRODUCT_OPTIONS = [
  { value: "Asha-Kiran", label: "Asha Kiran" },
  { value: "Family-Floater", label: "Family Floater" },
  { value: "Individual", label: "Individual" },
  { value: "Senior-Citizen", label: "Senior Citizen" },
] as const;
