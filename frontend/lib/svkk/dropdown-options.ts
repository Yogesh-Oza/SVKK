/**
 * Mirrors backend's DropdownType enum.
 * Keep this in sync with `prisma/schema.prisma` -> `enum DropdownType`.
 */
export const DROPDOWN_TYPES = [
  "AREA",
  "VILLAGE",
  "CITY",
  "RELATION",
  "GENDER",
  "SUM_INSURED",
  "PAYMENT_MODE",
  "TRANSACTION_STATUS",
  "YES_NO",
] as const;

export type DropdownType = (typeof DROPDOWN_TYPES)[number];

export type DropdownOption = {
  value: string;
  label: string;
};

export type DropdownOptionsMap = Record<DropdownType, DropdownOption[]>;

/** Empty initial state with every key present so consumers can read safely. */
export function emptyDropdownOptionsMap(): DropdownOptionsMap {
  return DROPDOWN_TYPES.reduce((acc, t) => {
    acc[t] = [];
    return acc;
  }, {} as DropdownOptionsMap);
}

/**
 * Human-readable group labels (admin UI tab list).
 */
export const DROPDOWN_TYPE_LABELS: Record<DropdownType, string> = {
  AREA: "Area",
  VILLAGE: "Village",
  CITY: "City",
  RELATION: "Relation",
  GENDER: "Gender",
  SUM_INSURED: "Sum Insured",
  PAYMENT_MODE: "Mode of Payment",
  TRANSACTION_STATUS: "Transaction Status",
  YES_NO: "Yes / No",
};
