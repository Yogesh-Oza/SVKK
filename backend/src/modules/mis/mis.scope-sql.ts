import { Prisma } from "@prisma/client";
import type { GeoScope } from "../../services/mis-scope.service.js";
import { hasPermissionInSet } from "../../services/rbac.service.js";

function sqlInList(values: string[]): Prisma.Sql {
  if (!values.length) {
    return Prisma.sql`1 = 0`;
  }
  return Prisma.join(values.map((v) => Prisma.sql`${v}`));
}

/**
 * SQL fragment for `Policy` table alias `p` matching list/MIS read scope. Parameterized only.
 */
export function buildPolicyScopeSqlP(
  permissions: Set<string>,
  userId: string,
  scope: GeoScope,
  filterVillage: string | undefined,
): Prisma.Sql {
  if (
    hasPermissionInSet(permissions, "policy:scope_all") ||
    hasPermissionInSet(permissions, "mis:policy:scope_all") ||
    hasPermissionInSet(permissions, "future:scope_all")
  ) {
    if (filterVillage) {
      return Prisma.sql`p.deletedAt IS NULL AND p.village = ${filterVillage}`;
    }
    return Prisma.sql`p.deletedAt IS NULL`;
  }

  if (hasPermissionInSet(permissions, "policy:scope_own")) {
    if (filterVillage) {
      return Prisma.sql`p.deletedAt IS NULL AND p.createdById = ${userId} AND p.village = ${filterVillage}`;
    }
    return Prisma.sql`p.deletedAt IS NULL AND p.createdById = ${userId}`;
  }

  if (scope.kind === "full") {
    if (filterVillage) {
      return Prisma.sql`p.deletedAt IS NULL AND p.village = ${filterVillage}`;
    }
    return Prisma.sql`p.deletedAt IS NULL`;
  }

  const { villageValues, areaValues } = scope;
  if (villageValues.length === 0 && areaValues.length === 0) {
    return Prisma.sql`1 = 0`;
  }

  const parts: Prisma.Sql[] = [Prisma.sql`p.deletedAt IS NULL`];

  if (villageValues.length > 0) {
    parts.push(Prisma.sql`p.village IS NOT NULL`);
    parts.push(Prisma.sql`p.village <> ''`);
    if (filterVillage) {
      parts.push(Prisma.sql`p.village = ${filterVillage}`);
    } else {
      parts.push(Prisma.sql`p.village IN (${sqlInList(villageValues)})`);
    }
  }

  if (areaValues.length > 0) {
    parts.push(Prisma.sql`p.area IS NOT NULL`);
    parts.push(Prisma.sql`p.area <> ''`);
    parts.push(Prisma.sql`p.area IN (${sqlInList(areaValues)})`);
  }

  return Prisma.join(parts, " AND ");
}
