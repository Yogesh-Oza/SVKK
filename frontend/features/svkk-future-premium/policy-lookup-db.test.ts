import { describe, expect, it } from "vitest";

import { csvRowsToLookupSuggestions } from "./policy-lookup-db";

describe("policy-lookup-db", () => {
  it("maps export rows to suggestions for PO- policy numbers", () => {
    const rows = [
      {
        "policy no": "PO- 14010061252800000651",
        "svkk id": "SVKK1234",
        "customer id": "CUST1",
        "holder name": "Test Holder",
        year: "2025-26",
      },
    ];
    const suggestions = csvRowsToLookupSuggestions(rows, "PO-14010061252800000651");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.lookupValue).toBe("PO- 14010061252800000651");
  });
});
