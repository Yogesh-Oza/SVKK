import { describe, expect, it } from "vitest";
import { parsePolicyListOrderBy } from "./policy.list.js";

describe("parsePolicyListOrderBy contact snapshots", () => {
  it("sorts customerId by policy snapshot then party fallback", () => {
    expect(parsePolicyListOrderBy("customerId")).toEqual([
      { holderCustomerId: "asc" },
      { insuredParty: { customerId: "asc" } },
    ]);
    expect(parsePolicyListOrderBy("customerId_desc")).toEqual([
      { holderCustomerId: "desc" },
      { insuredParty: { customerId: "desc" } },
    ]);
  });

  it("sorts mobile by policy snapshot then party fallback", () => {
    expect(parsePolicyListOrderBy("mobile")).toEqual([
      { holderMobile: "asc" },
      { insuredParty: { mobile: "asc" } },
    ]);
    expect(parsePolicyListOrderBy("mobile_desc")).toEqual([
      { holderMobile: "desc" },
      { insuredParty: { mobile: "desc" } },
    ]);
  });

  it("keeps SVKK ID sort on shared party identity", () => {
    expect(parsePolicyListOrderBy("svkkId")).toEqual({ insuredParty: { svkkPublicId: "asc" } });
  });
});
