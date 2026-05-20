import type { PermissionEffect, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import { WILDCARD_PERMISSION } from "../../domain/permissions/catalog.js";
import { resolvePermissionClosure } from "../../domain/permissions/dependencies.js";
import { isProtectedRoleSlug } from "../../domain/permissions/protected-roles.js";
import {
  assertValidScopeSet,
  bumpRtvForUsersWithRole,
  getEffectivePermissions,
  invalidateRolePermissionCache,
} from "../../services/rbac.service.js";
import { logRbacAudit } from "../../services/rbac-audit.service.js";
import { assertRoleGeoRequired } from "../../services/mis-scope.service.js";
import {
  loadRoleGeoValues,
  replaceRoleGeo,
  validateGeoOptionIds,
} from "../../services/role-geo.service.js";
import { roleGeoPayload } from "./rbac-geo.js";

/** Remote DB + large permission sets can exceed Prisma's default 5s interactive tx limit. */
const RBAC_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

async function permissionIdsFromKeys(keys: string[]): Promise<Map<string, string>> {
  const resolved = resolvePermissionClosure(keys);
  assertValidScopeSet(resolved);

  const perms = await prisma.permission.findMany({
    where: { key: { in: [...resolved, WILDCARD_PERMISSION] } },
    select: { id: true, key: true },
  });
  const map = new Map(perms.map((p) => [p.key, p.id]));

  for (const k of resolved) {
    if (!map.has(k) && k !== WILDCARD_PERMISSION) {
      throw new AppError("VALIDATION_ERROR", `Unknown permission: ${k}`, 400);
    }
  }
  return map;
}

function assertProtectedRoleMutation(slug: string, action: string): void {
  if (isProtectedRoleSlug(slug)) {
    throw new AppError("FORBIDDEN", `Cannot ${action} protected system role`, 403);
  }
}

async function replaceRolePermissions(
  tx: Prisma.TransactionClient,
  roleId: string,
  assignments: { permissionId: string; effect: PermissionEffect }[],
): Promise<number> {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (assignments.length > 0) {
    await tx.rolePermission.createMany({
      data: assignments.map((a) => ({ roleId, ...a })),
    });
  }
  const updated = await tx.rbacRole.update({
    where: { id: roleId },
    data: { permVersion: { increment: 1 } },
    select: { permVersion: true },
  });
  await bumpRtvForUsersWithRole(tx, roleId);
  return updated.permVersion;
}

async function bumpRoleVersionAndRtv(tx: Prisma.TransactionClient, roleId: string): Promise<number> {
  const updated = await tx.rbacRole.update({
    where: { id: roleId },
    data: { permVersion: { increment: 1 } },
    select: { permVersion: true },
  });
  await bumpRtvForUsersWithRole(tx, roleId);
  return updated.permVersion;
}

function geoDiff(
  before: { villageOptionIds: string[]; areaOptionIds: string[] },
  after: { villageOptionIds: string[]; areaOptionIds: string[] },
) {
  const villagesAdded = after.villageOptionIds.filter((id) => !before.villageOptionIds.includes(id));
  const villagesRemoved = before.villageOptionIds.filter((id) => !after.villageOptionIds.includes(id));
  const areasAdded = after.areaOptionIds.filter((id) => !before.areaOptionIds.includes(id));
  const areasRemoved = before.areaOptionIds.filter((id) => !after.areaOptionIds.includes(id));
  return { villagesAdded, villagesRemoved, areasAdded, areasRemoved };
}

export async function listPermissionsGrouped() {
  const rows = await prisma.permission.findMany({
    where: { key: { not: WILDCARD_PERMISSION } },
    orderBy: [{ groupOrder: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
  });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = groups.get(r.group) ?? [];
    list.push(r);
    groups.set(r.group, list);
  }
  return [...groups.entries()].map(([group, permissions]) => ({
    group,
    groupOrder: permissions[0]?.groupOrder ?? 0,
    permissions,
  }));
}

export async function listRoles(includeDeleted = false) {
  return prisma.rbacRole.findMany({
    where: includeDeleted ? {} : { isDeleted: false },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true } },
      permissions: { include: { permission: { select: { key: true } } } },
    },
  });
}

