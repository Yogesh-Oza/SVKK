import type { AdProductVariant } from "./ad-policy-types";

export const AD_PRODUCT_MAP: Record<string, AdProductVariant> = {
  "Family-Floater": "FAMILY_FLOATER",
  Individual: "INDIVIDUAL",
  "Asha-Kiran": "ASHA_KIRAN",
};

export function toAdProductVariant(v: string): AdProductVariant | undefined {
  return AD_PRODUCT_MAP[v];
}

const VARIANT_TO_FORM: Record<AdProductVariant, string> = {
  FAMILY_FLOATER: "Family-Floater",
  INDIVIDUAL: "Individual",
  ASHA_KIRAN: "Asha-Kiran",
};

/** Maps API `AdProductVariant` enum string to Add-policy form select value. */
export function adProductFormValueFromApi(v: string | null | undefined): string {
  if (!v) {
    return "";
  }
  return VARIANT_TO_FORM[v as AdProductVariant] ?? "";
}

export const AD_PRODUCT_OPTIONS = [
  { value: "Family-Floater", label: "Family Floater" },
  { value: "Individual", label: "Individual" },
  { value: "Asha-Kiran", label: "Asha Kiran" },
] as const;
