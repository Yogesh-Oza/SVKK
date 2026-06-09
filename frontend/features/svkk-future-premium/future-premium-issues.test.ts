import { describe, expect, it } from "vitest";

import type { FuturePremiumResult } from "./future-premium-types";
import { listFuturePremiumIssues } from "./future-premium-issues";

function issueResult(overrides: Partial<FuturePremiumResult> = {}): FuturePremiumResult {
  return {
    source: "Policy list (database)",
    svkkId: "RTYMAY0003",
    customerId: "PO21233829",
    policyNo: "POL-001",
    holder: "Test Holder",
    policy: "individual",
    memberCount: 1,
    si: 100_000,
    start: "2026-06-01",
    end: "2027-05-31",
    calcYear: 2027,
    calcDate: "2026-06-10",
    quote: {
      rows: [
        {
          name: "Test Holder",
          dob: "",
          relationship: "self",
          gender: "male",
          addOnRider: 0,
          role: "holder",
          age: null,
          error: "Age could not be calculated.",
        },
      ],
      basic: 0,
      rider: 0,
      gross: 0,
      disc: 0,
      net: 0,
    },
    status: "Issue",
    ...overrides,
  };
}

describe("listFuturePremiumIssues", () => {
  it("returns member errors from quote rows", () => {
    const issues = listFuturePremiumIssues(issueResult());
    expect(issues.some((i) => i.message.includes("Age could not be calculated"))).toBe(true);
    expect(issues.some((i) => i.memberName === "Test Holder")).toBe(true);
  });

  it("flags missing sum insured", () => {
    const issues = listFuturePremiumIssues(issueResult({ si: 0 }));
    expect(issues.some((i) => i.scope === "policy" && i.message.includes("Sum insured"))).toBe(true);
  });
});
