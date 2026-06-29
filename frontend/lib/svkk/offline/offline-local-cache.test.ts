import { describe, expect, it, vi, beforeEach } from "vitest";

const putDetail = vi.fn();
const putList = vi.fn();

vi.mock("./db", () => ({
  getOfflineDb: () => ({
    policies_detail: {
      get: async () => ({
        id: "p1",
        updatedAt: "2026-01-01T00:00:00.000Z",
        policyNo: "OLD",
        village: "V",
        holderName: "Old Name",
        periodMonthText: "June",
        periodYearText: "2025-26",
        categoryText: "Category A",
        insuredParty: {
          svkkPublicId: "SVKK0614",
          name: "Old Name",
          mobile: "999",
          email: null,
          customerId: "C1",
          pan: null,
        },
        category: { key: "A", name: "Category A" },
        policyType: { id: "pt1", name: "Individual", key: "individual" },
        years: [
          {
            yearLabel: "2025-26",
            vkkPremium: "1000",
            sumInsured: "500000",
            members: [],
            payments: [],
          },
        ],
      }),
      put: (...args: unknown[]) => putDetail(...args),
    },
    policies_list: { put: (...args: unknown[]) => putList(...args) },
  }),
}));

vi.mock("./offline-reference", () => ({
  getCachedReferenceBundle: async () => ({
    categories: [{ id: "cat-b", value: "B", label: "Category B" }],
    policyTypes: [{ id: "pt2", value: "family_floater", label: "Family Floater" }],
  }),
}));

describe("applyOfflineUpdateToLocalCache", () => {
  beforeEach(() => {
    vi.resetModules();
    putDetail.mockReset();
    putList.mockReset();
  });

  it("updates list and detail rows from patch payload", async () => {
    const { applyOfflineUpdateToLocalCache } = await import("./offline-local-cache");
    await applyOfflineUpdateToLocalCache("p1", {
      yearLabel: "2025-26",
      policyNo: "PO81675560",
      periodMonthText: "July",
      categoryId: "cat-b",
      policyTypeId: "pt2",
      insuredParty: { partyName: "Vimala Manilal Gala", customerId: "C1" },
      vkkPremium: "15000",
    });

    expect(putDetail).toHaveBeenCalled();
    expect(putList).toHaveBeenCalled();
    const listRow = putList.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(listRow.policyNo).toBe("PO81675560");
    expect(listRow.periodMonthText).toBe("July");
    expect(listRow.holderName).toBe("Vimala Manilal Gala");
    expect(listRow.categoryName).toBe("Category B");
    expect(listRow.policyTypeName).toBe("Family Floater");
    expect(listRow.vkkPremium).toBe("15000");
  });
});

describe("applyOfflineCreateToLocalCache", () => {
  beforeEach(() => {
    vi.resetModules();
    putDetail.mockReset();
    putList.mockReset();
  });

  it("inserts list and detail rows from create payload", async () => {
    const { applyOfflineCreateToLocalCache } = await import("./offline-local-cache");
    await applyOfflineCreateToLocalCache("temp-create-1", {
      partyName: "New Offline Holder",
      mobile: "9876543210",
      svkkPublicId: "SVKK9999",
      customerId: "C99",
      policyNo: "PO99999999",
      village: "Test Village",
      periodMonthText: "August",
      periodYearText: "2026-27",
      yearLabel: "2026-27",
      categoryId: "cat-b",
      policyTypeId: "pt2",
      sumInsured: "300000",
      vkkPremium: "5000",
      members: [],
      payments: [],
    });

    expect(putDetail).toHaveBeenCalled();
    expect(putList).toHaveBeenCalled();
    const listRow = putList.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(listRow.id).toBe("temp-create-1");
    expect(listRow.policyNo).toBe("PO99999999");
    expect(listRow.holderName).toBe("New Offline Holder");
    expect(listRow.svkkId).toBe("SVKK9999");
    expect(listRow.village).toBe("Test Village");
    expect(listRow.periodMonthText).toBe("August");
    expect(listRow.categoryName).toBe("Category B");
    expect(listRow.policyTypeName).toBe("Family Floater");
  });
});
