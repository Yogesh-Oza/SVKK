/** Normalize geography tokens for comparison (MySQL collation is case-insensitive; this aids JS-side checks). */
export function normalizeGeoToken(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function matchesGeoValue(
  recordValue: string | null | undefined,
  allowedValues: readonly string[],
): boolean {
  const raw = normalizeGeoToken(recordValue);
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return allowedValues.some((a) => normalizeGeoToken(a).toLowerCase() === lower);
}
