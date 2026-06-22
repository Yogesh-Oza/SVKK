import { describe, it, expect } from "vitest";
import {
  assertRecordInGeoScope,
  assertRoleGeoRequired,
  buildGeoPolicyWhere,
  buildPolicyReadWhere,
  resolvePolicyReadScopeModule,
} from "./mis-scope.service.js";
import { resolvePermissionClosure } from "../domain/permissions/dependencies.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../lib/permission-seed.js";
import { AppError } from "../errors/app-error.js";

function perms(legacy: keyof typeof DEFAULT_ROLE_PERMISSIONS): Set<string> {
  return resolvePermissionClosure(DEFAULT_ROLE_PERMISSIONS[legacy].allow);
}

describe("resolvePolicyReadScopeModule", () => {
  it("prefers policy module when policy:read is granted", () => {
    expect(resolvePolicyReadScopeModule(new Set(["policy:read", "future:read"]))).toBe("policy");
    expect(resolvePolicyReadScopeModule(new Set(["future:read"]))).toBe("future");
  });
});

describe("buildPolicyReadWhere", () => {
  it("USER scope_own restricts to createdById", () => {
    const w = buildPolicyReadWhere(
      { kind: "full" },
      undefined,
      "u1",
      perms("USER"),
    );
    expect(w).toMatchObject({ createdById: "u1", deletedAt: null });
  });

  it("ADMIN scope_all uses full scope with village filter", () => {
    const w = buildPolicyReadWhere({ kind: "full" }, "X", "u1", perms("ADMIN"));
    expect(w).toMatchObject({
      AND: [{ deletedAt: null }, { village: { in: ["X"] } }],
    });
  });
});

describe("buildGeoPolicyWhere", () => {
  it("requires non-null village and area when both lists set", () => {
    const w = buildGeoPolicyWhere(["Mumbai"], ["Naroda"]);
    expect(w).toEqual({
      AND: [
        { village: { not: null } },
        { NOT: { village: "" } },
        { village: { in: ["Mumbai"] } },
        { area: { not: null } },
        { NOT: { area: "" } },
        { area: { in: ["Naroda"] } },
      ],
    });
  });

  it("empty lists yield no rows", () => {
    expect(buildGeoPolicyWhere([], [])).toEqual({ id: { in: [] } });
  });
});

describe("assertRecordInGeoScope", () => {
  const geoScope = { kind: "geo" as const, villageValues: ["mumbai"], areaValues: ["naroda"] };
  const villagePerms = perms("SUPERVISOR");

  it("rejects null village", () => {
    expect(() =>
      assertRecordInGeoScope(
        { village: null, area: "naroda" },
        geoScope,
        villagePerms,
        "policy",
      ),
    ).toThrow(AppError);
  });

  it("matches case-insensitively", () => {
    expect(() =>
      assertRecordInGeoScope(
        { village: "Mumbai", area: "Naroda" },
        geoScope,
        villagePerms,
        "policy",
      ),
    ).not.toThrow();
  });
});

describe("assertRoleGeoRequired", () => {
  it("rejects village scope without geo options", () => {
    expect(() =>
      assertRoleGeoRequired(["policy:scope_village", "policy:read"], [], []),
    ).toThrow(/at least one allowed village or area/i);
  });

  it("allows scope_all without geo", () => {
    expect(() => assertRoleGeoRequired(["policy:scope_all"], [], [])).not.toThrow();
  });
});
