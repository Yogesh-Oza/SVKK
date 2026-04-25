import type { AdProductVariant } from "./ad-policy-types";

export const AD_PRODUCT_MAP: Record<string, AdProductVariant> = {
  "Family-Floater": "FAMILY_FLOATER",
  Individual: "INDIVIDUAL",
  "Asha-Kiran": "ASHA_KIRAN",
};

export function toAdProductVariant(v: string): AdProductVariant | undefined {
  return AD_PRODUCT_MAP[v];
}

export const AD_PRODUCT_OPTIONS = [
  { value: "Family-Floater", label: "Family Floater" },
  { value: "Individual", label: "Individual" },
  { value: "Asha-Kiran", label: "Asha kiran" },
] as const;
