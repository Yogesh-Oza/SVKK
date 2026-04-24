import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { isRoleAllowed } from "./rbac.js";

const ALL_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"];

describe("rbac matrix", () => {
  it("denies upload:csv to SUPERVISOR and USER", () => {
    expect(isRoleAllowed("upload:csv", "SUPERVISOR")).toBe(false);
    expect(isRoleAllowed("upload:csv", "USER")).toBe(false);
  });

  it("allows upload:csv to ADMIN and SUPER_ADMIN", () => {
    expect(isRoleAllowed("upload:csv", "ADMIN")).toBe(true);
    expect(isRoleAllowed("upload:csv", "SUPER_ADMIN")).toBe(true);
  });

  it("denies mis:read to USER", () => {
    expect(isRoleAllowed("mis:read", "USER")).toBe(false);
  });

  it("allows mis:read to SUPERVISOR, ADMIN, SUPER_ADMIN", () => {
    for (const role of ["SUPERVISOR", "ADMIN", "SUPER_ADMIN"] as const) {
      expect(isRoleAllowed("mis:read", role)).toBe(true);
    }
  });

  it("denies policy:update to USER", () => {
    expect(isRoleAllowed("policy:update", "USER")).toBe(false);
  });

  it("denies policy:delete to SUPERVISOR and USER", () => {
    expect(isRoleAllowed("policy:delete", "SUPERVISOR")).toBe(false);
    expect(isRoleAllowed("policy:delete", "USER")).toBe(false);
  });

  it("denies all claim and receipt actions to USER", () => {
    expect(isRoleAllowed("claim:create", "USER")).toBe(false);
    expect(isRoleAllowed("claim:read", "USER")).toBe(false);
    expect(isRoleAllowed("claim:update", "USER")).toBe(false);
    expect(isRoleAllowed("claim:delete", "USER")).toBe(false);
    expect(isRoleAllowed("receipt:create", "USER")).toBe(false);
  });

  it("denies logs:read to SUPERVISOR and USER", () => {
    expect(isRoleAllowed("logs:read", "SUPERVISOR")).toBe(false);
    expect(isRoleAllowed("logs:read", "USER")).toBe(false);
  });

  it("every role can policy:create, policy:read, calculation:live", () => {
    for (const role of ALL_ROLES) {
      expect(isRoleAllowed("policy:create", role)).toBe(true);
      expect(isRoleAllowed("policy:read", role)).toBe(true);
      expect(isRoleAllowed("calculation:live", role)).toBe(true);
    }
  });
});
