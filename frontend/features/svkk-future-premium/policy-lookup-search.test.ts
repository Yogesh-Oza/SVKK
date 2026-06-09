import { describe, expect, it } from "vitest";

import {
  buildFuturePremiumListQuery,
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

  it("builds paginated flat policy list query for future premium", () => {
    const q = buildFuturePremiumListQuery("categoryIds=cat1&villages=Bharudia", 2, 25);
    const params = new URLSearchParams(q);
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("25");
    expect(params.get("sort")).toBe("periodYearText_desc");
    expect(params.get("groupBySvkk")).toBe("false");
    expect(params.get("categoryIds")).toBe("cat1");
    expect(params.get("villages")).toBe("Bharudia");
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
