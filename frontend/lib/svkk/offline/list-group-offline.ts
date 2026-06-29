import { applyDisplayYearLabels } from "@/features/svkk-policies/policy-year-display";
import {
  categoryLabelForSnapshot,
  policyTypeLabelForSnapshot,
} from "@/features/svkk-policies/policy-list-snapshot";
import type { OfflinePolicyListRow } from "./types";

export type OfflineGroupedPolicy = {
  svkkPublicId: string;
  primaryPolicyId: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  personsInsuredCount: number | null;
  area: string | null;
  remarks: string | null;
  adProductVariant?: string | null;
  periodMonthText?: string | null;
  periodYearText?: string | null;
  whatsappNo?: string | null;
  policyGrouping?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    email?: string | null;
    customerId: string | null;
    pan: string | null;
  };
  policyType: { id: string; name: string; key?: string };
  category: { id: string; key: string; name: string } | null;
  categoryText?: string | null;
  years: Array<{
    policyId: string;
    yearLabel: string;
    displayYearLabel?: string;
    referenceNo: string | null;
    policyNo: string | null;
    vkkPremium: unknown;
    sumInsured: unknown;
  }>;
  /** For sorting — newest primary policy in group. */
  _createdAt: string;
};

export type OfflineGroupedPolicyItem = Omit<OfflineGroupedPolicy, "_createdAt">;

function stripGroupedSortKey({ _createdAt: _, ...rest }: OfflineGroupedPolicy): OfflineGroupedPolicyItem {
  return rest;
}

export type OfflineListFilters = {
  villages?: string[];
  periodYears?: string[];
  periodMonths?: string[];
  categoryIds?: string[];
  categoryKeys?: string[];
  policyTypeIds?: string[];
  areas?: string[];
  sumInsureds?: string[];
  policyGroupings?: string[];
  dateFrom?: string;
  dateTo?: string;
};

function compareYearLabelsDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function yearLabelFromRow(r: OfflinePolicyListRow): string {
  return r.periodYearText?.trim() || r.yearLabel?.trim() || "";
}

function pickPrimaryRow(rows: OfflinePolicyListRow[]): OfflinePolicyListRow {
  return [...rows].sort((a, b) => {
    const yc = compareYearLabelsDesc(yearLabelFromRow(a), yearLabelFromRow(b));
    if (yc !== 0) return yc;
    const ac = a.createdAt || a.updatedAt;
    const bc = b.createdAt || b.updatedAt;
    return new Date(bc).getTime() - new Date(ac).getTime();
  })[0]!;
}

function normDecimal(v: string | null | undefined): string {
  if (!v?.trim()) return "";
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : v.trim();
}

function rowMatchesFilters(row: OfflinePolicyListRow, filters: OfflineListFilters): boolean {
  if (filters.villages?.length) {
    const v = row.village?.trim();
    if (!v || !filters.villages.includes(v)) return false;
  }
  if (filters.periodYears?.length) {
    const y = yearLabelFromRow(row);
    if (!y || !filters.periodYears.includes(y)) return false;
  }
  if (filters.periodMonths?.length) {
    const m = row.periodMonthText?.trim();
    if (!m || !filters.periodMonths.includes(m)) return false;
  }
  if (filters.categoryIds?.length) {
    const id = row.categoryId?.trim();
    if (!id || !filters.categoryIds.includes(id)) return false;
  }
  if (filters.categoryKeys?.length) {
    const key = row.categoryKey?.trim();
    if (!key || !filters.categoryKeys.includes(key)) return false;
  }
  if (filters.policyTypeIds?.length) {
    const id = row.policyTypeId?.trim();
    if (!id || !filters.policyTypeIds.includes(id)) return false;
  }
  if (filters.areas?.length) {
    const a = row.area?.trim();
    if (!a || !filters.areas.includes(a)) return false;
  }
  if (filters.sumInsureds?.length) {
    const s = normDecimal(row.sumInsured);
    if (!s || !filters.sumInsureds.some((x) => normDecimal(x) === s)) return false;
  }
  if (filters.policyGroupings?.length) {
    const g = row.policyGrouping?.trim();
    if (!g || !filters.policyGroupings.includes(g)) return false;
  }
  if (filters.dateFrom) {
    const d = new Date(row.createdAt || row.updatedAt);
    const from = new Date(filters.dateFrom);
    if (Number.isNaN(d.getTime()) || d < from) return false;
  }
  if (filters.dateTo) {
    const d = new Date(row.createdAt || row.updatedAt);
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    if (Number.isNaN(d.getTime()) || d > to) return false;
  }
  return true;
}

export function filterCachedPolicyRows(
  rows: OfflinePolicyListRow[],
  filters: OfflineListFilters,
): OfflinePolicyListRow[] {
  return rows.filter((r) => !r.deletedAt && rowMatchesFilters(r, filters));
}

