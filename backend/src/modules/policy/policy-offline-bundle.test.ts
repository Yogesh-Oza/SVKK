import { describe, expect, it } from "vitest";
import { fiscalYearGteFilter } from "./policy-offline-bundle.js";

describe("fiscalYearGteFilter", () => {
  it("includes year labels from start year onward", () => {
    const filter = fiscalYearGteFilter("2024-25");
    expect(filter.OR).toBeDefined();
    const periodFilter = filter.OR?.find(
      (clause) => "periodYearText" in clause && clause.periodYearText,
    ) as { periodYearText: { in: string[] } } | undefined;
    expect(periodFilter?.periodYearText.in).toContain("2024-25");
    expect(periodFilter?.periodYearText.in).toContain("2025-26");
    expect(periodFilter?.periodYearText.in).not.toContain("2023-24");
  });

  it("returns empty filter for invalid year", () => {
    expect(fiscalYearGteFilter("invalid")).toEqual({});
  });
});
