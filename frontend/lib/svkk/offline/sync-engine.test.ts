import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/svkk/offline/analytics-log", () => ({
  logOfflineEvent: vi.fn(),
}));

const pendingMutations: unknown[] = [];
let resolvePending: (() => void) | null = null;

vi.mock("@/lib/svkk/offline/db", () => ({
  getOfflineDb: () => ({
    mutations: {
      where: () => ({
        anyOf: () => ({
          sortBy: () =>
            new Promise<unknown[]>((resolve) => {
              resolvePending = () => resolve(pendingMutations);
            }),
        }),
        equals: () => ({
          count: async () => 0,
        }),
      }),
    },
  }),
}));

describe("sync mutex", () => {
  beforeEach(() => {
    vi.resetModules();
    pendingMutations.length = 0;
    resolvePending = null;
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips concurrent sync while one is in progress", async () => {
    const { syncPendingMutations, isSyncRunning } = await import("./sync-engine");
    expect(isSyncRunning()).toBe(false);

    const p1 = syncPendingMutations("manual");
    await Promise.resolve();
    expect(isSyncRunning()).toBe(true);

    const p2 = syncPendingMutations("manual");
    resolvePending?.();
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r2.skipped).toBe(true);
    expect(isSyncRunning()).toBe(false);
    expect(r1.skipped).toBeUndefined();
  });
});
