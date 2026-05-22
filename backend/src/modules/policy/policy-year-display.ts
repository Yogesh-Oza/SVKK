/** Year chip / tab label helpers when multiple policy rows share the same period year. */

export type YearLabelEntry = {
  policyId: string;
  yearLabel: string;
  referenceNo: string | null;
};

export type YearLabelEntryWithDisplay = YearLabelEntry & {
  displayYearLabel?: string;
};

/** Trailing numeric segment of reference no. (e.g. VKK2025JULY1689 → 1689). */
export function referenceTail(referenceNo: string | null | undefined): string | null {
  const ref = referenceNo?.trim();
  if (!ref) return null;
  const tail = ref.match(/(\d{3,})$/);
  if (tail) return tail[1];
  return ref.length > 6 ? ref.slice(-6) : ref;
}

/**
 * When several policies under one SVKK ID share the same year label, add a reference
 * suffix so quick-action chips stay distinct (same year, different policy rows).
 */
export function applyDisplayYearLabels<T extends YearLabelEntry>(
  entries: T[],
): Array<T & { displayYearLabel?: string }> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.yearLabel, (counts.get(e.yearLabel) ?? 0) + 1);
  }
  return entries.map((e) => {
    if ((counts.get(e.yearLabel) ?? 0) <= 1) {
      return { ...e };
    }
    const tail = referenceTail(e.referenceNo) ?? e.policyId.slice(-6);
    return { ...e, displayYearLabel: `${e.yearLabel} · ${tail}` };
  });
}

export function countDistinctYearLabels(entries: Array<{ yearLabel: string }>): number {
  return new Set(entries.map((e) => e.yearLabel)).size;
}
