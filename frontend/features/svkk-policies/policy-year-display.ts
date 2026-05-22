/** Mirror backend policy-year-display for flat list / detail year tabs. */

export type YearLabelEntry = {
  policyId: string;
  yearLabel: string;
  referenceNo: string | null;
};

export type YearLabelEntryWithDisplay = YearLabelEntry & {
  displayYearLabel?: string;
};

export function referenceTail(referenceNo: string | null | undefined): string | null {
  const ref = referenceNo?.trim();
  if (!ref) return null;
  const tail = ref.match(/(\d{3,})$/);
  if (tail) return tail[1];
  return ref.length > 6 ? ref.slice(-6) : ref;
}

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

export function yearChipLabel(entry: { yearLabel: string; displayYearLabel?: string }): string {
  return entry.displayYearLabel?.trim() || entry.yearLabel;
}

export function yearQuickActionsTitle(
  years: Array<{ yearLabel: string }>,
  mode?: "edit" | "receipt" | null,
): string {
  if (mode === "edit") return "Select a year to edit";
  if (mode === "receipt") return "Select a year to generate receipt";
  const n = years.length;
  if (n === 0) return "Year-wise quick actions";
  const distinct = new Set(years.map((y) => y.yearLabel)).size;
  if (distinct === n) {
    return `Year-wise quick actions (${n} year${n === 1 ? "" : "s"})`;
  }
  return `Year-wise quick actions (${n} policies, ${distinct} year${distinct === 1 ? "" : "s"})`;
}
