import { svkkJson } from "@/lib/svkk/api";
import type { CsvRowObject, FutureSourceKey } from "./future-premium-types";
import {
  buildLookupListQuery,
  buildLookupSearchTerms,
  lookupMinQueryLength,
  lookupRowMatchesToken,
} from "./policy-lookup-search";
import {
  searchCsvLookupSuggestions,
  type LookupSuggestion,
} from "./policy-lookup-csv-search";

export type { LookupSuggestion } from "./policy-lookup-csv-search";
export { searchCsvLookupSuggestions } from "./policy-lookup-csv-search";

type ApiPolicyListItem = {
  id: string;
  policyNo: string | null;
  holderName?: string | null;
  periodYearText?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    customerId: string | null;
  };
};

export function sourceUsesPolicyApi(source: FutureSourceKey): boolean {
  return source === "policy_list_only" || source === "uploaded_csv_policy_list";
}

export function sourceUsesUploadedCsv(source: FutureSourceKey): boolean {
  return source !== "policy_list_only";
}

function pickLookupValue(parts: { policyNo: string; svkkId: string; customerId: string }): string {
  return parts.policyNo || parts.svkkId || parts.customerId;
}

function mapApiPolicyToSuggestion(row: ApiPolicyListItem): LookupSuggestion | null {
  const holderName = row.holderName?.trim() || row.insuredParty.name?.trim() || "—";
  const svkkId = row.insuredParty.svkkPublicId?.trim() || "—";
  const customerId = row.insuredParty.customerId?.trim() || "—";
  const policyNo = row.policyNo?.trim() || "—";
  const yearLabel = row.periodYearText?.trim() || "—";
  const lookupValue = pickLookupValue({ policyNo, svkkId, customerId });
  if (!lookupValue || lookupValue === "—") return null;

  return {
    key: `api-${row.id}`,
    holderName,
    svkkId,
    customerId,
    policyNo,
    yearLabel,
    lookupValue,
  };
}

export async function fetchApiLookupSuggestions(
  query: string,
  filterQuery?: string,
): Promise<LookupSuggestion[]> {
  const q = query.trim();
  if (q.length < lookupMinQueryLength(q)) return [];

  const merged: LookupSuggestion[] = [];
  const seen = new Set<string>();

  for (const term of buildLookupSearchTerms(q)) {
    const res = await svkkJson<{ items: ApiPolicyListItem[] }>(
      `/policies?${buildLookupListQuery(filterQuery ?? "", term)}`,
    );
    for (const row of res.items ?? []) {
      const suggestion = mapApiPolicyToSuggestion(row);
      if (!suggestion) continue;
      if (!lookupRowMatchesToken(suggestion, q)) continue;
      const dedupeKey = `${suggestion.lookupValue}|${suggestion.yearLabel}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(suggestion);
    }
    if (merged.length >= 25) break;
  }

  return merged.slice(0, 25);
}

export type LoadLookupSuggestionsOptions = {
  /** Lookup page: always search live policies while typing (like Add Policy). */
  includeLivePolicySearch?: boolean;
  /** Optional policy list filters (same params as policies list/export). */
  filterQuery?: string;
};

export async function loadLookupSuggestions(
  query: string,
  source: FutureSourceKey,
  uploadedRows: CsvRowObject[],
  options?: LoadLookupSuggestionsOptions,
): Promise<LookupSuggestion[]> {
  const q = query.trim();
  if (q.length < lookupMinQueryLength(q)) return [];

  const merged: LookupSuggestion[] = [];
  const seen = new Set<string>();

  const pushUnique = (items: LookupSuggestion[]) => {
    for (const item of items) {
      const dedupeKey = `${item.lookupValue}|${item.yearLabel}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(item);
    }
  };

  if (sourceUsesUploadedCsv(source)) {
    pushUnique(searchCsvLookupSuggestions(uploadedRows, q));
  }
  if (sourceUsesPolicyApi(source) || options?.includeLivePolicySearch) {
    pushUnique(await fetchApiLookupSuggestions(q, options?.filterQuery));
  }

  return merged.slice(0, 25);
}
