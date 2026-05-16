import { describe, it, expect } from "vitest";
import { buildPolicyReadWhere } from "./mis-scope.service.js";
import { resolvePermissionClosure } from "../domain/permissions/dependencies.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../lib/permission-seed.js";

function perms(legacy: keyof typeof DEFAULT_ROLE_PERMISSIONS): Set<string> {
  return resolvePermissionClosure(DEFAULT_ROLE_PERMISSIONS[legacy].allow);
}

describe("buildPolicyReadWhere", () => {
  it("USER scope_own restricts to createdById", () => {
    const w = buildPolicyReadWhere(
      { kind: "villages", villages: [] },
      undefined,
      "u1",
      perms("USER"),
    );
    expect(w).toMatchObject({ createdById: "u1", deletedAt: null });
  });

  it("USER with village filter", () => {
    const w = buildPolicyReadWhere(
      { kind: "villages", villages: [] },
      "V1",
      "u1",
      perms("USER"),
    );
    expect(w).toMatchObject({ createdById: "u1", village: "V1" });
  });

  it("ADMIN scope_all uses full scope", () => {
    const w = buildPolicyReadWhere(
      { kind: "full" },
      "X",
      "u1",
      perms("ADMIN"),
    );
    expect(w).toMatchObject({
      AND: [{ deletedAt: null }, { village: { in: ["X"] } }],
    });
  });

  it("ADMIN multi-village filter", () => {
    const w = buildPolicyReadWhere(
      { kind: "full" },
      undefined,
      "u1",
      perms("ADMIN"),
      ["V1", "V2"],
    );
    expect(w).toMatchObject({
      AND: [{ deletedAt: null }, { village: { in: ["V1", "V2"] } }],
    });
  });
});
