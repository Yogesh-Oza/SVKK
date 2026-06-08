import { describe, expect, it } from "vitest";

import {
  buildFuturePolicyFilterQuery,
  filterFutureCsvRows,
  type FutureCsvFilterContext,
  type FuturePolicyFilters,
} from "./future-policy-filters";

const emptyCtx: FutureCsvFilterContext = {
  categoryKeys: [],
  categoryLabels: [],
  policyTypeKeys: [],
  policyTypeLabels: [],
};

describe("future-policy-filters", () => {
  it("builds export query from multi-select filters", () => {
    const filters: FuturePolicyFilters = {
      periodYears: ["2025-26"],
      periodMonths: [],
      categoryIds: ["cat1"],
      policyTypeIds: ["pt1"],
      areas: [],
      villages: ["Bharudia"],
      sumInsureds: [],
      policyGroupings: [],
    };
    const q = buildFuturePolicyFilterQuery(filters, ["CAT_A"]);
    expect(q).toContain("periodYearTexts=2025-26");
    expect(q).toContain("villages=Bharudia");
    expect(q).toContain("categoryIds=cat1");
    expect(q).toContain("categoryKeys=CAT_A");
  });

  it("filters uploaded csv rows by year and village", () => {
    const rows = [
      { year: "2025-26", village: "Bharudia", policy_type: "family_floater" },
      { year: "2024-25", village: "Other", policy_type: "individual" },
    ];
    const filtered = filterFutureCsvRows(
      rows,
      {
        periodYears: ["2025-26"],
        periodMonths: [],
        categoryIds: [],
        policyTypeIds: [],
        areas: [],
        villages: ["Bharudia"],
        sumInsureds: [],
        policyGroupings: [],
      },
      emptyCtx,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.village).toBe("Bharudia");
  });
});
