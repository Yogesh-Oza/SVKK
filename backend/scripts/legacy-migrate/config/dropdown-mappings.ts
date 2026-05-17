import type { ChequeStatus, PayMethod } from "@prisma/client";

/** Legacy relation text → DropdownOption.value */
export const RELATION_MAP: Record<string, string> = {
  self: "Self",
  wife: "Spouse",
  husband: "Spouse",
  spouse: "Spouse",
  son: "Son",
  daughter: "Daughter",
  father: "Father",
  mother: "Mother",
  brother: "Brother",
  sister: "Sister",
  sibling: "Sister",
  grandfather: "Grandfather",
  grandmother: "Grandmother",
  other: "Other",
  others: "Other",
};

/** Legacy gender → GENDER value */
export const GENDER_MAP: Record<string, string> = {
  male: "M",
  m: "M",
  female: "F",
  f: "F",
  other: "O",
  o: "O",
};

/** Legacy payment mode text → PAYMENT_MODE value */
export const PAYMENT_MODE_MAP: Record<string, string> = {
  cash: "CASH",
  cheque: "CHEQUE",
  check: "CHEQUE",
  chq: "CHEQUE",
  online: "ONLINE",
  neft: "ONLINE",
  upi: "UPI",
};

export const PAYMENT_MODE_FALLBACK = "CASH";

/** Legacy cheque status → TRANSACTION_STATUS dropdown value */
export const TRANSACTION_STATUS_MAP: Record<string, string> = {
  cleared: "CLEARED",
  dishonoured: "DISHONOURED",
  dishonored: "DISHONOURED",
  pending: "PENDING",
  paid: "CLEARED",
  unpaid: "PENDING",
};

/** PAYMENT_MODE dropdown → PayMethod enum */
export function paymentModeToPayMethod(mode: string | null | undefined): PayMethod {
  const u = (mode ?? "").toUpperCase();
  if (u === "UPI") return "UPI";
  if (u === "CHEQUE" || u === "CHQ") return "CHQ";
  if (u === "CASH") return "CASH";
  if (u === "ONLINE" || u === "NEFT") return "NEFT";
  return "OTHER";
}

/** TRANSACTION_STATUS / legacy token → ChequeStatus */
export function toChequeStatus(token: string | null | undefined): ChequeStatus {
  const t = (token ?? "").toUpperCase();
  if (t === "CLEARED") return "CLEARED";
  if (t === "DISHONOURED" || t === "DISHONORED") return "DISHONOURED";
  if (t === "PAID") return "PAID";
  if (t === "UNPAID") return "UNPAID";
  return "PENDING";
}

/** Category letter / text → Category.key */
export const CATEGORY_TEXT_MAP: Record<string, string> = {
  a: "a",
  b: "b",
  c: "c",
  d: "d",
  e: "e",
  ashakiran: "asha_kiran_cat",
};

/** Sum insured numeric string → dropdown value (digits only) */
export function normalizeSumInsuredValue(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^0-9]/g, "");
  return digits || null;
}
