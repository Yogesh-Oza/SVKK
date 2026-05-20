import type { PermissionEffect } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";
import { WILDCARD_PERMISSION, CATALOG_KEYS } from "../domain/permissions/catalog.js";
import { resolvePermissionClosure } from "../domain/permissions/dependencies.js";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const permissionCache = new Map<string, CacheEntry>();

export function cacheKeyForRole(roleId: string, permVersion: number): string {
  return `${roleId}:${permVersion}`;
}

export function invalidateRolePermissionCache(roleId: string, permVersion: number): void {
  permissionCache.delete(cacheKeyForRole(roleId, permVersion));
  permissionCache.delete(cacheKeyForRole(roleId, permVersion - 1));
}

export function clearPermissionCache(): void {
  permissionCache.clear();
}

/**
 * Computes effective permissions: ALLOW (+ deps) minus DENY. Wildcard grants all catalog keys.
 */
export function computeEffectivePermissions(
  rows: { key: string; effect: PermissionEffect }[],
): Set<string> {
  const allow = new Set<string>();
  const deny = new Set<string>();

  for (const row of rows) {
    if (row.key === WILDCARD_PERMISSION) {
      if (row.effect === "ALLOW") {
        for (const k of CATALOG_KEYS) allow.add(k);
        allow.add(WILDCARD_PERMISSION);
      } else {
        deny.add(WILDCARD_PERMISSION);
      }
      continue;
    }
    if (row.effect === "DENY") deny.add(row.key);
    else allow.add(row.key);
  }

  const withDeps = resolvePermissionClosure(allow);
  for (const d of deny) withDeps.delete(d);
  if (deny.has(WILDCARD_PERMISSION)) {
    return new Set();
  }
  return withDeps;
}

export async function getRoleWithVersion(roleId: string) {
  return prisma.rbacRole.findFirst({
    where: { id: roleId, isDeleted: false },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      isDeleted: true,
      permVersion: true,
      isSystem: true,
    },
  });
}

export async function assertRoleAssignable(roleId: string): Promise<void> {
  const role = await getRoleWithVersion(roleId);
  if (!role) {
    throw new AppError("NOT_FOUND", "Role not found", 404);
  }
  if (!role.isActive) {
    throw new AppError("FORBIDDEN", "Role is disabled", 403);
  }
}

/**
 * Loads effective permission keys for a role (cached by roleId:permVersion).
 */
export async function getEffectivePermissions(roleId: string): Promise<Set<string>> {
  const role = await getRoleWithVersion(roleId);
  if (!role) {
    return new Set();
  }

  const ck = cacheKeyForRole(roleId, role.permVersion);
  const cached = permissionCache.get(ck);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { effect: true, permission: { select: { key: true } } },
  });

  const mapped = rows.map((r) => ({ key: r.permission.key, effect: r.effect }));
  const effective = computeEffectivePermissions(mapped);

  permissionCache.set(ck, {
    permissions: effective,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return effective;
}

export function hasPermissionInSet(perms: Set<string>, key: string): boolean {
  return perms.has(WILDCARD_PERMISSION) || perms.has(key);
}

export async function hasPermission(roleId: string, key: string): Promise<boolean> {
  const perms = await getEffectivePermissions(roleId);
  return hasPermissionInSet(perms, key);
}

const POLICY_SCOPE_KEYS = ["policy:scope_all", "policy:scope_village", "policy:scope_own"] as const;
const DASHBOARD_SCOPE_KEYS = ["dashboard:scope_all", "dashboard:scope_village"] as const;
const MIS_SCOPE_KEYS = ["mis:scope_all", "mis:scope_village"] as const;
const CLAIM_SCOPE_KEYS = ["claim:scope_all", "claim:scope_village"] as const;

function assertAtMostOne(selected: string[], allowed: readonly string[], label: string): void {
  const hits = selected.filter((k) => (allowed as readonly string[]).includes(k));
  if (hits.length > 1) {
    throw new AppError("VALIDATION_ERROR", `Only one ${label} scope permission allowed`, 400);
  }
}

/**
 * Validates scope permission exclusivity on role save.
 */
export function assertValidScopeSet(keys: Iterable<string>): void {
  const list = [...keys];
  assertAtMostOne(list, POLICY_SCOPE_KEYS, "policy");
  assertAtMostOne(list, DASHBOARD_SCOPE_KEYS, "dashboard");
  assertAtMostOne(list, MIS_SCOPE_KEYS, "MIS");
  assertAtMostOne(list, CLAIM_SCOPE_KEYS, "claim");

  const set = new Set(list);
  const hasWildcard = set.has(WILDCARD_PERMISSION);
  const hasPolicyAccess = ["policy:read", "policy:create", "policy:update", "policy:delete"].some(
    (k) => set.has(k),
  );
  const hasPolicyScope = POLICY_SCOPE_KEYS.some((k) => set.has(k));
  if (!hasWildcard && hasPolicyAccess && !hasPolicyScope) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Policy access requires a scope: policy:scope_own, policy:scope_village, or policy:scope_all",
      400,
    );
  }
}

export async function bumpRtvForUsersWithRole(
  tx: Pick<typeof prisma, "user">,
  roleId: string,
): Promise<void> {
  await tx.user.updateMany({
    where: { roleId },
    data: { refreshTokenVersion: { increment: 1 } },
  });
}
