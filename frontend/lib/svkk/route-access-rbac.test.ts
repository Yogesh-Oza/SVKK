import { describe, expect, it } from "vitest";
import { canAccessPath } from "@/lib/svkk/route-permissions";

describe("SVKK URL access rules", () => {
  const adminPermissions = [
    "dashboard:read",
    "policy:read",
    "policy:create",
    "policy:export",
    "claim:read",
    "claim:export",
    "roles:read",
    "users:read",
    "admin:dropdowns:read",
    "settings:read",
    "emailTemplates:read",
    "categoryForm:read",
    "notifications:read",
    "logs:read",
  ];

  const supervisorPermissions = [
    "dashboard:read",
    "policy:read",
    "policy:create",
    "claim:read",
    "future:read",
    "future:lookup",
    "mis:policy:read",
    "mis:claim:read",
    "notifications:read",
  ];

  const basicUserPermissions = [
    "dashboard:read",
    "policy:read",
    "policy:create",
    "calculation:live",
  ];

  it("allows admin-only pages only when their read permission exists", () => {
    expect(canAccessPath(adminPermissions, "/roles")).toBe(true);
    expect(canAccessPath(adminPermissions, "/users")).toBe(true);
    expect(canAccessPath(adminPermissions, "/admin")).toBe(true);
    expect(canAccessPath(adminPermissions, "/receipt-settings")).toBe(true);

    expect(canAccessPath(supervisorPermissions, "/roles")).toBe(false);
    expect(canAccessPath(supervisorPermissions, "/users")).toBe(false);
    expect(canAccessPath(supervisorPermissions, "/admin")).toBe(false);
    expect(canAccessPath(supervisorPermissions, "/receipt-settings")).toBe(false);
  });

  it("allows claim, wallet, and MIS pages only for users with those route permissions", () => {
    expect(canAccessPath(supervisorPermissions, "/claims")).toBe(true);
    expect(canAccessPath(supervisorPermissions, "/mis")).toBe(true);
    expect(canAccessPath(["wallet:read"], "/wallet")).toBe(true);
    expect(canAccessPath(basicUserPermissions, "/claims")).toBe(false);
    expect(canAccessPath(basicUserPermissions, "/mis")).toBe(false);
    expect(canAccessPath(basicUserPermissions, "/wallet")).toBe(false);
  });

  it("keeps policy list and policy create distinct", () => {
    expect(canAccessPath(basicUserPermissions, "/policies")).toBe(true);
    expect(canAccessPath(basicUserPermissions, "/policies/new")).toBe(true);
    expect(canAccessPath(["policy:read"], "/policies/new")).toBe(false);
  });
});
