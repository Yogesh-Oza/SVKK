import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPolicyScopeSqlP } from "./mis.scope-sql.js";

function sqlText(sql: Prisma.Sql): string {
  return sql.strings.join("?");
}
import { resolvePermissionClosure } from "../../domain/permissions/dependencies.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../../lib/permission-seed.js";

function perms(legacy: keyof typeof DEFAULT_ROLE_PERMISSIONS): Set<string> {
  return resolvePermissionClosure(DEFAULT_ROLE_PERMISSIONS[legacy].allow);
}

describe("buildPolicyScopeSqlP", () => {
  it("ADMIN with scope_all is not limited to scope_own", () => {
    const admin = perms("ADMIN");
    expect(admin.has("policy:scope_all")).toBe(true);
    const sql = buildPolicyScopeSqlP(admin, "u1", { kind: "full" }, undefined);
    expect(sqlText(sql)).not.toContain("createdById");
  });

  it("USER with scope_own restricts to creator", () => {
    const sql = buildPolicyScopeSqlP(perms("USER"), "u1", { kind: "full" }, undefined);
    expect(sqlText(sql)).toContain("createdById");
  });

  it("SUPER_ADMIN wildcard sees all policies", () => {
    const sql = buildPolicyScopeSqlP(perms("SUPER_ADMIN"), "u1", { kind: "full" }, undefined);
    expect(sqlText(sql)).not.toContain("createdById");
  });
});
