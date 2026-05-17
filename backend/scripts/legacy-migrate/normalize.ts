/** Normalize legacy free text for dropdown lookup keys. */
export function normalizeLegacyText(value: string | null | undefined): string {
  if (value == null) return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/system/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Slug for new DropdownOption.value (max 64 chars). */
export function toDropdownValueSlug(normalized: string, fallback = "unknown"): string {
  const s = normalized.slice(0, 64);
  return s || fallback;
}

/** Human label from legacy raw text. */
export function toDropdownLabel(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t && t.length > 0 ? t.slice(0, 128) : "Unknown";
}
