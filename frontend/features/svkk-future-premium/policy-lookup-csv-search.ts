import { getv } from "./future-csv-utils";
import type { CsvRowObject } from "./future-premium-types";

export type LookupSuggestion = {
  key: string;
  holderName: string;
  svkkId: string;
  customerId: string;
  policyNo: string;
  yearLabel: string;
  lookupValue: string;
};

function pickLookupValue(parts: { policyNo: string; svkkId: string; customerId: string }): string {
  return parts.policyNo || parts.svkkId || parts.customerId;
}

function rowMatchesQuery(hay: string, query: string): boolean {
  return hay.toLowerCase().includes(query.trim().toLowerCase());
}

/** Search uploaded CSV rows for lookup autocomplete (no API dependency). */
export function searchCsvLookupSuggestions(rows: CsvRowObject[], query: string): LookupSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];

  const out: LookupSuggestion[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const holderName =
      getv(row, ["holder_name", "holder name", "policy_holder_name", "policy holder name"]) || "—";
    const svkkId = getv(row, ["svkk_id", "svkkid", "svkk id"]) || "—";
    const customerId = getv(row, ["customer_id", "customerid", "customer id"]) || "—";
    const policyNo = getv(row, ["policy_number", "policy_no", "policy no"]) || "—";
    const yearLabel = getv(row, ["year", "policy_year", "policy year"]) || "—";
    const hay = [holderName, svkkId, customerId, policyNo, yearLabel].join(" ");
    if (!rowMatchesQuery(hay, q)) continue;

    const lookupValue = pickLookupValue({ policyNo, svkkId, customerId });
    if (!lookupValue || lookupValue === "—") continue;

    out.push({
      key: `csv-${i}-${lookupValue}`,
      holderName,
      svkkId,
      customerId,
      policyNo,
      yearLabel,
      lookupValue,
    });
  }
  return out.slice(0, 25);
}
