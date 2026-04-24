import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";

export type MisScope = { kind: "full" } | { kind: "villages"; villages: string[] };

/**
 * Resolves how MIS and policy list queries filter by `village`.
 * ADMIN and SUPER_ADMIN see all data, optionally narrowed by a query `village` param.
 * SUPERVISOR is limited to `UserVillage` rows; empty list yields no visible rows.
 */
export async function loadMisScope(userId: string, role: UserRole): Promise<MisScope> {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    return { kind: "full" };
  }
  if (role === "SUPERVISOR") {
    const rows = await prisma.userVillage.findMany({
      where: { userId },
      select: { village: true },
    });
    return { kind: "villages", villages: rows.map((r) => r.village) };
  }
  return { kind: "villages", villages: [] };
}

/**
 * Builds Prisma `where` fragments for `Policy` and `Claim` from scope + optional filter village.
 * @throws AppError 403 if a scoped user requests a village outside their list
 */
export function buildMisVillageWhere(
  scope: MisScope,
  filterVillage: string | undefined,
): { policy: Prisma.PolicyWhereInput; claim: Prisma.ClaimWhereInput } {
  if (scope.kind === "full") {
    const v = filterVillage ? { village: filterVillage } : {};
    return { policy: v, claim: v };
  }
  if (scope.villages.length === 0) {
    return { policy: { id: { in: [] } }, claim: { id: { in: [] } } };
  }
  if (filterVillage) {
    if (!scope.villages.includes(filterVillage)) {
      throw new AppError("FORBIDDEN", "Village not in your scope", 403);
    }
    return { policy: { village: filterVillage }, claim: { village: filterVillage } };
  }
  return {
    policy: { village: { in: scope.villages } },
    claim: { village: { in: scope.villages } },
  };
}

/**
 * Merges optional `createdAt` range (policy / claim `createdAt`) with village filters.
 */
export function mergeDateRange(
  where: { policy: Prisma.PolicyWhereInput; claim: Prisma.ClaimWhereInput },
  from?: Date,
  to?: Date,
): { policy: Prisma.PolicyWhereInput; claim: Prisma.ClaimWhereInput } {
  if (!from && !to) {
    return where;
  }
  const dr = { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
  return {
    policy: { AND: [where.policy, dr] },
    claim: { AND: [where.claim, dr] },
  };
}
