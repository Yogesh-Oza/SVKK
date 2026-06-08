import { describe, expect, it } from "vitest";

import { searchCsvLookupSuggestions } from "./policy-lookup-csv-search";

describe("policy-lookup-suggestions", () => {
  it("finds holder name matches in uploaded csv rows", () => {
    const rows = [
      {
        holder_name: "Ramesh Patel",
        svkk_id: "NVKK2024JUN1001",
        customer_id: "C1001",
        policy_number: "POL9001",
        year: "2025-2026",
      },
    ];
    const found = searchCsvLookupSuggestions(rows, "ramesh");
    expect(found).toHaveLength(1);
    expect(found[0]?.holderName).toBe("Ramesh Patel");
    expect(found[0]?.lookupValue).toBe("POL9001");
  });

  it("returns empty for short queries", () => {
    expect(searchCsvLookupSuggestions([{ holder_name: "Ramesh" }], "r")).toEqual([]);
  });
});
