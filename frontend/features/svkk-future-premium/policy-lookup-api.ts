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
  type FutureGenerationOptions,
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
  options: FutureGenerationOptions = {},
) {
  const offset = yearOffsetValue(yearOffset);
  const baseEnd = formValues.policyEnd || formValues.previousEndDate || "";
  const endDate = addYearsToDateString(baseEnd, offset);
  const currentSi = money(formValues.sumInsured) || 0;
  const selectedSi =
    options.futureSiMode === "change" && options.selectedFutureSi
      ? options.selectedFutureSi
      : currentSi;
  const selectedPolicy =
    options.futurePolicyMode === "change" && options.selectedFuturePolicy
      ? normPolicy(options.selectedFuturePolicy)
      : normPolicy(formValues.adProduct || "");

  const policyKey = selectedPolicy;
  const isIndividual = policyKey === "individual";
  const validMembers = (formValues.members || []).filter(
    (m) => Boolean(m.name?.trim()) && Boolean(m.dob),
  );
  const holderSi = selectedSi;
  const holderMember: MemberInput = {
    name: formValues.policyHolder || "Policy Holder",
    dob: formValues.dob || "",
    relationship: (formValues.relation || "self").toLowerCase() || "self",
    gender: genderToQuoteInput(formValues.holderGender),
    addOnRider: money(formValues.holderAddOns) || 0,
    ...(isIndividual && holderSi > 0 ? { sumInsured: holderSi } : {}),
  };
  const memberInputs: MemberInput[] = validMembers.map((m, i) => {
    const memberSi = money(m.sumInsured) || 0;
    return {
      name: m.name.trim() || `Member ${i + 1}`,
      dob: m.dob,
      relationship: (m.relationship || "member").toLowerCase() || "member",
      gender: genderToQuoteInput(m.gender),
      addOnRider: money(m.addOnsAmount) || 0,
      ...(isIndividual && memberSi > 0 ? { sumInsured: memberSi } : {}),
    };
  });

  const baseQuote = quoteFromInput(premiumState, {
    policyType: policyKey,
    memberCount: 1 + memberInputs.length,
    sumInsured: holderSi,
    endDate,
    members: [holderMember, ...memberInputs],
  });
  const discountMode = options.discountMode ?? "chart";
  const customPct = Math.max(0, Number(options.customDiscountPct ?? 0));
  if (discountMode === "chart") return baseQuote;
  const rows = baseQuote.rows.map((row) => {
    if (row.error) return row;
    const gross = row.gross ?? 0;
    const pct = discountMode === "custom" ? customPct : row.pct ?? 0;
    const disc = Math.ceil((gross * pct) / 100);
    const net = Math.ceil(gross - disc);
    return { ...row, pct, disc, net };
  });
  const basic = rows.reduce((sum, r) => sum + (r.basic || 0), 0);
  const rider = rows.reduce((sum, r) => sum + (r.rider || 0), 0);
  const gross = rows.reduce((sum, r) => sum + (r.gross || 0), 0);
  const disc = rows.reduce((sum, r) => sum + (r.disc || 0), 0);
  return { rows, basic, rider, gross, disc, net: Math.ceil(gross - disc) };
}

