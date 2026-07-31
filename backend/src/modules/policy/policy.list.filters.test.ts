import { describe, expect, it } from "vitest";
import { buildPolicyListWhere } from "./policy.list.js";

describe("buildPolicyListWhere category filter", () => {
  const scope = { kind: "full" as const };
  const perms = new Set(["policy:read", "policy:scope_all"]);

  it("applies categoryId when categoryIds provided", () => {
    const where = buildPolicyListWhere(scope, "u1", perms, {
      categoryIds: ["cat-svga"],
    });
    expect(JSON.stringify(where)).toContain("cat-svga");
  });

  it("applies category key when categoryKeys provided without ids", () => {
    const where = buildPolicyListWhere(scope, "u1", perms, {
      categoryKeys: ["svga"],
    });
    expect(JSON.stringify(where)).toContain("svga");
  });
});
describe("buildPolicyListWhere renewal vs createdAt", () => {
  const scope = { kind: "full" as const };
  const perms = new Set(["policy:read", "policy:scope_all"]);

  it("applies createdAt bounds when renewal filter is off", () => {
    const where = buildPolicyListWhere(scope, "u1", perms, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });
    const s = JSON.stringify(where);
    expect(s).toContain("createdAt");
  });

  it("skips createdAt bounds when renewalPending is on", () => {
    const where = buildPolicyListWhere(scope, "u1", perms, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      renewalPending: true,
      renewalAsOf: "2026-07-31",
    });
    const s = JSON.stringify(where);
    expect(s).not.toContain("createdAt");
    expect(s).toContain("policyEnd");
  });

  it("skips createdAt bounds when renewalBucket is on", () => {
    const where = buildPolicyListWhere(scope, "u1", perms, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      renewalBucket: "expired",
      renewalAsOf: "2026-07-31",
    });
    const s = JSON.stringify(where);
    expect(s).not.toContain("createdAt");
    expect(s).toContain("policyEnd");
  });
});
