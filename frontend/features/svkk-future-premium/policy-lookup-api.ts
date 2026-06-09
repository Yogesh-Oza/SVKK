import { svkkJson } from "@/lib/svkk/api";
import { money } from "@/lib/svkk/premium/csv";
import { dateParse, quoteFromInput } from "@/lib/svkk/premium/engine";
import type { MemberInput, PremiumState } from "@/lib/svkk/premium/types";
import {
  policyDetailToAdFormValues,
  type SvkkPolicyDetailForForm,
} from "@/features/svkk-policies/ad-policy-detail-to-form";
import {
  genderToQuoteInput,
  quoteFromStoredFormValues,
} from "@/features/svkk-policies/ad-policy-auto-calc";
import { normPolicy } from "./future-csv-utils";
import {
  addYearsToDateString,
  policyYearSortKey,
  sourceLabel,
  todayStamp,
  yearOffsetValue,
} from "./future-premium-engine";
import type { CsvRowObject, FuturePremiumResult } from "./future-premium-types";
import {
  buildFuturePremiumListQuery,
  buildLookupListQuery,
  buildLookupSearchTerms,
  lookupRowMatchesToken,
} from "./policy-lookup-search";

export type ApiPolicyListItem = {
  id: string;
  policyNo: string | null;
  previousPolicyNo?: string | null;
  holderName?: string | null;
  periodYearText?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    customerId: string | null;
  };
};

function listItemYearLabel(row: ApiPolicyListItem): string {
  return row.periodYearText?.trim() || "";
}

function listItemMatchesToken(row: ApiPolicyListItem, token: string): boolean {
  return lookupRowMatchesToken(
    {
      policyNo: row.policyNo?.trim() || "",
      svkkId: row.insuredParty.svkkPublicId?.trim() || "",
      customerId: row.insuredParty.customerId?.trim() || "",
      holder: row.holderName?.trim() || row.insuredParty.name?.trim() || "",
      previousPolicyNo: row.previousPolicyNo?.trim() || "",
    },
    token,
  );
}

function mergePolicyListItems(
  merged: ApiPolicyListItem[],
  seen: Set<string>,
  items: ApiPolicyListItem[],
  token: string,
): void {
  for (const row of items) {
    if (seen.has(row.id)) continue;
    if (!listItemMatchesToken(row, token)) continue;
    seen.add(row.id);
    merged.push(row);
  }
}

/** Search live policies (flat list, one row per fiscal year) — same as Add Policy carry-forward. */
export async function fetchMatchingPolicyListItems(
  token: string,
  filterQuery: string,
): Promise<ApiPolicyListItem[]> {
  const merged: ApiPolicyListItem[] = [];
  const seen = new Set<string>();

  for (const term of buildLookupSearchTerms(token)) {
    const res = await svkkJson<{ items: ApiPolicyListItem[] }>(
      `/policies?${buildLookupListQuery(filterQuery, term)}`,
    );
    mergePolicyListItems(merged, seen, res.items ?? [], token);
  }

  const svkkIds = new Set(
    merged.map((row) => row.insuredParty.svkkPublicId?.trim()).filter((id): id is string => Boolean(id)),
  );
  for (const svkkId of svkkIds) {
    if (svkkId.toLowerCase() === token.trim().toLowerCase()) continue;
    for (const term of buildLookupSearchTerms(svkkId)) {
      const res = await svkkJson<{ items: ApiPolicyListItem[] }>(
        `/policies?${buildLookupListQuery(filterQuery, term)}`,
      );
      mergePolicyListItems(merged, seen, res.items ?? [], svkkId);
    }
  }

  return merged;
}

/** Prefer suggestion year; otherwise latest `periodYearText`. */
export function pickBestPolicyListItem(
  items: ApiPolicyListItem[],
  token: string,
  preferredYearLabel?: string,
): ApiPolicyListItem | null {
  if (!items.length) return null;
  const matched = items.filter((row) => listItemMatchesToken(row, token));
  const pool = matched.length ? matched : items;
  const narrowed =
    preferredYearLabel && preferredYearLabel !== "—"
      ? pool.filter((row) => listItemYearLabel(row) === preferredYearLabel)
      : pool;
  const ranked = [...(narrowed.length ? narrowed : pool)].sort(
    (a, b) => policyYearSortKey(listItemYearLabel(b)) - policyYearSortKey(listItemYearLabel(a)),
  );
  return ranked[0] ?? null;
}

function buildLookupDetailsFromPolicy(
  detail: SvkkPolicyDetailForForm,
  yearLabel: string,
): CsvRowObject {
  const year = detail.years.find((y) => y.yearLabel === yearLabel) ?? detail.years[0];
  const category = detail.category
    ? `${detail.category.key} — ${detail.category.name}`
    : detail.categoryText?.trim() || "";
  return {
    year: yearLabel,
    category,
    area: detail.area?.trim() || "",
    village: detail.village?.trim() || "",
    grouping: detail.policyGrouping?.trim() || "",
    reference_no: detail.referenceNo?.trim() || "",
    previous_policy_no: detail.previousPolicyNo?.trim() || "",
    holder_pan: detail.holderPan?.trim() || detail.insuredParty.pan?.trim() || "",
    mobile: detail.insuredParty.mobile?.trim() || "",
    email: detail.insuredParty.email?.trim() || "",
    payment_mode: year?.paymentMode?.trim() || "",
    nominee_name: detail.nomineeName?.trim() || "",
    nominee_relation: detail.nomineeRelation?.trim() || "",
    courier_status: detail.courierStatus?.trim() || "",
  };
}

