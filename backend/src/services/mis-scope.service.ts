import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";
import { matchesGeoValue, normalizeGeoToken } from "./geo-normalize.js";
import { loadRoleGeoValues } from "./role-geo.service.js";
import { hasPermissionInSet } from "./rbac.service.js";

/**
 * Geographic data scope for policy / claim / MIS modules.
 * Future multi-role: union villageValues and areaValues across roles; highest scope wins per module.
 */
export type GeoScope =
  | { kind: "full" }
  | { kind: "geo"; villageValues: string[]; areaValues: string[] };

/** @deprecated Use GeoScope — kept for existing imports */
export type MisScope = GeoScope;

export type ScopeModule = "policy" | "claim" | "mis" | "dashboard";

const VILLAGE_SCOPE_KEYS: Record<ScopeModule, string> = {
  policy: "policy:scope_village",
  claim: "claim:scope_village",
  mis: "mis:scope_village",
  dashboard: "dashboard:scope_village",
};

const ALL_SCOPE_KEYS: Record<ScopeModule, string> = {
  policy: "policy:scope_all",
  claim: "claim:scope_all",
  mis: "mis:scope_all",
  dashboard: "dashboard:scope_all",
};

async function roleGeoScope(roleId: string): Promise<GeoScope> {
  const geo = await loadRoleGeoValues(roleId);
  return {
    kind: "geo",
    villageValues: geo.villageValues,
    areaValues: geo.areaValues,
  };
}

/**
 * Resolves geographic scope for a module (policy, claim, MIS) independently.
 */
export async function loadDataScope(
  userId: string,
  permissions: Set<string>,
  module: ScopeModule,
): Promise<GeoScope> {
  if (hasPermissionInSet(permissions, ALL_SCOPE_KEYS[module]) || hasPermissionInSet(permissions, "*:*")) {
    return { kind: "full" };
  }

  if (hasPermissionInSet(permissions, VILLAGE_SCOPE_KEYS[module])) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true },
    });
    if (!user) {
      return { kind: "geo", villageValues: [], areaValues: [] };
    }
    return roleGeoScope(user.roleId);
  }

  if (module === "policy" && hasPermissionInSet(permissions, "policy:scope_own")) {
    return { kind: "full" };
  }

  return { kind: "geo", villageValues: [], areaValues: [] };
}

/** @deprecated Prefer loadDataScope(userId, permissions, "mis") */
export async function loadMisScope(
  userId: string,
  permissions: Set<string>,
  module: ScopeModule = "mis",
): Promise<GeoScope> {
  return loadDataScope(userId, permissions, module);
}

const activePolicy: Prisma.PolicyWhereInput = { deletedAt: null };

function normalizeVillageFilter(v: string | string[] | undefined): string[] | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const out = v.map((x) => normalizeGeoToken(x)).filter(Boolean);
    return out.length ? [...new Set(out)] : undefined;
  }
  const s = normalizeGeoToken(v);
  return s ? [s] : undefined;
}

function assertFilterWithinGeo(filterValues: string[], allowed: string[], label: string): void {
  for (const fv of filterValues) {
    if (!matchesGeoValue(fv, allowed)) {
      throw new AppError("FORBIDDEN", `${label} not in your scope`, 403);
    }
  }
}

/** Prisma WHERE for policy rows under geo scope (null village/area never match). */
export function buildGeoPolicyWhere(
  villageValues: string[],
  areaValues: string[],
): Prisma.PolicyWhereInput {
  const hasV = villageValues.length > 0;
  const hasA = areaValues.length > 0;
  if (!hasV && !hasA) {
    return { id: { in: [] } };
  }
  const and: Prisma.PolicyWhereInput[] = [];
  if (hasV) {
    and.push(
      { village: { not: null } },
      { NOT: { village: "" } },
      { village: { in: villageValues } },
    );
  }
  if (hasA) {
    and.push({ area: { not: null } }, { NOT: { area: "" } }, { area: { in: areaValues } });
  }
  return { AND: and };
}

export function buildGeoClaimWhere(
  villageValues: string[],
  areaValues: string[],
): Prisma.ClaimWhereInput {
  const hasV = villageValues.length > 0;
  const hasA = areaValues.length > 0;
  if (!hasV && !hasA) {
    return { id: { in: [] } };
  }
  const and: Prisma.ClaimWhereInput[] = [];
  if (hasV) {
    and.push(
      { village: { not: null } },
      { NOT: { village: "" } },
      { village: { in: villageValues } },
    );
  }
  if (hasA) {
    and.push({
      policy: {
        deletedAt: null,
        AND: [{ area: { not: null } }, { NOT: { area: "" } }, { area: { in: areaValues } }],
      },
    });
  }
  return { AND: and };
}

export function buildMisVillageWhere(
  scope: GeoScope,
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

  const { villageValues, areaValues } = scope;
  if (villageValues.length === 0 && areaValues.length === 0) {
    return { policy: { id: { in: [] } }, claim: { id: { in: [] } } };
  }

  if (filterVillages?.length) {
    assertFilterWithinGeo(filterVillages, villageValues, "Village");
    return {
      policy: { AND: [activePolicy, buildGeoPolicyWhere(filterVillages, areaValues)] },
      claim: { AND: [buildGeoClaimWhere(filterVillages, areaValues)] },
    };
  }

  return {
    policy: { AND: [activePolicy, buildGeoPolicyWhere(villageValues, areaValues)] },
    claim: buildGeoClaimWhere(villageValues, areaValues),
  };
}

