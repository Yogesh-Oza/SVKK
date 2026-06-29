import type { PrismaClient } from "@prisma/client";
import { bumpRtvForUsersWithRole } from "../services/rbac.service.js";

const DEPRECATED_KEYS = ["mis:read", "mis:scope_all", "mis:scope_village"] as const;

const KEY_MAP: Record<string, readonly string[]> = {
  "mis:read": ["mis:policy:read", "mis:claim:read"],
  "mis:scope_all": ["mis:policy:scope_all", "mis:claim:scope_all"],
  "mis:scope_village": ["mis:policy:scope_village", "mis:claim:scope_village"],
};

async function bumpRoles(client: PrismaClient, roleIds: Iterable<string>): Promise<void> {
  for (const roleId of roleIds) {
    await client.$transaction(async (tx) => {
      await tx.rbacRole.update({
        where: { id: roleId },
        data: { permVersion: { increment: 1 } },
      });
      await bumpRtvForUsersWithRole(tx, roleId);
    });
  }
}

/** Idempotent migration from legacy mis:* keys to split MIS + Future permissions. */
async function migrateLegacyMisPermissions(client: PrismaClient): Promise<void> {
  const deprecated = await client.permission.findMany({
    where: { key: { in: [...DEPRECATED_KEYS] } },
    select: { id: true, key: true },
  });
  if (deprecated.length === 0) {
    return;
  }

  const deprecatedByKey = new Map(deprecated.map((p) => [p.key, p.id]));
  const newKeys = [...new Set(Object.values(KEY_MAP).flat())];
  const newPerms = await client.permission.findMany({
    where: { key: { in: newKeys } },
    select: { id: true, key: true },
  });
  const newIdByKey = new Map(newPerms.map((p) => [p.key, p.id]));

  const roleIdsTouched = new Set<string>();

  for (const [oldKey, newKeyList] of Object.entries(KEY_MAP)) {
    const oldPermId = deprecatedByKey.get(oldKey);
    if (!oldPermId) continue;

    const allowRows = await client.rolePermission.findMany({
      where: { permissionId: oldPermId, effect: "ALLOW" },
      select: { roleId: true },
    });

    for (const { roleId } of allowRows) {
      roleIdsTouched.add(roleId);
      for (const newKey of newKeyList) {
        const newPermId = newIdByKey.get(newKey);
        if (!newPermId) continue;
        await client.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: newPermId } },
          update: { effect: "ALLOW" },
          create: { roleId, permissionId: newPermId, effect: "ALLOW" },
        });
      }
    }

    await client.rolePermission.deleteMany({ where: { permissionId: oldPermId } });
  }

  await client.permission.deleteMany({ where: { key: { in: [...DEPRECATED_KEYS] } } });

  await bumpRoles(client, roleIdsTouched);
}

/**
 * Grant policy:commission to roles that can update policies (backward compatible).
 * Idempotent — safe to run after upsertPermissionCatalog.
 */
export async function backfillPolicyCommissionPermission(client: PrismaClient): Promise<void> {
  const [updatePerm, commissionPerm] = await Promise.all([
    client.permission.findUnique({ where: { key: "policy:update" }, select: { id: true } }),
    client.permission.findUnique({ where: { key: "policy:commission" }, select: { id: true } }),
  ]);
  if (!updatePerm || !commissionPerm) {
    return;
  }

  const rolesWithUpdate = await client.rolePermission.findMany({
    where: { permissionId: updatePerm.id, effect: "ALLOW" },
    select: { roleId: true },
  });

  const roleIdsTouched = new Set<string>();
  for (const { roleId } of rolesWithUpdate) {
    const existing = await client.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId: commissionPerm.id } },
      select: { effect: true },
    });
    if (existing?.effect === "ALLOW") {
      continue;
    }

    await client.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: commissionPerm.id } },
      update: { effect: "ALLOW" },
      create: { roleId, permissionId: commissionPerm.id, effect: "ALLOW" },
    });
    roleIdsTouched.add(roleId);
  }

  await bumpRoles(client, roleIdsTouched);
}

/** Run all idempotent RBAC data migrations (MIS split + commission backfill). */
export async function migrateRbacV2Permissions(client: PrismaClient): Promise<void> {
  await migrateLegacyMisPermissions(client);
  await backfillPolicyCommissionPermission(client);
}
