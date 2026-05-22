import { describe, expect, it } from "vitest";
import { applyDisplayYearLabels, yearQuickActionsTitle } from "./policy-year-display";

describe("yearQuickActionsTitle", () => {
  it("clarifies duplicate year labels as multiple policies", () => {
    expect(
      yearQuickActionsTitle([
        { yearLabel: "2025-26" },
        { yearLabel: "2025-26" },
        { yearLabel: "2025-26" },
      ]),
    ).toBe("Year-wise quick actions (3 policies, 1 year)");
  });
});

describe("applyDisplayYearLabels", () => {
  it("suffixes colliding years with reference tail", () => {
    const out = applyDisplayYearLabels([
      {
        policyId: "p1",
        yearLabel: "2025-26",
        referenceNo: "VKK2025JULY1689",
      },
      {
        policyId: "p2",
        yearLabel: "2025-26",
        referenceNo: "VKK2025JULY1700",
      },
    ]);
    expect(out[0].displayYearLabel).toBe("2025-26 · 1689");
    expect(out[1].displayYearLabel).toBe("2025-26 · 1700");
  });
});
