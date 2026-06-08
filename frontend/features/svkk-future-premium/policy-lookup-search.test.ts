import { describe, expect, it } from "vitest";

import {
  buildLookupExportQueries,
  buildLookupSearchTerms,
  lookupRowMatchesToken,
  pickLookupExportSearch,
} from "./policy-lookup-search";

describe("policy-lookup-search", () => {
  it("builds search terms for PO- policy numbers with spacing variants", () => {
    const terms = buildLookupSearchTerms("PO- 14010061252800000651");
    expect(terms).toContain("PO- 14010061252800000651");
    expect(terms).toContain("14010061252800000651");
    expect(pickLookupExportSearch("PO- 14010061252800000651")).toBe("14010061252800000651");
  });

  it("builds export queries with search param", () => {
    const queries = buildLookupExportQueries("", "PO- 14010061252800000651");
    expect(queries.length).toBeGreaterThan(1);
    expect(queries[0]).toContain("search=14010061252800000651");
  });

  it("matches policy rows with normalized PO variants", () => {
    expect(
      lookupRowMatchesToken(
        { policyNo: "PO- 14010061252800000651", svkkId: "—", customerId: "—" },
        "PO-14010061252800000651",
      ),
    ).toBe(true);
  });
});
