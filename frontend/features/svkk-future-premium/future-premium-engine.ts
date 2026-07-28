import { calculateAge, dateParse, quoteFromInput } from "../../lib/svkk/premium/engine";
import type { PremiumState } from "../../lib/svkk/premium/types";
import { money } from "../../lib/svkk/premium/csv";
import {
  buildMembersFromFutureRow,
  futureMemberCount,
  getv,
  normPolicy,
} from "./future-csv-utils";
import type {
  CsvRowObject,
  FutureCalculationContext,
  FutureScenarioContext,
  MemberDelta,
  FutureMisGroup,
  FutureMisSnapshot,
  FuturePremiumResult,
  FutureSourceKey,
} from "./future-premium-types";

/** Max years ahead for future premium projection (0 = current year). */
export const FUTURE_YEAR_MAX_OFFSET = 10;

export function buildFutureYearOptions(maxOffset = FUTURE_YEAR_MAX_OFFSET): { value: string; label: string }[] {
  return Array.from({ length: maxOffset + 1 }, (_, i) => ({
    value: String(i),
    label: i === 0 ? "Current Year" : i === 1 ? "Next Year" : `${i} Yr`,
  }));
}

export const FUTURE_YEAR_OPTIONS = buildFutureYearOptions();
export const FUTURE_SI_OPTIONS = [100000, 200000, 300000, 500000, 1000000];
export const FUTURE_DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
export const FUTURE_POLICY_TYPE_OPTIONS = [
  "family_floater",
  "individual",
  "asha_kiran",
  "senior_citizen",
];

export const FUTURE_SOURCE_OPTIONS: { value: FutureSourceKey; label: string; lookup?: boolean }[] = [
  { value: "uploaded_csv_policy_list", label: "Uploaded CSV + Policy List" },
  { value: "uploaded_csv_only", label: "Uploaded CSV" },
  { value: "policy_list_only", label: "Policy list (database)" },
  { value: "linked_upload", label: "Linked Uploaded CSV", lookup: true },
];

/** Future Premium page: policy list from DB first (default), then uploaded CSV. */
export const FUTURE_PREMIUM_SOURCE_OPTIONS = [
  { value: "policy_list_only" as const, label: "Policy list (database)" },
  { value: "uploaded_csv_only" as const, label: "Uploaded CSV" },
];

/** Lookup page: policy export and session-linked CSV only. */
export const FUTURE_LOOKUP_SOURCE_OPTIONS = FUTURE_SOURCE_OPTIONS.filter(
  (o) => o.value === "policy_list_only" || o.value === "linked_upload",
);

export function sourceLabel(key: FutureSourceKey): string {
  return FUTURE_SOURCE_OPTIONS.find((o) => o.value === key)?.label ?? "Uploaded CSV";
}

export function yearOffsetValue(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function yearOffsetLabel(v: string): string {
  const n = yearOffsetValue(v);
  if (n === 0) return "Current Year";
  if (n === 1) return "Next Year";
  return `${n} Yr`;
}

function ymd(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStamp(): string {
  const d = new Date();
  return ymd(d);
}

function fiscalYearLabelFromDate(value: string): string {
  const d = dateParse(value);
  if (!d) return "—";
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  const end2 = String((start + 1) % 100).padStart(2, "0");
  return `${start}-${end2}`;
}

export function addYearsToDateString(value: string, years: number): string {
  const d = dateParse(value);
  if (!d) return value || "";
  const y = d.getFullYear() + Number(years || 0);
  const m = d.getMonth();
  const day = d.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(day, lastDay)));
}

export type FutureGenerationOptions = {
  futureSiMode?: "existing" | "change";
  selectedFutureSi?: number;
  bulkSiUpgrade?: boolean;
  futurePolicyMode?: "existing" | "change";
  selectedFuturePolicy?: string;
  discountMode?: "existing" | "chart" | "custom";
  customDiscountPct?: number;
};

