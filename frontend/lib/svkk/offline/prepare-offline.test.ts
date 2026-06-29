import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();

vi.mock("@/lib/svkk/api", () => ({
  svkkJson: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("./db", () => {
  const listRows: unknown[] = [];
  const detailRows: unknown[] = [];
  return {
    getOfflineDb: () => ({
      policies_list: {
        clear: async () => {
          listRows.length = 0;
        },
        bulkPut: async (rows: unknown[]) => {
          listRows.push(...rows);
        },
        count: async () => listRows.length,
      },
      policies_detail: {
        clear: async () => {
          detailRows.length = 0;
        },
        bulkPut: async (rows: unknown[]) => {
          detailRows.push(...rows);
        },
      },
      reference: { put: async () => {} },
      id_pool: { bulkAdd: async () => {} },
    }),
    updateMeta: async () => {},
  };
});

vi.mock("./analytics-log", () => ({
  logOfflineEvent: async () => {},
}));

describe("downloadAllPoliciesForOffline", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("fetches all batches until hasMore is false", async () => {
    fetchMock
      .mockResolvedValueOnce({
        meta: {
          syncedAt: "2026-06-25T00:00:00.000Z",
          policyCount: 2,
          totalAvailable: 3,
          offset: 0,
          hasMore: true,
          premiumSnapshotVersion: "1",
          scopeHash: "abc",
        },
        policies: [
          { id: "1", insuredParty: { svkkPublicId: "A" }, updatedAt: "2026-01-01T00:00:00.000Z" },
          { id: "2", insuredParty: { svkkPublicId: "B" }, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        details: [],
        reference: {
          dropdowns: {},
          categories: [],
          policyTypes: [],
          policyGroupings: [],
          premiumSnapshot: { policyTypes: [] },
          premiumSnapshotVersion: "1",
          premiumSnapshotDate: "2026-06-25T00:00:00.000Z",
        },
      })
      .mockResolvedValueOnce({
        meta: {
          syncedAt: "2026-06-25T00:00:00.000Z",
          policyCount: 1,
          totalAvailable: 3,
          offset: 2,
          hasMore: false,
          premiumSnapshotVersion: "1",
          scopeHash: "abc",
        },
        policies: [
          { id: "3", insuredParty: { svkkPublicId: "C" }, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        details: [],
        reference: {
          dropdowns: {},
          categories: [],
          policyTypes: [],
          policyGroupings: [],
          premiumSnapshot: { policyTypes: [] },
          premiumSnapshotVersion: "1",
          premiumSnapshotDate: "2026-06-25T00:00:00.000Z",
        },
      });

    const { downloadAllPoliciesForOffline } = await import("./prepare-offline");
    const result = await downloadAllPoliciesForOffline();
    expect(result.totalCached).toBe(3);
    expect(result.totalAvailable).toBe(3);
    const bundleCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/offline-bundle"),
    );
    expect(bundleCalls).toHaveLength(2);
    expect(String(bundleCalls[0]?.[0])).toContain("allYears=true");
    expect(String(bundleCalls[1]?.[0])).toContain("offset=2");
  });
});
