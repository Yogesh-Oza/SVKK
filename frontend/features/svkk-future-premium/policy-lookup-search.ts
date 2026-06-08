import { normalizeLookupToken } from "./future-premium-engine";

/** Build search terms for policy API/export (handles PO- prefix and spacing variants). */
export function buildLookupSearchTerms(token: string): string[] {
  const trimmed = token.trim();
  if (!trimmed) return [];

  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const v = value.trim();
    if (!v || seen.has(v.toLowerCase())) return;
    seen.add(v.toLowerCase());
    terms.push(v);
  };

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 6) {
    push(digits);
  }

  push(trimmed);

  const withoutPrefix = trimmed.replace(/^po[\s-]*/i, "").trim();
  if (withoutPrefix && withoutPrefix.toLowerCase() !== trimmed.toLowerCase()) {
    push(withoutPrefix);
  }

  return terms;
}

/** Best single search string for export.csv (prefer long digit runs). */
export function pickLookupExportSearch(token: string): string {
  const terms = buildLookupSearchTerms(token);
  const digits = token.replace(/\D/g, "");
  if (digits.length >= 8) return digits;
  return terms[0] ?? token.trim();
}

/** Merge policy list filters with a lookup search token for export.csv. */
export function buildLookupExportQuery(filterQuery: string, token: string): string {
  const params = new URLSearchParams(filterQuery);
  params.set("search", pickLookupExportSearch(token));
  return params.toString();
}

/** Ordered export queries to try when lookup may span PO-/spacing variants. */
export function buildLookupExportQueries(filterQuery: string, token: string): string[] {
  const terms = buildLookupSearchTerms(token);
  return terms.map((term) => {
    const params = new URLSearchParams(filterQuery);
    params.set("search", term);
    return params.toString();
  });
}

/** Merge policy list filters with search for /policies list API. */
export function buildLookupListQuery(filterQuery: string, searchTerm: string): string {
  const params = new URLSearchParams({
    search: searchTerm,
    page: "1",
    pageSize: "25",
    sort: "createdAt",
    groupBySvkk: "false",
  });
  if (filterQuery.trim()) {
    const extra = new URLSearchParams(filterQuery);
    extra.forEach((value, key) => params.append(key, value));
  }
  return params.toString();
}

export function lookupMinQueryLength(query: string): number {
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 6) return 4;
  return 2;
}

export function lookupRowMatchesToken(
  parts: { policyNo: string; svkkId: string; customerId: string; holder?: string },
  token: string,
): boolean {
  const norm = normalizeLookupToken(token);
  if (!norm) return true;

  const fields = [parts.policyNo, parts.svkkId, parts.customerId, parts.holder ?? ""];
  for (const field of fields) {
    const nf = normalizeLookupToken(field);
    if (!nf) continue;
    if (nf === norm) return true;
    if (norm.length >= 6 && (nf.includes(norm) || norm.includes(nf))) return true;
  }
  return false;
}
