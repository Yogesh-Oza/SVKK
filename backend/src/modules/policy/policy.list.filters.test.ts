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