export function mapCachedRowsToGroupedList(rows: OfflinePolicyListRow[]): OfflineGroupedPolicy[] {
  const bySvkk = new Map<string, OfflinePolicyListRow[]>();
  for (const r of rows) {
    if (r.deletedAt) continue;
    const key = r.svkkId?.trim() || r.id;
    const list = bySvkk.get(key) ?? [];
    list.push(r);
    bySvkk.set(key, list);
  }

  const items: OfflineGroupedPolicy[] = [];
  for (const group of bySvkk.values()) {
    const primary = pickPrimaryRow(group);
    const years = applyDisplayYearLabels(
      group
        .map((g) => {
          const yearLabel = yearLabelFromRow(g);
          if (!yearLabel) return null;
          return {
            policyId: g.id,
            yearLabel,
            referenceNo: g.referenceNo ?? null,
            policyNo: g.policyNo,
            vkkPremium: g.vkkPremium ?? null,
            sumInsured: g.sumInsured ?? null,
          };
        })
        .filter((y): y is NonNullable<typeof y> => y != null)
        .sort((a, b) => compareYearLabelsDesc(a.yearLabel, b.yearLabel)),
    );
    if (!years.length) continue;

    const category =
      primary.categoryId && primary.categoryKey
        ? {
            id: primary.categoryId,
            key: primary.categoryKey,
            name: primary.categoryName?.trim() || primary.categoryKey,
          }
        : null;

    items.push({
      svkkPublicId: primary.svkkId,
      primaryPolicyId: primary.id,
      policyNo: years[0]?.policyNo ?? primary.policyNo,
      referenceNo: primary.referenceNo ?? null,
      village: primary.village,
      area: primary.area ?? null,
      remarks: primary.remarks ?? null,
      personsInsuredCount: primary.personsInsuredCount ?? null,
      adProductVariant: primary.adProductVariant ?? null,
      periodMonthText: primary.periodMonthText ?? null,
      periodYearText: primary.periodYearText ?? years[0]?.yearLabel ?? null,
      whatsappNo: primary.whatsappNo ?? null,
      policyGrouping: primary.policyGrouping ?? null,
      insuredParty: {
        svkkPublicId: primary.svkkId,
        name: primary.holderName?.trim() || "",
        mobile: primary.mobile ?? "",
        email: primary.email ?? null,
        customerId: primary.customerId,
        pan: primary.pan ?? null,
      },
      policyType: {
        id: primary.policyTypeId ?? "",
        name: primary.policyTypeName ?? "",
        key: primary.policyTypeKey ?? undefined,
      },
      category,
      categoryText: primary.categoryText ?? null,
      years,
      _createdAt: primary.createdAt || primary.updatedAt,
    });
  }
  return items;
}

function sortGroupedItems(items: OfflineGroupedPolicy[], sort: string): OfflineGroupedPolicy[] {
  const key = sort.replace(/_(asc|desc)$/, "");
  const direction: "asc" | "desc" = sort.endsWith("_desc")
    ? "desc"
    : sort.endsWith("_asc")
      ? "asc"
      : key === "createdAt"
        ? "desc"
        : "asc";

  const cmpStr = (a: string, b: string) =>
    direction === "desc" ? b.localeCompare(a) : a.localeCompare(b);

  return [...items].sort((a, b) => {
    switch (key) {
      case "createdAt":
        return direction === "desc"
          ? new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime()
          : new Date(a._createdAt).getTime() - new Date(b._createdAt).getTime();
      case "name":
        return cmpStr(a.insuredParty.name, b.insuredParty.name);
      case "customerId":
        return cmpStr(a.insuredParty.customerId ?? "", b.insuredParty.customerId ?? "");
      case "categoryName":
      case "categoryKey":
        return cmpStr(categoryLabelForSnapshot(a), categoryLabelForSnapshot(b));
      case "policyTypeName":
        return cmpStr(policyTypeLabelForSnapshot(a), policyTypeLabelForSnapshot(b));
      case "periodMonthText":
        return cmpStr(a.periodMonthText ?? "", b.periodMonthText ?? "");
      case "svkkId":
        return cmpStr(a.svkkPublicId, b.svkkPublicId);
      case "village":
        return cmpStr(a.village ?? "", b.village ?? "");
      case "policyNo":
        return cmpStr(a.policyNo ?? "", b.policyNo ?? "");
      default:
        return new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime();
    }
  });
}

export function paginateGroupedList<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export function buildOfflinePolicyListPage(input: {
  rows: OfflinePolicyListRow[];
  filters?: OfflineListFilters;
  sort?: string;
  page?: number;
  pageSize?: number;
}): {
  items: OfflineGroupedPolicyItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const filtered = filterCachedPolicyRows(input.rows, input.filters ?? {});
  const grouped = mapCachedRowsToGroupedList(filtered);
  const sorted = sortGroupedItems(grouped, input.sort ?? "createdAt");
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const paged = paginateGroupedList(sorted, page, pageSize);
  return {
    items: paged.items.map(stripGroupedSortKey),
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    totalPages: paged.totalPages,
  };
}

export function buildOfflineFiltersMeta(rows: OfflinePolicyListRow[]) {
  const villages = new Set<string>();
  const areas = new Set<string>();
  const periodYearTexts = new Set<string>();
  const periodMonthTexts = new Set<string>();
  const sumInsuredValues = new Set<string>();
  const policyGroupings = new Set<string>();

  for (const r of rows) {
    if (r.deletedAt) continue;
    const v = r.village?.trim();
    if (v) villages.add(v);
    const a = r.area?.trim();
    if (a) areas.add(a);
    const y = yearLabelFromRow(r);
    if (y) periodYearTexts.add(y);
    const m = r.periodMonthText?.trim();
    if (m) periodMonthTexts.add(m);
    const s = normDecimal(r.sumInsured);
    if (s) sumInsuredValues.add(s);
    const g = r.policyGrouping?.trim();
    if (g) policyGroupings.add(g);
  }

  const sortAlpha = (a: string, b: string) => a.localeCompare(b);

  return {
    villages: [...villages].sort(sortAlpha),
    areas: [...areas].sort(sortAlpha),
    periodYearTexts: [...periodYearTexts].sort(compareYearLabelsDesc),
    periodMonthTexts: [...periodMonthTexts].sort(sortAlpha),
    sumInsuredValues: [...sumInsuredValues].sort((a, b) => Number(a) - Number(b)),
    policyGroupings: [...policyGroupings].sort(sortAlpha),
  };
}
