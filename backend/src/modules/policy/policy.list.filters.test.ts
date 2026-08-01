import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./renewal-pending.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./renewal-pending.js")>();
  return {
    ...actual,
    fetchLatestPolicyIdsUnderInsuredParty: vi.fn(async () => ["latest-1"]),
  };
});

import { buildPolicyListWhere } from "./policy.list.js";

describe("buildPolicyListWhere category filter", () => {
  const scope = { kind: "full" as const };
  const perms = new Set(["policy:read", "policy:scope_all"]);

  it("applies categoryId when categoryIds provided", async () => {
    const where = await buildPolicyListWhere(scope, "u1", perms, {
      categoryIds: ["cat-svga"],
    });
    expect(JSON.stringify(where)).toContain("cat-svga");
  });

  it("applies category key when categoryKeys provided without ids", async () => {
    const where = await buildPolicyListWhere(scope, "u1", perms, {
      categoryKeys: ["svga"],
    });
    expect(JSON.stringify(where)).toContain("svga");
  });
});

describe("buildPolicyListWhere renewal vs createdAt", () => {
  const scope = { kind: "full" as const };
  const perms = new Set(["policy:read", "policy:scope_all"]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies createdAt bounds when renewal filter is off", async () => {
    const where = await buildPolicyListWhere(scope, "u1", perms, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });
    const s = JSON.stringify(where);
    expect(s).toContain("createdAt");
  });

  it("skips createdAt bounds when renewalPending is on", async () => {
    const where = await buildPolicyListWhere(scope, "u1", perms, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      renewalPending: true,
      renewalAsOf: "2026-07-31",
    });
    const s = JSON.stringify(where);
    expect(s).not.toContain("createdAt");
    expect(s).toContain("policyEnd");
    expect(s).toContain("latest-1");
  });

  it("skips createdAt bounds when renewalBucket is on", async () => {
    const where = await buildPolicyListWhere(scope, "u1", perms, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      renewalBucket: "expired",
      renewalAsOf: "2026-07-31",
    });
    const s = JSON.stringify(where);
    expect(s).not.toContain("createdAt");
    expect(s).toContain("policyEnd");
    expect(s).toContain("latest-1");
  });
});
