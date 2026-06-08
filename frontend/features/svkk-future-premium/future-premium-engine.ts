import { dateParse, quoteFromInput } from "../../lib/svkk/premium/engine";
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

export const FUTURE_SOURCE_OPTIONS: { value: FutureSourceKey; label: string; lookup?: boolean }[] = [
  { value: "uploaded_csv_policy_list", label: "Uploaded CSV + Policy List" },
  { value: "uploaded_csv_only", label: "Uploaded CSV Only" },
  { value: "policy_list_only", label: "Policy List Only" },
  { value: "linked_upload", label: "Linked Uploaded CSV", lookup: true },
];

/** Lookup page: policy export and session-linked CSV only. */
export const FUTURE_LOOKUP_SOURCE_OPTIONS = FUTURE_SOURCE_OPTIONS.filter(
  (o) => o.value === "policy_list_only" || o.value === "linked_upload",
);

export function sourceLabel(key: FutureSourceKey): string {
  return FUTURE_SOURCE_OPTIONS.find((o) => o.value === key)?.label ?? "Uploaded CSV + Policy List";
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

export function addYearsToDateString(value: string, years: number): string {
  const d = dateParse(value);
  if (!d) return value || "";
  const y = d.getFullYear() + Number(years || 0);
  const m = d.getMonth();
  const day = d.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(day, lastDay)));
}

function calcYearFromEnd(end: string, offset: string): number {
  const adjusted = addYearsToDateString(end, yearOffsetValue(offset));
  const d = dateParse(adjusted);
  return d ? d.getFullYear() : new Date().getFullYear();
}

export function buildFutureResults(
  rawRows: CsvRowObject[],
  sourceKey: FutureSourceKey,
  yearOffset: string,
  premiumState: PremiumState,
): FuturePremiumResult[] {
  return (rawRows || []).map((row, idx) => {
    const policy = normPolicy(getv(row, ["policy_type", "type", "product type", "product_type"]));
    const declaredCount = futureMemberCount(row);
    const members = buildMembersFromFutureRow(row, policy, declaredCount || 10);
    const memberCount = declaredCount || members.length || 1;
    const si = money(getv(row, ["sum_insured", "si", "sum insured"])) || 0;
    const baseStart = getv(row, ["start_date", "policy_start_date", "current_start_date", "policy start"]);
    const baseEnd = getv(row, [
      "end_date",
      "policy_end_date",
      "future_end_date",
      "expiry_date",
      "policy end",
    ]);
    const offset = yearOffsetValue(yearOffset);
    const start = addYearsToDateString(baseStart, offset);
    const end = addYearsToDateString(baseEnd, offset);
    const policyNo =
      getv(row, ["policy_number", "policy_no", "policyno", "policy no"]) ||
      `POL-${String(idx + 1).padStart(4, "0")}`;
    const holder =
      getv(row, ["holder_name", "holder name", "member_1_name", "member1_name", "policy_holder_name"]) ||
      "Policy Holder";
    const svkkId = getv(row, ["svkk_id", "svkkid", "svkk id"]) || "—";
    const customerId = getv(row, ["customer_id", "customerid", "customer id"]) || "—";
    const quote = quoteFromInput(premiumState, {
      policyType: policy,
      memberCount,
      sumInsured: si,
      endDate: end,
      members,
    });
    const status = quote.rows.some((r) => r.error) ? "Issue" : "Ready";
    return {
      source: sourceLabel(sourceKey),
      svkkId,
      customerId,
      policyNo,
      holder,
      policy,
      memberCount,
      si,
      start,
      end,
      calcYear: calcYearFromEnd(baseEnd, yearOffset),
      calcDate: todayStamp(),
      quote,
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

export function findLookupResult(
  token: string,
  rawRows: CsvRowObject[],
  sourceKey: FutureSourceKey,
  yearOffset: string,
  premiumState: PremiumState,
): FuturePremiumResult | null {
  const norm = normalizeLookupToken(token);
  if (!norm) return null;
  const rows = buildFutureResults(rawRows, sourceKey, yearOffset, premiumState);
  return (
    rows.find(
      (r) => normalizeLookupToken(r.policyNo) === norm,
    ) ??
    rows.find((r) => normalizeLookupToken(r.svkkId) === norm) ??
    rows.find((r) => normalizeLookupToken(r.customerId) === norm) ??
    null
  );
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
