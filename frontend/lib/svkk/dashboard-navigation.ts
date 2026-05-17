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

export function policiesQueryFromRange(
  range: DashboardDateRange,
  extra?: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  return misQueryFromRange(range, extra);
}

export function productVariantFromLabel(label: string): string | undefined {
  return PRODUCT_TO_VARIANT[label] ?? undefined;
}
