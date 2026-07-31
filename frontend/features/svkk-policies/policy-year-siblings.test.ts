import { describe, expect, it } from "vitest";
import { pickYearSiblingTab, type PolicyListYearSibling } from "./policy-year-siblings";

function tab(
  policyId: string,
  yearLabel: string,
  referenceNo = `${policyId}-ref`,
): PolicyListYearSibling {
  return {
    policyId,
    yearLabel,
    referenceNo,
    policyNo: `PO-${policyId}`,
    vkkPremium: null,
    sumInsured: null,
  };
}

describe("pickYearSiblingTab", () => {
  const tabs = [
    tab("policy-a", "2025-26"),
    tab("policy-b", "2025-26"),
    tab("policy-c", "2026-27"),
  ];

  it("prefers the URL policy id when two siblings share a yearLabel", () => {
    expect(pickYearSiblingTab(tabs, "policy-b", "2025-26")?.policyId).toBe("policy-b");
  });

  it("falls back to the policy id tab when year is missing", () => {
    expect(pickYearSiblingTab(tabs, "policy-c")?.policyId).toBe("policy-c");
  });

  it("falls back to yearLabel only when the URL id is absent from tabs", () => {
    expect(pickYearSiblingTab(tabs, "missing", "2026-27")?.policyId).toBe("policy-c");
  });
});
