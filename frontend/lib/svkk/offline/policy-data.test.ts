import { describe, expect, it, vi, beforeEach } from "vitest";

const rows = [
  {
    id: "1",
    policyNo: "P1",
    holderName: "Alice",
    svkkId: "SVKK100",
    mobile: "111",
    village: "V",
    yearLabel: "2025-26",
    customerId: "C1",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    policyNo: "P2",
    holderName: "Bob",
    svkkId: "SVKK200",
    mobile: "222",
    village: "V",
    yearLabel: "2025-26",
    customerId: "C2",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

vi.mock("./db", () => ({
  getOfflineDb: () => ({
    policies_list: {
      toArray: async () => rows,
      count: async () => rows.length,
    },
  }),
}));

describe("searchCachedPolicies", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("filters cached rows by svkk id token", async () => {
    const { searchCachedPolicies } = await import("./policy-data");
    const result = await searchCachedPolicies("svkk200");
    expect(result).toHaveLength(1);
    expect(result[0]?.svkkId).toBe("SVKK200");
  });
});
