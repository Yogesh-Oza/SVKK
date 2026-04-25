import { Prisma } from "@prisma/client";
import type { UserRole } from "@prisma/client";
import type { MisScope } from "../../services/mis-scope.service.js";

/**
 * SQL fragment for `Policy` table alias `p` matching list/MIS read scope. Parameterized to avoid injection.
 */
export function buildPolicyScopeSqlP(
  role: UserRole,
  userId: string,
  scope: MisScope,
  filterVillage: string | undefined,
): Prisma.Sql {
  if (role === "USER") {
    return Prisma.sql`p.deletedAt IS NULL AND p.createdById = ${userId}`;
  }
  if (scope.kind === "full") {
    if (filterVillage) {
      return Prisma.sql`p.deletedAt IS NULL AND p.village = ${filterVillage}`;
    }
    return Prisma.sql`p.deletedAt IS NULL`;
  }
  if (scope.villages.length === 0) {
    return Prisma.sql`1 = 0`;
  }
  if (filterVillage) {
    return Prisma.sql`p.deletedAt IS NULL AND p.village = ${filterVillage}`;
  }
  return Prisma.sql`p.deletedAt IS NULL AND p.village IN (${Prisma.join(scope.villages)})`;
}
