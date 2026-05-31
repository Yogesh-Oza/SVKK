import type { DashboardDateRange } from "./dashboard-date-presets";

export type DashboardNavTarget = {
  pathname: "/policies" | "/mis" | "/claims";
  query?: Record<string, string | string[] | undefined>;
};

const PRODUCT_TO_VARIANT: Record<string, string> = {
  "Asha Kiran": "ASHA_KIRAN",
  "Family Floater": "FAMILY_FLOATER",
  Individual: "INDIVIDUAL",
};

export function buildDashboardHref(target: DashboardNavTarget): string {
  const q = new URLSearchParams();
  const query = target.query ?? {};
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v) q.append(key, v);
      });
    } else {
      q.set(key, value);
    }
  }
  const qs = q.toString();
  return qs ? `${target.pathname}?${qs}` : target.pathname;
}

export function misQueryFromRange(
  range: DashboardDateRange,
  extra?: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return {
    ...(range.dateFrom ? { dateFrom: range.dateFrom } : {}),
    dateTo: range.dateTo,
    ...extra,
  };
}

/** Inclusive calendar-month bounds as ISO dates (UTC). */
export function calendarMonthBoundsIso(
  year: number,
  month: number,
): { dateFrom: string; dateTo: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Fiscal label (Apr–Mar) for a calendar month, e.g. June 2025 → `2025-26`. */
export function fiscalLabelForCalendarMonth(year: number, month: number): string {
  const fiscalStartYear = month >= 4 ? year : year - 1;
  const endShort = String((fiscalStartYear + 1) % 100).padStart(2, "0");
  return `${fiscalStartYear}-${endShort}`;
}

/** MIS deep-link for one policy-year start month (matches dashboard premium-by-start chart). */
export function misQueryFromPolicyStartMonth(
  year: number,
  month: number,
  extra?: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const { dateFrom, dateTo } = calendarMonthBoundsIso(year, month);
  return {
    dateFrom,
    dateTo,
    policyStartYear: String(year),
    policyStartMonth: String(month),
    // Fiscal year is shown in MIS UI only; API ignores it when policyStart* is set (chart parity).
    fiscalLabels: fiscalLabelForCalendarMonth(year, month),
    ...extra,
  };
}

export function policiesQueryFromRange(
  range: DashboardDateRange,
  extra?: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return misQueryFromRange(range, extra);
}

/** Claims register list — same date range as dashboard / Claim MIS. */
export function claimsQueryFromRange(
  range: DashboardDateRange,
  extra?: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return misQueryFromRange(range, extra);
}

/** Claim MIS tab with dashboard date filters. */
export function claimMisQueryFromRange(
  range: DashboardDateRange,
  extra?: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return {
    ...misQueryFromRange(range, extra),
    tab: "claim",
  };
}

/** Policies list with pending-renewal filter (policy end on/before range to-date). */
export function policiesPendingRenewalQuery(
  range: DashboardDateRange,
  renewalBucket?: string,
): Record<string, string | string[] | undefined> {
  const base = policiesQueryFromRange(range);
  if (renewalBucket) {
    return { ...base, renewalBucket, renewalAsOf: range.dateTo };
  }
  return { ...base, renewalPending: "true", renewalAsOf: range.dateTo };
}

export function productVariantFromLabel(label: string): string | undefined {
  return PRODUCT_TO_VARIANT[label] ?? undefined;
}
