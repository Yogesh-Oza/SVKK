import { toIsoDateParam } from "@/lib/svkk/form-date";

export type WalletTxnFilterState = {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  categories?: string[];
  villages?: string[];
  groups?: string[];
  months?: string[];
  years?: string[];
  policyTypes?: string[];
  areas?: string[];
  sumInsureds?: string[];
  page?: number;
  pageSize?: number;
};

export function appendWalletTxnFilters(
  params: URLSearchParams,
  filters: WalletTxnFilterState,
): void {
  if (filters.page != null) params.set("page", String(filters.page));
  if (filters.pageSize != null) params.set("pageSize", String(filters.pageSize));
  if (filters.q?.trim()) params.set("q", filters.q.trim());

  const dateFrom = toIsoDateParam(filters.dateFrom);
  const dateTo = toIsoDateParam(filters.dateTo);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  filters.categories?.forEach((c) => params.append("categories", c));
  filters.villages?.forEach((v) => params.append("villages", v));
  filters.groups?.forEach((g) => params.append("groups", g));
  filters.months?.forEach((m) => params.append("months", m));
  filters.years?.forEach((y) => params.append("years", y));
  filters.policyTypes?.forEach((t) => params.append("policyTypes", t));
  filters.areas?.forEach((a) => params.append("areas", a));
  filters.sumInsureds?.forEach((s) => params.append("sumInsureds", s));
}