export function buildPolicyReadWhere(
  scope: GeoScope,
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

  if (hasPermissionInSet(permissions, "policy:scope_all")) {
    return buildMisVillageWhere(scope, vs).policy;
  }

  if (hasPermissionInSet(permissions, "policy:scope_own")) {
    const own: Prisma.PolicyWhereInput = { deletedAt: null, createdById: userId };
    if (hasPermissionInSet(permissions, "policy:scope_village") && scope.kind === "geo") {
      return { AND: [own, buildGeoPolicyWhere(scope.villageValues, scope.areaValues)] };
    }
    return {
      ...own,
      ...(vs?.length === 1 ? { village: vs[0] } : vs?.length ? { village: { in: vs } } : {}),
    };
  }

  return buildMisVillageWhere(scope, vs).policy;
}

export type GeoRecord = { village: string | null; area?: string | null };

export function assertRecordInGeoScope(
  record: GeoRecord,
  scope: GeoScope,
  permissions: Set<string>,
  module: ScopeModule,
): void {
  if (hasPermissionInSet(permissions, ALL_SCOPE_KEYS[module]) || hasPermissionInSet(permissions, "*:*")) {
    return;
  }
  if (scope.kind === "full") {
    return;
  }

  const { villageValues, areaValues } = scope;
  if (villageValues.length === 0 && areaValues.length === 0) {
    throw new AppError("NOT_FOUND", "Record outside your village/area scope", 404);
  }

  if (villageValues.length > 0) {
    if (!matchesGeoValue(record.village, villageValues)) {
      throw new AppError("NOT_FOUND", "Record outside your village/area scope", 404);
    }
  }

  if (areaValues.length > 0) {
    if (!matchesGeoValue(record.area ?? null, areaValues)) {
      throw new AppError("NOT_FOUND", "Record outside your village/area scope", 404);
    }
  }
}

export function assertGeoFieldsOnWrite(
  fields: { village?: string | null; area?: string | null },
  scope: GeoScope,
  permissions: Set<string>,
  module: ScopeModule,
): void {
  if (hasPermissionInSet(permissions, ALL_SCOPE_KEYS[module]) || hasPermissionInSet(permissions, "*:*")) {
    return;
  }
  if (scope.kind === "full") {
    return;
  }
  if (module === "policy" && hasPermissionInSet(permissions, "policy:scope_own") && !hasPermissionInSet(permissions, "policy:scope_village")) {
    return;
  }

  assertRecordInGeoScope(
    { village: fields.village ?? null, area: fields.area ?? null },
    scope,
    permissions,
    module,
  );
}

export function assertPolicyReadable(
  policy: { village: string | null; area?: string | null; createdById: string | null },
  userId: string,
  permissions: Set<string>,
  scope: GeoScope,
): void {
  if (hasPermissionInSet(permissions, "policy:scope_all")) {
    return;
  }
  if (hasPermissionInSet(permissions, "policy:scope_own")) {
    if (policy.createdById !== userId) {
      throw new AppError("NOT_FOUND", "Policy not found", 404);
    }
    if (!hasPermissionInSet(permissions, "policy:scope_village")) {
      return;
    }
  }
  assertRecordInGeoScope(
    { village: policy.village, area: policy.area ?? null },
    scope,
    permissions,
    "policy",
  );
}

export function assertClaimInGeoScope(
  claim: { village: string | null; policy?: { area: string | null } | null },
  permissions: Set<string>,
  scope: GeoScope,
): void {
  if (hasPermissionInSet(permissions, "claim:scope_all")) {
    return;
  }
  if (!hasPermissionInSet(permissions, "claim:read")) {
    throw new AppError("FORBIDDEN", "Insufficient permissions", 403);
  }
  assertRecordInGeoScope(
    { village: claim.village, area: claim.policy?.area ?? null },
    scope,
    permissions,
    "claim",
  );
}

/** @deprecated Use assertClaimInGeoScope */
export function assertClaimVillageInScope(
  claim: { village: string | null },
  permissions: Set<string>,
  scope: GeoScope,
): void {
  assertClaimInGeoScope(claim, permissions, scope);
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

export const VILLAGE_SCOPE_PERMISSION_KEYS = [
  "policy:scope_village",
  "claim:scope_village",
  "mis:scope_village",
] as const;

export function roleRequiresGeo(keys: Iterable<string>): boolean {
  const set = new Set(keys);
  return VILLAGE_SCOPE_PERMISSION_KEYS.some((k) => set.has(k));
}

export function assertRoleGeoRequired(
  permissionKeys: Iterable<string>,
  villageOptionIds: string[],
  areaOptionIds: string[],
): void {
  if (!roleRequiresGeo(permissionKeys)) {
    return;
  }
  if (villageOptionIds.length === 0 && areaOptionIds.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Village-scoped permissions require at least one allowed village or area.",
      400,
    );
  }
}