export function policyDetailToLookupResult(
  detail: SvkkPolicyDetailForForm,
  yearLabel: string,
  yearOffset: string,
  premiumState: PremiumState,
  options: FutureGenerationOptions = {},
): FuturePremiumResult | null {
  const formValues = policyDetailToAdFormValues(detail, { yearLabel });
  const year = detail.years.find((y) => y.yearLabel === yearLabel) ?? detail.years[0];
  if (!year) return null;

  const baseEnd = formValues.policyEnd || formValues.previousEndDate || "";
  const offset = yearOffsetValue(yearOffset);
  const start = addYearsToDateString(formValues.policyStart || "", offset);
  const end = addYearsToDateString(baseEnd, offset);
  const currentQuote = quoteFromStoredFormValues(formValues, premiumState, baseEnd, { useStoredAges: false });
  const quote = quoteFromPolicyFormForOffset(formValues, yearOffset, premiumState, options);
  const memberCount = quote.rows.length;
  const endParsed = dateParse(baseEnd);
  const calcDate = addYearsToDateString(new Date().toISOString().slice(0, 10), offset);
  const calcYear = dateParse(calcDate)?.getFullYear() ?? (endParsed ? endParsed.getFullYear() + offset : new Date().getFullYear());
  const currentSi = money(formValues.sumInsured) || money(year.sumInsured) || 0;
  const futureSi =
    options.futureSiMode === "change" && options.selectedFutureSi
      ? options.selectedFutureSi
      : currentSi;
  const currentPolicy = normPolicy(formValues.adProduct || detail.policyType?.key || "");
  const futurePolicy =
    options.futurePolicyMode === "change" && options.selectedFuturePolicy
      ? normPolicy(options.selectedFuturePolicy)
      : currentPolicy;
  const memberTimeline = quote.rows.map((m, idx) => {
    const current = currentQuote.rows[idx];
    const currentNet = current?.net || 0;
    const futureNet = m.net || 0;
    return {
      key: `${m.name}-${m.dob}-${idx}`,
      name: m.name,
      role: m.role,
      relationship: m.relationship,
      gender: m.gender,
      dob: m.dob,
      currentAge: current?.age ?? null,
      futureAge: m.age ?? null,
      currentBand: current?.band || "—",
      futureBand: m.band || "—",
      currentBasic: current?.basic || 0,
      futureBasic: m.basic || 0,
      currentGross: current?.gross || 0,
      futureGross: m.gross || 0,
      currentDisc: current?.disc || 0,
      futureDisc: m.disc || 0,
      currentNet,
      futureNet,
      deltaNet: futureNet - currentNet,
      deltaPct: currentNet > 0 ? ((futureNet - currentNet) / currentNet) * 100 : 0,
      nearBandChange: current?.band === m.band && Math.abs((m.age ?? 0) - (current?.age ?? 0)) <= 1,
      bandChanged: (current?.band || "—") !== (m.band || "—"),
      issue: m.error || current?.error,
    };
  });
  const reasons: FuturePremiumResult["reasons"] = [];
  if (quote.net > currentQuote.net) reasons.push("Age Increased");
  if (memberTimeline.some((m) => m.bandChanged)) reasons.push("Age Band Changed");
  if (futureSi !== currentSi) reasons.push("SI Changed");
  if (futurePolicy !== currentPolicy) reasons.push("Product Changed");
  if (quote.disc !== currentQuote.disc) reasons.push("Discount Changed");
  if (quote.gross !== currentQuote.gross) reasons.push("Rate Chart Updated");

  return {
    source: sourceLabel("policy_list_only"),
    svkkId: detail.insuredParty.svkkPublicId?.trim() || "—",
    customerId: detail.insuredParty.customerId?.trim() || "—",
    policyNo: detail.policyNo?.trim() || "—",
    holder: formValues.policyHolder?.trim() || detail.insuredParty.name?.trim() || "—",
    policy: futurePolicy,
    memberCount,
    si: futureSi,
    start,
    end,
    calcYear,
    calcDate,
    currentQuote,
    quote,
    context: {
      yearOffset: offset,
      futureYearLabel: offset === 0 ? "Current Year" : offset === 1 ? "Next Year" : `${offset} Yr`,
      calculationDate: calcDate,
      calculationYear: calcYear,
      currentStartDate: formValues.policyStart || "",
      currentEndDate: baseEnd,
      futureStartDate: start,
      futureEndDate: end,
      currentPolicyYear: yearLabel,
      futurePolicyYear: `${calcYear}-${String((calcYear + 1) % 100).padStart(2, "0")}`,
    },
    scenario: {
      futureSi,
      futurePolicyType: futurePolicy,
      discountMode: options.discountMode ?? "chart",
      customDiscountPct: Number(options.customDiscountPct ?? 0),
      appliedDiscountPct: Number(options.customDiscountPct ?? 0),
    },
    currentSi,
    futureSi,
    currentPolicy,
    futurePolicy,
    currentPremium: currentQuote.net,
    futurePremium: quote.net,
    premiumDiff: quote.net - currentQuote.net,
    premiumIncreasePct: currentQuote.net > 0 ? ((quote.net - currentQuote.net) / currentQuote.net) * 100 : 0,
    memberTimeline,
    reasons,
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
  options: FutureGenerationOptions = {},
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
        return policyDetailToLookupResult(detail, yearLabel, yearOffset, premiumState, options);
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
  options: FutureGenerationOptions = {},
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
    options,
  );
}