const DEFAULT_SI_UPGRADE_RULES: Record<number, number> = {
  100000: 200000,
  200000: 300000,
  300000: 500000,
  500000: 1000000,
};

function applyBulkSiUpgrade(currentSi: number): number {
  return DEFAULT_SI_UPGRADE_RULES[currentSi] ?? currentSi;
}

function buildCalculationContext(
  yearOffset: string,
  currentStartDate: string,
  currentEndDate: string,
): FutureCalculationContext {
  const offset = yearOffsetValue(yearOffset);
  const calculationDate = addYearsToDateString(todayStamp(), offset);
  const calculationYear = dateParse(calculationDate)?.getFullYear() ?? new Date().getFullYear();
  const futureStartDate = addYearsToDateString(currentStartDate, offset);
  const futureEndDate = addYearsToDateString(currentEndDate, offset);
  return {
    yearOffset: offset,
    futureYearLabel: yearOffsetLabel(yearOffset),
    calculationDate,
    calculationYear,
    currentStartDate,
    currentEndDate,
    futureStartDate,
    futureEndDate,
    currentPolicyYear: fiscalYearLabelFromDate(currentEndDate),
    futurePolicyYear: fiscalYearLabelFromDate(futureEndDate),
  };
}

function applyDiscountOverride(
  base: ReturnType<typeof quoteFromInput>,
  mode: "existing" | "chart" | "custom",
  customPct: number,
): ReturnType<typeof quoteFromInput> {
  if (mode === "chart") return base;
  const rows = base.rows.map((row) => {
    if (row.error) return row;
    const gross = row.gross ?? 0;
    const pct = mode === "custom" ? customPct : row.pct ?? 0;
    const rawDiscount = (gross * pct) / 100;
    const disc = Math.ceil(rawDiscount);
    const net = Math.ceil(gross - disc);
    return { ...row, pct, disc, net };
  });
  const basic = rows.reduce((sum, r) => sum + (r.basic || 0), 0);
  const rider = rows.reduce((sum, r) => sum + (r.rider || 0), 0);
  const gross = rows.reduce((sum, r) => sum + (r.gross || 0), 0);
  const disc = rows.reduce((sum, r) => sum + (r.disc || 0), 0);
  const net = Math.ceil(gross - disc);
  return { rows, basic, rider, gross, disc, net };
}

function buildMemberTimeline(
  currentQuote: ReturnType<typeof quoteFromInput>,
  futureQuote: ReturnType<typeof quoteFromInput>,
  context: FutureCalculationContext,
): MemberDelta[] {
  const max = Math.max(currentQuote.rows.length, futureQuote.rows.length);
  const timeline: MemberDelta[] = [];
  for (let i = 0; i < max; i += 1) {
    const current = currentQuote.rows[i];
    const future = futureQuote.rows[i];
    if (!current && !future) continue;
    const name = future?.name || current?.name || `Member ${i + 1}`;
    const role = future?.role || current?.role || "member";
    const relationship = future?.relationship || current?.relationship || "";
    const gender = future?.gender || current?.gender || "";
    const dob = future?.dob || current?.dob || "";
    const currentAge = calculateAge(dob, context.currentEndDate);
    const futureAge = calculateAge(dob, context.futureEndDate);
    const currentBand = current?.band || "—";
    const futureBand = future?.band || "—";
    const currentNet = current?.net || 0;
    const futureNet = future?.net || 0;
    const delta = futureNet - currentNet;
    const deltaPct = currentNet > 0 ? (delta / currentNet) * 100 : 0;
    timeline.push({
      key: `${name}-${dob}-${i}`,
      name,
      role,
      relationship,
      gender,
      dob,
      currentAge,
      futureAge,
      currentBand,
      futureBand,
      currentBasic: current?.basic || 0,
      futureBasic: future?.basic || 0,
      currentGross: current?.gross || 0,
      futureGross: future?.gross || 0,
      currentDisc: current?.disc || 0,
      futureDisc: future?.disc || 0,
      currentNet,
      futureNet,
      deltaNet: delta,
      deltaPct,
      nearBandChange:
        currentAge != null && futureAge != null && currentBand === futureBand && Math.abs(futureAge - currentAge) <= 1,
      bandChanged: currentBand !== futureBand,
      issue: current?.error || future?.error,
    });
  }
  return timeline;
}

