import { describe, it, expect } from "vitest";
import {
  permissionValidationMessage,
  resolvePermissionClosure,
  roleRequiresGeo,
} from "@/lib/rbac/permission-closure";

describe("permission-closure v2 scopes", () => {
  it("future:lookup implies future:read via closure", () => {
    const keys = resolvePermissionClosure(["future:lookup"]);
    expect(keys.has("future:read")).toBe(true);
  });

  it("requires Future scope when future:read selected", () => {
    const msg = permissionValidationMessage(new Set(["future:read"]));
    expect(msg).toMatch(/Future access requires a scope/i);
  });

  it("roleRequiresGeo includes future and split MIS village scopes", () => {
    expect(roleRequiresGeo(new Set(["future:scope_village"]))).toBe(true);
    expect(roleRequiresGeo(new Set(["mis:policy:scope_village"]))).toBe(true);
    expect(roleRequiresGeo(new Set(["mis:claim:scope_village"]))).toBe(true);
    expect(roleRequiresGeo(new Set(["future:scope_all"]))).toBe(false);
  });
});
