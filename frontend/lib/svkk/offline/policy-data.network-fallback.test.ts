import { describe, expect, it, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";

const svkkJsonMock = vi.fn();
const getDetailMock = vi.fn();

vi.mock("@/lib/svkk/api", () => ({
  svkkJson: (...args: unknown[]) => svkkJsonMock(...args),
}));

vi.mock("./db", () => ({
  getOfflineDb: () => ({
    policies_detail: { get: (...args: unknown[]) => getDetailMock(...args) },
  }),
  getOrCreateMeta: async () => ({ key: "main" }),
  updateMeta: async () => {},
}));

describe("fetchPolicyDetail network fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    svkkJsonMock.mockReset();
    getDetailMock.mockReset();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("reads IndexedDB when API fails with network error", async () => {
    svkkJsonMock.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    getDetailMock.mockResolvedValue({
      id: "p1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      policyNo: "PN1",
      village: null,
      years: [],
      insuredParty: { svkkPublicId: "SVKK1", name: "A", mobile: "1", email: null, customerId: null, pan: null },
    });

    const { fetchPolicyDetail } = await import("./policy-data");
    const row = await fetchPolicyDetail("p1");
    expect(row.id).toBe("p1");
    expect(getDetailMock).toHaveBeenCalledWith("p1");
  });
});