function collectReasons(
  currentPolicy: string,
  futurePolicy: string,
  currentSi: number,
  futureSi: number,
  currentQuote: ReturnType<typeof quoteFromInput>,
  futureQuote: ReturnType<typeof quoteFromInput>,
  members: MemberDelta[],
): FuturePremiumResult["reasons"] {
  const reasons = new Set<FuturePremiumResult["reasons"][number]>();
  if (futureQuote.net > currentQuote.net) reasons.add("Age Increased");
  if (members.some((m) => m.bandChanged)) reasons.add("Age Band Changed");
  if (currentSi !== futureSi) reasons.add("SI Changed");
  if (currentPolicy !== futurePolicy) reasons.add("Product Changed");
  if (futureQuote.disc !== currentQuote.disc) reasons.add("Discount Changed");
  if (futureQuote.gross !== currentQuote.gross) reasons.add("Rate Chart Updated");
  return [...reasons];
}

export function buildFutureResults(
  rawRows: CsvRowObject[],
  sourceKey: FutureSourceKey,
  yearOffset: string,
  premiumState: PremiumState,
  options: FutureGenerationOptions = {},
): FuturePremiumResult[] {
  return (rawRows || []).map((row, idx) => {
    const policy = normPolicy(getv(row, ["policy_type", "type", "product type", "product_type"]));
    const declaredCount = futureMemberCount(row);
    const members = buildMembersFromFutureRow(row, policy, declaredCount || 12);
    const memberCount = Math.max(members.length, declaredCount) || members.length || 1;
    const currentSi = money(getv(row, ["sum_insured", "si", "sum insured"])) || 0;
    const baseStart = getv(row, ["start_date", "policy_start_date", "current_start_date", "policy start"]);
    const baseEnd = getv(row, [
      "end_date",
      "policy_end_date",
      "future_end_date",
      "expiry_date",
      "policy end",
    ]);
    const context = buildCalculationContext(yearOffset, baseStart, baseEnd);
    const start = context.futureStartDate;
    const end = context.futureEndDate;
    const futurePolicy =
      options.futurePolicyMode === "change" && options.selectedFuturePolicy
        ? normPolicy(options.selectedFuturePolicy)
        : policy;
    const futureSi =
      options.futureSiMode === "change" && options.selectedFutureSi
        ? options.selectedFutureSi
        : options.bulkSiUpgrade
          ? applyBulkSiUpgrade(currentSi)
          : currentSi;
    const policyNo =
      getv(row, ["policy_number", "policy_no", "policyno", "policy no"]) ||
      `POL-${String(idx + 1).padStart(4, "0")}`;
    const holder =
      getv(row, ["holder_name", "holder name", "member_1_name", "member1_name", "policy_holder_name"]) ||
      "Policy Holder";
    const svkkId = getv(row, ["svkk_id", "svkkid", "svkk id"]) || "—";
    const customerId = getv(row, ["customer_id", "customerid", "customer id"]) || "—";
    const currentQuote = quoteFromInput(premiumState, {
      policyType: policy,
      memberCount,
      sumInsured: currentSi,
      endDate: context.currentEndDate,
      members,
    });
    const baseFutureQuote = quoteFromInput(premiumState, {
      policyType: futurePolicy,
      memberCount,
      sumInsured: futureSi,
      endDate: context.futureEndDate,
      members,
    });
    const discountMode = options.discountMode ?? "chart";
    const appliedDiscountPct = Math.max(0, Number(options.customDiscountPct ?? 0));
    const quote = applyDiscountOverride(baseFutureQuote, discountMode, appliedDiscountPct);
    const scenario: FutureScenarioContext = {
      futureSi,
      futurePolicyType: futurePolicy,
      discountMode,
      customDiscountPct: appliedDiscountPct,
      appliedDiscountPct,
    };
    const memberTimeline = buildMemberTimeline(currentQuote, quote, context);
    const reasons = collectReasons(policy, futurePolicy, currentSi, futureSi, currentQuote, quote, memberTimeline);
    const status = quote.rows.some((r) => r.error) ? "Issue" : "Ready";
    const premiumDiff = quote.net - currentQuote.net;
    const premiumIncreasePct = currentQuote.net > 0 ? (premiumDiff / currentQuote.net) * 100 : 0;
    return {
      source: sourceLabel(sourceKey),
      svkkId,
      customerId,
      policyNo,
      holder,
      policy: futurePolicy,
      memberCount,
      si: futureSi,
      start,
      end,
      calcYear: context.calculationYear,
      calcDate: context.calculationDate,
      currentQuote,
      quote,
      context,
      scenario,
      currentSi,
      futureSi,
      currentPolicy: policy,
      futurePolicy,
      currentPremium: currentQuote.net,
      futurePremium: quote.net,
      premiumDiff,
      premiumIncreasePct,
      memberTimeline,
      reasons,
      status,
      details: row,
    };
  });
}

