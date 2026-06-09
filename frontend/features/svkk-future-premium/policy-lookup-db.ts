import { getv } from "./future-csv-utils";
import type { CsvRowObject } from "./future-premium-types";
import type { LookupSuggestion } from "./policy-lookup-csv-search";
import { buildLookupExportQueries, lookupRowMatchesToken } from "./policy-lookup-search";

function pickLookupValue(parts: { policyNo: string; svkkId: string; customerId: string }): string {
  if (parts.svkkId && parts.svkkId !== "—") return parts.svkkId;
  return parts.policyNo || parts.customerId;
}

function mergeExportRows(
  merged: CsvRowObject[],
  seen: Set<string>,
  rows: CsvRowObject[],
): void {
  for (const row of rows) {
    const key = rowDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
}

function collectSvkkIds(rows: CsvRowObject[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const svkkId = getv(row, ["svkk_id", "svkkid", "svkk id"]);
    if (svkkId && svkkId !== "—") ids.add(svkkId);
  }
  return [...ids];
}

function rowDedupeKey(row: CsvRowObject): string {
  const policyNo = getv(row, ["policy_number", "policy_no", "policy no"]);
  const svkkId = getv(row, ["svkk_id", "svkkid", "svkk id"]);
  const year = getv(row, ["year", "policy_year", "policy year"]);
  return `${policyNo}|${svkkId}|${year}`;
}

/** Map policy export CSV rows to lookup suggestions (same source as Generate). */
export function csvRowsToLookupSuggestions(rows: CsvRowObject[], query: string): LookupSuggestion[] {
  const q = query.trim();
  if (!q) return [];

  const out: LookupSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const holderName =
      getv(row, ["holder_name", "holder name", "policy_holder_name", "policy holder name"]) || "—";
    const svkkId = getv(row, ["svkk_id", "svkkid", "svkk id"]) || "—";
    const customerId = getv(row, ["customer_id", "customerid", "customer id"]) || "—";
    const policyNo = getv(row, ["policy_number", "policy_no", "policy no"]) || "—";
    const previousPolicyNo = getv(row, ["previous policy no", "previous_policy_no"]) || "—";
    const yearLabel = getv(row, ["year", "policy_year", "policy year"]) || "—";

    if (
      !lookupRowMatchesToken(
        { policyNo, svkkId, customerId, holder: holderName, previousPolicyNo },
        q,
      )
    ) {
      continue;
    }

    const lookupValue = pickLookupValue({ policyNo, svkkId, customerId });
    if (!lookupValue || lookupValue === "—") continue;

    const dedupeKey = `${lookupValue}|${yearLabel}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      key: `db-${i}-${dedupeKey}`,
      holderName,
      svkkId,
      customerId,
      policyNo,
      yearLabel,
      lookupValue,
    });
    if (out.length >= 25) break;
  }

  return out;
}

/** Fetch export rows using the same search terms as Generate (digits-first for policy numbers). */
export async function fetchDbLookupExportRows(
  token: string,
  filterQuery: string,
  fetchExport: (query: string) => Promise<CsvRowObject[]>,
): Promise<CsvRowObject[]> {
  const merged: CsvRowObject[] = [];
  const seen = new Set<string>();

  for (const exportQuery of buildLookupExportQueries(filterQuery, token)) {
    const rows = await fetchExport(exportQuery);
    mergeExportRows(merged, seen, rows);
  }

  for (const svkkId of collectSvkkIds(merged)) {
    if (svkkId.trim().toLowerCase() === token.trim().toLowerCase()) continue;
    for (const exportQuery of buildLookupExportQueries(filterQuery, svkkId)) {
      const rows = await fetchExport(exportQuery);
      mergeExportRows(merged, seen, rows);
    }
  }

  return merged;
}

/** Load autocomplete suggestions from policy export (aligned with Generate lookup). */
export async function loadDbLookupSuggestions(
  query: string,
  filterQuery: string,
  fetchExport: (query: string) => Promise<CsvRowObject[]>,
): Promise<LookupSuggestion[]> {
  const rows = await fetchDbLookupExportRows(query, filterQuery, fetchExport);
  return csvRowsToLookupSuggestions(rows, query);
}
