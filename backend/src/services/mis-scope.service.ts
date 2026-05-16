import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";
import { hasPermissionInSet } from "./rbac.service.js";

export type MisScope = { kind: "full" } | { kind: "villages"; villages: string[] };

/**
 * Resolves MIS/policy scope from effective permissions.
 */
export async function loadMisScope(
  userId: string,
  permissions: Set<string>,
): Promise<MisScope> {
  if (hasPermissionInSet(permissions, "mis:scope_all") || hasPermissionInSet(permissions, "policy:scope_all")) {
    return { kind: "full" };
  }
  if (
    hasPermissionInSet(permissions, "mis:scope_village") ||
    hasPermissionInSet(permissions, "policy:scope_village")
  ) {
    const rows = await prisma.userVillage.findMany({
      where: { userId },
      select: { village: true },
    });
    return { kind: "villages", villages: rows.map((r) => r.village) };
  }
  return { kind: "villages", villages: [] };
}

const activePolicy: Prisma.PolicyWhereInput = { deletedAt: null };

function normalizeVillageFilter(v: string | string[] | undefined): string[] | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const out = v.map((x) => String(x).trim()).filter(Boolean);
    return out.length ? [...new Set(out)] : undefined;
  }
  const s = String(v).trim();
  return s ? [s] : undefined;
}

export function buildMisVillageWhere(
  scope: MisScope,
  filterVillage: string | string[] | undefined,
): { policy: Prisma.PolicyWhereInput; claim: Prisma.ClaimWhereInput } {
  const filterVillages = normalizeVillageFilter(filterVillage);
  if (scope.kind === "full") {
    const v = filterVillages?.length
      ? { AND: [activePolicy, { village: { in: filterVillages } }] }
      : activePolicy;
    const c = filterVillages?.length ? { village: { in: filterVillages } } : {};
    return { policy: v, claim: c };
  }
  if (scope.villages.length === 0) {
    return { policy: { id: { in: [] } }, claim: { id: { in: [] } } };
  }
  if (filterVillages?.length) {
    for (const fv of filterVillages) {
      if (!scope.villages.includes(fv)) {
        throw new AppError("FORBIDDEN", "Village not in your scope", 403);
      }
    }
    return {
      policy: { AND: [activePolicy, { village: { in: filterVillages } }] },
      claim: { village: { in: filterVillages } },
    };
  }
  return {
    policy: { AND: [activePolicy, { village: { in: scope.villages } }] },
    claim: { village: { in: scope.villages } },
  };
}

export function buildPolicyReadWhere(
  scope: MisScope,
  filterVillage: string | undefined,
  userId: string,
  permissions: Set<string>,
  filterVillages?: string[],
): Prisma.PolicyWhereInput {
  let vs: string[] | undefined;
  if (filterVillages != null && filterVillages.length > 0) {
    vs = filterVillages;
  } else if (filterVillage?.trim()) {
    vs = [filterVillage.trim()];
  } else {
    vs = undefined;
  }

  if (hasPermissionInSet(permissions, "policy:scope_own")) {
    return {
      deletedAt: null,
      createdById: userId,
      ...(vs?.length === 1 ? { village: vs[0] } : vs?.length ? { village: { in: vs } } : {}),
    };
  }

  return buildMisVillageWhere(scope, vs).policy;
}

export function assertPolicyReadable(
  policy: { village: string | null; createdById: string | null },
  userId: string,
  permissions: Set<string>,
  scope: MisScope,
): void {
  if (hasPermissionInSet(permissions, "policy:scope_own")) {
    if (policy.createdById !== userId) {
      throw new AppError("NOT_FOUND", "Policy not found", 404);
    }
    return;
  }
  if (hasPermissionInSet(permissions, "policy:scope_all")) {
    return;
  }
  if (scope.kind === "full") {
    return;
  }
  if (scope.villages.length === 0) {
    throw new AppError("NOT_FOUND", "Policy not found", 404);
  }
  if (!policy.village || !scope.villages.includes(policy.village)) {
    throw new AppError("NOT_FOUND", "Policy not found", 404);
  }
}

export function assertClaimVillageInScope(
  claim: { village: string | null },
  permissions: Set<string>,
  scope: MisScope,
): void {
  if (hasPermissionInSet(permissions, "claim:scope_all")) {
    return;
  }
  if (!hasPermissionInSet(permissions, "claim:read")) {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }
  if (scope.kind === "full") {
    return;
  }
  if (scope.villages.length === 0) {
    throw new AppError("NOT_FOUND", "Claim not found", 404);
  }
  if (!claim.village || !scope.villages.includes(claim.village)) {
    throw new AppError("NOT_FOUND", "Claim not found", 404);
  }
}

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