function emptyGroup(): FutureMisGroup {
  return { policies: 0, members: 0, basic: 0, gross: 0, disc: 0, net: 0 };
}

export function computeFutureMis(results: FuturePremiumResult[]): FutureMisSnapshot {
  const byType: Record<string, FutureMisGroup> = {};
  const bySI: Record<string, FutureMisGroup> = {};
  let policies = 0;
  let members = 0;
  let basic = 0;
  let gross = 0;
  let disc = 0;
  let net = 0;

  for (const r of results) {
    policies += 1;
    members += r.memberCount;
    basic += r.quote.basic;
    gross += r.quote.gross;
    disc += r.quote.disc;
    net += r.quote.net;

    if (!byType[r.policy]) byType[r.policy] = emptyGroup();
    if (!bySI[r.si]) bySI[r.si] = emptyGroup();

    for (const bucket of [byType[r.policy]!, bySI[r.si]!]) {
      bucket.policies += 1;
      bucket.members += r.memberCount;
      bucket.basic += r.quote.basic;
      bucket.gross += r.quote.gross;
      bucket.disc += r.quote.disc;
      bucket.net += r.quote.net;
    }
  }

  return { policies, members, basic, gross, disc, net, byType, bySI };
}

export function filterFutureResults(
  results: FuturePremiumResult[],
  search: string,
  policyFilter: string,
  siFilter: string,
  statusFilter: string,
): FuturePremiumResult[] {
  const q = String(search || "").trim().toLowerCase();
  return results.filter((r) => {
    if (policyFilter !== "all" && r.policy !== policyFilter) return false;
    if (siFilter !== "all" && String(r.si) !== String(siFilter)) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    const hay = [
      r.svkkId,
      r.customerId,
      r.holder,
      r.policyNo,
      r.policy,
      r.si,
      r.memberCount,
      r.calcYear,
      r.calcDate,
      r.status,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function normalizeLookupToken(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Sort key for fiscal labels like 2026-27 (higher = more recent). */
export function policyYearSortKey(label: string): number {
  const m = String(label || "")
    .trim()
    .match(/^(\d{4})-(\d{2,4})$/);
  if (!m) return 0;
  const startYear = parseInt(m[1]!, 10);
  const endPart = m[2]!;
  const endYear =
    endPart.length === 2
      ? Math.floor(startYear / 100) * 100 + parseInt(endPart, 10)
      : parseInt(endPart, 10);
  return endYear * 100 + (startYear % 100);
}

function resultYearLabel(r: FuturePremiumResult): string {
  return getv(r.details, ["year", "policy_year", "policy year"]);
}

function lookupFieldMatchesToken(field: string, norm: string): boolean {
  const nf = normalizeLookupToken(field);
  if (!nf) return false;
  if (nf === norm) return true;
  return norm.length >= 6 && (nf.includes(norm) || norm.includes(nf));
}

function lookupResultMatchesToken(r: FuturePremiumResult, norm: string): boolean {
  const previousPolicyNo = getv(r.details, ["previous policy no", "previous_policy_no"]);
  const fields = [r.policyNo, r.svkkId, r.customerId, r.holder, previousPolicyNo];
  return fields.some((field) => lookupFieldMatchesToken(field, norm));
}

function lookupResultSortKey(r: FuturePremiumResult): number {
  const yearKey = policyYearSortKey(resultYearLabel(r));
  if (yearKey) return yearKey;
  const end = dateParse(r.end);
  return end ? end.getTime() : 0;
}

function expandLookupMatchesBySvkk(
  allResults: FuturePremiumResult[],
  matches: FuturePremiumResult[],
): FuturePremiumResult[] {
  const svkkIds = new Set(
    matches
      .map((m) => normalizeLookupToken(m.svkkId))
      .filter((id) => id && id !== normalizeLookupToken("—")),
  );
  if (!svkkIds.size) return matches;
  const expanded = allResults.filter((r) => svkkIds.has(normalizeLookupToken(r.svkkId)));
  return expanded.length ? expanded : matches;
}

/** Prefer explicit year from suggestion; otherwise latest fiscal year. */
export function pickBestLookupMatch(
  matches: FuturePremiumResult[],
  preferredYearLabel?: string,
): FuturePremiumResult | null {
  if (!matches.length) return null;
  const pool =
    preferredYearLabel && preferredYearLabel !== "—"
      ? matches.filter((r) => resultYearLabel(r) === preferredYearLabel)
      : matches;
  const ranked = [...(pool.length ? pool : matches)].sort(
    (a, b) => lookupResultSortKey(b) - lookupResultSortKey(a),
  );
  return ranked[0] ?? null;
}

export function findLookupResult(
  token: string,
  rawRows: CsvRowObject[],
  sourceKey: FutureSourceKey,
  yearOffset: string,
  premiumState: PremiumState,
  preferredYearLabel?: string,
): FuturePremiumResult | null {
  const norm = normalizeLookupToken(token);
  if (!norm) return null;
  const rows = buildFutureResults(rawRows, sourceKey, yearOffset, premiumState);

  const exact = rows.filter((r) => {
    const policyNorm = normalizeLookupToken(r.policyNo);
    const svkkNorm = normalizeLookupToken(r.svkkId);
    const customerNorm = normalizeLookupToken(r.customerId);
    const previousNorm = normalizeLookupToken(
      getv(r.details, ["previous policy no", "previous_policy_no"]),
    );
    return (
      policyNorm === norm ||
      svkkNorm === norm ||
      customerNorm === norm ||
      previousNorm === norm
    );
  });
  if (exact.length) {
    return pickBestLookupMatch(expandLookupMatchesBySvkk(rows, exact), preferredYearLabel);
  }

  const fuzzy = rows.filter((r) => lookupResultMatchesToken(r, norm));
  if (fuzzy.length) {
    return pickBestLookupMatch(expandLookupMatchesBySvkk(rows, fuzzy), preferredYearLabel);
  }

  return null;
}

export async function resolveFutureRawRows(
  source: FutureSourceKey,
  uploadedRows: CsvRowObject[],
  fetchPolicyExport: () => Promise<CsvRowObject[]>,
): Promise<CsvRowObject[]> {
  if (source === "uploaded_csv_only") return uploadedRows;
  const policyRows = source === "policy_list_only" || source === "uploaded_csv_policy_list"
    ? await fetchPolicyExport()
    : [];
  if (source === "policy_list_only") return policyRows;
  if (source === "linked_upload") return uploadedRows;
  return [...uploadedRows, ...policyRows];
}
