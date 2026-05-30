import { dateParse } from "@/lib/svkk/premium/engine";

export { dateParse };

/** Placeholder for manual date fields on policy forms. */
export const FORM_DATE_PLACEHOLDER = "DD-MM-YYYY";

/** Insert `-` while typing digits (e.g. `21091996` → `21-09-1996`). */
export function formatDateWhileTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

/** Display value for text date inputs (DD-MM-YYYY). */
export function formatDateForFormInput(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = dateParse(value);
  if (!d) return value.trim();
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}-${m}-${y}`;
}

/** Parse a form date string to ISO for the API (UTC midnight). */
export function toApiDateIso(value: string | null | undefined): string | null {
  const d = dateParse(value);
  if (!d) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
}

/** Today's date as DD-MM-YYYY for filter/form defaults. */
export function todayFormDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return formatDateForFormInput(`${y}-${m}-${day}`);
}

/** Convert flexible date input to YYYY-MM-DD for filter query params. */
export function toIsoDateParam(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = dateParse(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