export async function getRoleById(id: string) {
  const role = await prisma.rbacRole.findFirst({
    where: { id, isDeleted: false },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) {
    throw new AppError("NOT_FOUND", "Role not found", 404);
  }
  const geo = await roleGeoPayload(role.id);
  return { ...role, ...geo };
}

export async function createRole(
  actorId: string,
  input: {
    name: string;
    slug?: string;
    description?: string;
    permissionKeys: string[];
    villageOptionIds?: string[];
    areaOptionIds?: string[];
  },
) {
  const slug = input.slug?.trim() || slugify(input.name);
  if (!slug) {
    throw new AppError("VALIDATION_ERROR", "Invalid role slug", 400);
  }
  const existing = await prisma.rbacRole.findUnique({ where: { slug } });
  if (existing && !existing.isDeleted) {
    throw new AppError("CONFLICT", "Role slug already exists", 409);
  }

  const keyMap = await permissionIdsFromKeys(input.permissionKeys);
  const resolved = resolvePermissionClosure(input.permissionKeys);
  const geoIds = await validateGeoOptionIds(
    input.villageOptionIds ?? [],
    input.areaOptionIds ?? [],
  );
  assertRoleGeoRequired(resolved, geoIds.villageOptionIds, geoIds.areaOptionIds);
  const assignments = [...resolved].map((key) => ({
    permissionId: keyMap.get(key)!,
    effect: "ALLOW" as PermissionEffect,
  }));

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.rbacRole.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        isSystem: false,
      },
    });
    await replaceRolePermissions(tx, created.id, assignments);
    await replaceRoleGeo(tx, created.id, geoIds.villageOptionIds, geoIds.areaOptionIds);
    await logRbacAudit(
      {
        action: "ROLE_CREATED",
        actorId,
        targetRoleId: created.id,
        newSnapshot: {
          name: input.name,
          slug,
          permissionKeys: [...resolved],
          villageOptionIds: geoIds.villageOptionIds,
          areaOptionIds: geoIds.areaOptionIds,
        },
      },
      tx,
    );
    return created;
  }, RBAC_TX_OPTIONS);

  invalidateRolePermissionCache(role.id, role.permVersion);
  return getRoleById(role.id);
}