function quoteFromPolicyFormForOffset(
  formValues: ReturnType<typeof policyDetailToAdFormValues>,
  yearOffset: string,
  premiumState: PremiumState,
) {
  const offset = yearOffsetValue(yearOffset);
  const baseEnd = formValues.policyEnd || formValues.previousEndDate || "";
  const endDate = addYearsToDateString(baseEnd, offset);

  if (offset === 0) {
    return quoteFromStoredFormValues(formValues, premiumState, endDate, { useStoredAges: true });
  }

  const policyKey = normPolicy(formValues.adProduct || "");
  const validMembers = (formValues.members || []).filter(
    (m) => Boolean(m.name?.trim()) && Boolean(m.dob),
  );
  const holderMember: MemberInput = {
    name: formValues.policyHolder || "Policy Holder",
    dob: formValues.dob || "",
    relationship: (formValues.relation || "self").toLowerCase() || "self",
    gender: genderToQuoteInput(formValues.holderGender),
    addOnRider: money(formValues.holderAddOns) || 0,
  };
  const memberInputs: MemberInput[] = validMembers.map((m, i) => ({
    name: m.name.trim() || `Member ${i + 1}`,
    dob: m.dob,
    relationship: (m.relationship || "member").toLowerCase() || "member",
    gender: genderToQuoteInput(m.gender),
    addOnRider: money(m.addOnsAmount) || 0,
  }));

  return quoteFromInput(premiumState, {
    policyType: policyKey,
    memberCount: 1 + memberInputs.length,
    sumInsured: money(formValues.sumInsured) || 0,
    endDate,
    members: [holderMember, ...memberInputs],
  });
}

export function policyDetailToLookupResult(
  detail: SvkkPolicyDetailForForm,
  yearLabel: string,
  yearOffset: string,
  premiumState: PremiumState,
): FuturePremiumResult | null {
  const formValues = policyDetailToAdFormValues(detail, { yearLabel });
  const year = detail.years.find((y) => y.yearLabel === yearLabel) ?? detail.years[0];
  if (!year) return null;

  const baseEnd = formValues.policyEnd || formValues.previousEndDate || "";
  const offset = yearOffsetValue(yearOffset);
  const start = addYearsToDateString(formValues.policyStart || "", offset);
  const end = addYearsToDateString(baseEnd, offset);
  const quote = quoteFromPolicyFormForOffset(formValues, yearOffset, premiumState);
  const memberCount = quote.rows.length;
  const endParsed = dateParse(baseEnd);
  const calcYear = endParsed
    ? endParsed.getFullYear() + offset
    : new Date().getFullYear();

  return {
    source: sourceLabel("policy_list_only"),
    svkkId: detail.insuredParty.svkkPublicId?.trim() || "—",
    customerId: detail.insuredParty.customerId?.trim() || "—",
    policyNo: detail.policyNo?.trim() || "—",
    holder: formValues.policyHolder?.trim() || detail.insuredParty.name?.trim() || "—",
    policy: normPolicy(formValues.adProduct || detail.policyType?.key || ""),
    memberCount,
    si: money(formValues.sumInsured) || money(year.sumInsured) || 0,
    start,
    end,
    calcYear,
    calcDate: todayStamp(),
    quote,
    status: quote.rows.some((r) => r.error) ? "Issue" : "Ready",
    details: buildLookupDetailsFromPolicy(detail, yearLabel),
  };
}

export type PolicyListPagedResponse = {
  items: ApiPolicyListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Load one page of future premium results from live policy records (not export CSV). */
export async function fetchFuturePremiumPageFromApi(
  filterQuery: string,
  page: number,
  pageSize: number,
  yearOffset: string,
  premiumState: PremiumState,
): Promise<PolicyListPagedResponse & { results: FuturePremiumResult[] }> {
  const res = await svkkJson<PolicyListPagedResponse>(
    `/policies?${buildFuturePremiumListQuery(filterQuery, page, pageSize)}`,
  );

  const items = res.items ?? [];
  const results = (
    await Promise.all(
      items.map(async (item) => {
        const yearLabel = listItemYearLabel(item);
        if (!yearLabel) return null;
        const detail = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${item.id}`);
        return policyDetailToLookupResult(detail, yearLabel, yearOffset, premiumState);
      }),
    )
  ).filter((r): r is FuturePremiumResult => r != null);

  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? page,
    pageSize: res.pageSize ?? pageSize,
    totalPages: res.totalPages ?? Math.max(1, Math.ceil((res.total ?? items.length) / pageSize)),
    results,
  };
}

export async function resolveLookupFromPolicyApi(
  token: string,
  filterQuery: string,
  yearOffset: string,
  premiumState: PremiumState,
  preferredYearLabel?: string,
): Promise<FuturePremiumResult | null> {
  const items = await fetchMatchingPolicyListItems(token, filterQuery);
  const picked = pickBestPolicyListItem(items, token, preferredYearLabel);
  if (!picked) return null;

  const yearLabel = listItemYearLabel(picked);
  const detail = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${picked.id}`);
  return policyDetailToLookupResult(
    detail,
    preferredYearLabel && preferredYearLabel !== "—" ? preferredYearLabel : yearLabel,
    yearOffset,
    premiumState,
  );
}
