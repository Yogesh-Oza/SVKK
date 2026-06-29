import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/svkk/api", () => ({
  apiGet: vi.fn(),
}));

vi.mock("./offline-reference", () => ({
  getCachedReferenceBundle: vi.fn(),
}));

import { apiGet } from "@/lib/svkk/api";
import { getCachedReferenceBundle } from "./offline-reference";
import { pickDefaultPolicyChartId, repairCreatePayloadChart } from "./offline-chart-resolve";

describe("offline-chart-resolve", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(getCachedReferenceBundle).mockReset();
  });

  it("pickDefaultPolicyChartId prefers COMBINED then HOLDER", () => {
    expect(
      pickDefaultPolicyChartId([
        { id: "m", chartKind: "MEMBER" },
        { id: "h", chartKind: "HOLDER" },
        { id: "c", chartKind: "COMBINED" },
      ]),
    ).toBe("c");
  });

  it("repairCreatePayloadChart replaces mismatched chart when online", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.mocked(apiGet).mockResolvedValue([
      { id: "chart-ff", policyTypeId: "type-ff", chartKind: "COMBINED" },
    ]);
    const repaired = await repairCreatePayloadChart({
      policyTypeId: "type-ff",
      policyChartId: "chart-ad",
      partyName: "Test",
    });
    expect(repaired.policyChartId).toBe("chart-ff");
    vi.unstubAllGlobals();
  });

  it("repairCreatePayloadChart keeps valid chart id", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.mocked(apiGet).mockResolvedValue([
      { id: "chart-ff", policyTypeId: "type-ff", chartKind: "COMBINED" },
    ]);
    const repaired = await repairCreatePayloadChart({
      policyTypeId: "type-ff",
      policyChartId: "chart-ff",
    });
    expect(repaired.policyChartId).toBe("chart-ff");
    vi.unstubAllGlobals();
  });

  it("repairCreatePayloadChart uses cached charts when offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.mocked(getCachedReferenceBundle).mockResolvedValue({
      dropdowns: {},
      categories: [],
      policyTypes: [],
      policyGroupings: [],
      policyChartsByTypeId: {
        "type-ff": [{ id: "cached-ff", chartKind: "COMBINED" }],
      },
      premiumSnapshot: { policyTypes: [] },
      premiumSnapshotVersion: "1",
      premiumSnapshotDate: new Date().toISOString(),
    });
    const repaired = await repairCreatePayloadChart({
      policyTypeId: "type-ff",
      policyChartId: "wrong-chart",
    });
    expect(repaired.policyChartId).toBe("cached-ff");
    vi.unstubAllGlobals();
  });
});
