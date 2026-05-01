/** Stored in `Policy.periodMonthText`; matches AD policy form month values. */
export const POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const CANONICAL_BY_LOWER = new Map(
  POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER.map((m) => [m.toLowerCase(), m] as const),
);

/** If `raw` is a known month (any casing), returns Title Case canonical name. */
export function canonicalMonthName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return CANONICAL_BY_LOWER.get(t.toLowerCase()) ?? null;
}

function titleCaseWord(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Always includes all 12 English months in **calendar order** (January → December).
 * API values that are known months only affect normalization, not order.
 * Non-month strings from the API are appended at the end, A–Z.
 */
export function monthFilterOptionsFromMeta(apiDistinct: string[]): { value: string; label: string }[] {
  const extras = new Set<string>();
  for (const raw of apiDistinct) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const canon = canonicalMonthName(trimmed);
    if (canon == null) {
      extras.add(trimmed);
    }
  }

  const extraSorted = [...extras].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const ordered = [...POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER, ...extraSorted];

  return ordered.map((value) => {
    const canon = canonicalMonthName(value);
    const label = canon ?? titleCaseWord(value);
    const outValue = canon ?? value;
    return { value: outValue, label };
  });
}
