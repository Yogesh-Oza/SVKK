import { describe, it, expect } from "vitest";
import { isRoleAllowed } from "./rbac.js";
import { computeEffectivePermissions } from "../services/rbac.service.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../lib/permission-seed.js";
import { resolvePermissionClosure } from "../domain/permissions/dependencies.js";
import { WILDCARD_PERMISSION } from "../domain/permissions/catalog.js";

function permsForLegacyRole(legacy: keyof typeof DEFAULT_ROLE_PERMISSIONS): Set<string> {
  const cfg = DEFAULT_ROLE_PERMISSIONS[legacy];
  const allow = resolvePermissionClosure(cfg.allow);
  for (const d of cfg.deny ?? []) allow.delete(d);
  return allow;
}

describe("rbac effective permissions", () => {
  it("SUPER_ADMIN wildcard grants policy:delete", () => {
    const p = permsForLegacyRole("SUPER_ADMIN");
    expect(isRoleAllowed("policy:delete", p)).toBe(true);
  });

  it("USER cannot upload:csv", () => {
    const p = permsForLegacyRole("USER");
    expect(isRoleAllowed("upload:csv", p)).toBe(false);
  });

  it("ADMIN can upload:csv", () => {
    const p = permsForLegacyRole("ADMIN");
    expect(isRoleAllowed("upload:csv", p)).toBe(true);
  });

  it("USER cannot mis:policy:read", () => {
    const p = permsForLegacyRole("USER");
    expect(isRoleAllowed("mis:policy:read", p)).toBe(false);
  });

  it("SUPERVISOR can mis:policy:read and mis:claim:read", () => {
    const p = permsForLegacyRole("SUPERVISOR");
    expect(isRoleAllowed("mis:policy:read", p)).toBe(true);
    expect(isRoleAllowed("mis:claim:read", p)).toBe(true);
  });

  it("ADMIN can future:read and future:lookup", () => {
    const p = permsForLegacyRole("ADMIN");
    expect(isRoleAllowed("future:read", p)).toBe(true);
    expect(isRoleAllowed("future:lookup", p)).toBe(true);
  });

  it("USER cannot policy:update", () => {
    const p = permsForLegacyRole("USER");
    expect(isRoleAllowed("policy:update", p)).toBe(false);
  });

  it("DENY removes allowed key", () => {
    const effective = computeEffectivePermissions([
      { key: "policy:read", effect: "ALLOW" },
      { key: "policy:delete", effect: "ALLOW" },
      { key: "policy:delete", effect: "DENY" },
    ]);
    expect(effective.has("policy:read")).toBe(true);
    expect(effective.has("policy:delete")).toBe(false);
  });

  it("wildcard includes all catalog keys", () => {
    const effective = computeEffectivePermissions([
      { key: WILDCARD_PERMISSION, effect: "ALLOW" },
    ]);
    expect(effective.has(WILDCARD_PERMISSION)).toBe(true);
    expect(effective.has("roles:manage")).toBe(true);
  });
});