export async function updateRole(
  actorId: string,
  roleId: string,
  input: {
    name?: string;
    description?: string;
    permissionKeys?: string[];
    villageOptionIds?: string[];
    areaOptionIds?: string[];
    isActive?: boolean;
  },
) {
  const role = await prisma.rbacRole.findFirst({ where: { id: roleId, isDeleted: false } });
  if (!role) {
    throw new AppError("NOT_FOUND", "Role not found", 404);
  }

  if (input.isActive === false && isProtectedRoleSlug(role.slug)) {
    throw new AppError("FORBIDDEN", "Cannot disable protected system role", 403);
  }

  if (
    input.name !== undefined &&
    input.name !== role.name &&
    isProtectedRoleSlug(role.slug)
  ) {
    throw new AppError("FORBIDDEN", "Cannot rename protected system role", 403);
  }

  let permissionAssignments: { permissionId: string; effect: PermissionEffect }[] | undefined;
  let oldPermissionKeys: string[] | undefined;
  let newPermissionKeys: string[] | undefined;

  if (input.permissionKeys) {
    const resolved = resolvePermissionClosure(input.permissionKeys);
    if (isProtectedRoleSlug(role.slug)) {
      if (!resolved.has(WILDCARD_PERMISSION) && !resolved.has("roles:manage")) {
        throw new AppError("FORBIDDEN", "Cannot strip critical permissions from super-admin", 403);
      }
    }
    const keyMap = await permissionIdsFromKeys(input.permissionKeys);
    newPermissionKeys = [...resolved].sort();
    permissionAssignments = newPermissionKeys.map((key) => ({
      permissionId: keyMap.get(key)!,
      effect: "ALLOW" as PermissionEffect,
    }));
    oldPermissionKeys = [...(await getEffectivePermissions(roleId))].sort();
    const existingGeo = await loadRoleGeoValues(roleId);
    assertRoleGeoRequired(
      newPermissionKeys,
      existingGeo.villageOptionIds,
      existingGeo.areaOptionIds,
    );
  }

  let permVersion: number | undefined;
  const geoTouched =
    input.villageOptionIds !== undefined || input.areaOptionIds !== undefined;
  let geoAudit: ReturnType<typeof geoDiff> | null = null;
  let nextGeoIds: { villageOptionIds: string[]; areaOptionIds: string[] } | null = null;
  if (geoTouched) {
    const beforeGeo = await loadRoleGeoValues(roleId);
    nextGeoIds = await validateGeoOptionIds(
      input.villageOptionIds ?? beforeGeo.villageOptionIds,
      input.areaOptionIds ?? beforeGeo.areaOptionIds,
    );
    const effectiveKeys = input.permissionKeys
      ? [...resolvePermissionClosure(input.permissionKeys)]
      : [...(await getEffectivePermissions(roleId))];
    assertRoleGeoRequired(effectiveKeys, nextGeoIds.villageOptionIds, nextGeoIds.areaOptionIds);
    geoAudit = geoDiff(beforeGeo, nextGeoIds);
  }

  await prisma.$transaction(async (tx) => {
    if (input.name !== undefined || input.description !== undefined || input.isActive !== undefined) {
      await tx.rbacRole.update({
        where: { id: roleId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
    }

    if (permissionAssignments) {
      permVersion = await replaceRolePermissions(tx, roleId, permissionAssignments);
    }

    if (geoTouched && nextGeoIds) {
      await replaceRoleGeo(tx, roleId, nextGeoIds.villageOptionIds, nextGeoIds.areaOptionIds);
      if (!permissionAssignments) {
        permVersion = await bumpRoleVersionAndRtv(tx, roleId);
      }
    }

    if (input.isActive !== undefined) {
      await bumpRtvForUsersWithRole(tx, roleId);
      await logRbacAudit(
        {
          action: input.isActive ? "ROLE_ENABLED" : "ROLE_DISABLED",
          actorId,
          targetRoleId: roleId,
          oldSnapshot: { isActive: !input.isActive },
          newSnapshot: { isActive: input.isActive },
        },
        tx,
      );
    }
  }, RBAC_TX_OPTIONS);

  if (permVersion !== undefined) {
    invalidateRolePermissionCache(roleId, permVersion);
  }

  if (oldPermissionKeys && newPermissionKeys) {
    await logRbacAudit({
      action: "ROLE_UPDATED",
      actorId,
      targetRoleId: roleId,
      oldSnapshot: { permissions: oldPermissionKeys },
      newSnapshot: { permissions: newPermissionKeys },
    });
  }

  if (geoAudit) {
    await logRbacAudit({
      action: "ROLE_GEO_UPDATED",
      actorId,
      targetRoleId: roleId,
      oldSnapshot: {
        villagesRemoved: geoAudit.villagesRemoved,
        areasRemoved: geoAudit.areasRemoved,
      },
      newSnapshot: {
        villagesAdded: geoAudit.villagesAdded,
        areasAdded: geoAudit.areasAdded,
      },
    });
  }

  return getRoleById(roleId);
}

export async function cloneRole(actorId: string, sourceRoleId: string, name: string) {
  const source = await getRoleById(sourceRoleId);
  const keys = source.permissions
    .filter((p) => p.effect === "ALLOW")
    .map((p) => p.permission.key);
  const created = await createRole(actorId, {
    name,
    description: source.description ? `Cloned from ${source.name}` : undefined,
    permissionKeys: keys,
    villageOptionIds: source.villageOptionIds,
    areaOptionIds: source.areaOptionIds,
  });
  await logRbacAudit({
    action: "ROLE_CLONED",
    actorId,
    targetRoleId: created.id,
    newSnapshot: { clonedFrom: sourceRoleId, name },
  });
  return created;
}

export async function softDeleteRole(actorId: string, roleId: string) {
  const role = await prisma.rbacRole.findFirst({ where: { id: roleId, isDeleted: false } });
  if (!role) {
    throw new AppError("NOT_FOUND", "Role not found", 404);
  }
  assertProtectedRoleMutation(role.slug, "delete");
  if (role.isSystem) {
    throw new AppError("FORBIDDEN", "Cannot delete system role", 403);
  }

  const userCount = await prisma.user.count({ where: { roleId } });
  if (userCount > 0) {
    throw new AppError("CONFLICT", "Reassign users before deleting this role", 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.rbacRole.update({
      where: { id: roleId },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false, permVersion: { increment: 1 } },
    });
    await logRbacAudit(
      { action: "ROLE_SOFT_DELETED", actorId, targetRoleId: roleId, oldSnapshot: { slug: role.slug } },
      tx,
    );
  }, RBAC_TX_OPTIONS);
}

export async function getEffectivePermissionsForUser(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { roleId: true },
  });
  if (!user) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }
  return [...(await getEffectivePermissions(user.roleId))];
}
