import { describe, expect, it } from "vitest";
import { applyDisplayYearLabels, referenceTail } from "./policy-year-display.js";

describe("referenceTail", () => {
  it("extracts trailing digits from legacy reference", () => {
    expect(referenceTail("VKK2025JULY1689")).toBe("1689");
  });
});

describe("applyDisplayYearLabels", () => {
  it("adds display suffix when year labels collide", () => {
    const out = applyDisplayYearLabels([
      {
        policyId: "a",
        yearLabel: "2025-26",
        referenceNo: "VKK2025JULY1689",
      },
      {
        policyId: "b",
        yearLabel: "2025-26",
        referenceNo: "VKK2025JULY1700",
      },
    ]);
    expect(out[0].displayYearLabel).toBe("2025-26 · 1689");
    expect(out[1].displayYearLabel).toBe("2025-26 · 1700");
  });

  it("leaves displayYearLabel unset for a single entry", () => {
    const out = applyDisplayYearLabels([
      { policyId: "a", yearLabel: "2024-25", referenceNo: "VKK2024JAN0001" },
    ]);
    expect(out[0].displayYearLabel).toBeUndefined();
  });
});
