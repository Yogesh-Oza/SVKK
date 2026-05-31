import type { PermissionEffect, PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG, WILDCARD_PERMISSION } from "../domain/permissions/catalog.js";
import { resolvePermissionClosure } from "../domain/permissions/dependencies.js";

/** Legacy enum → system role slug */
export const LEGACY_ROLE_SLUGS = {
  SUPER_ADMIN: "super-admin",
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  USER: "user",
} as const;

/** Maps old rbac.ts ALLOWED matrix to permission keys per legacy role */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  keyof typeof LEGACY_ROLE_SLUGS,
  { allow: string[]; deny?: string[] }
> = {
  SUPER_ADMIN: { allow: [WILDCARD_PERMISSION] },
  ADMIN: {
    allow: [
      "dashboard:read",
      "policy:create",
      "policy:read",
      "policy:update",
      "policy:delete",
      "policy:scope_all",
      "calculation:live",
      "admin:charts",
      "admin:policyTypes",
      "upload:csv",
      "upload:google-drive",
      "upload:one-drive",
      "logs:read",
      "mis:read",
      "mis:scope_all",
      "claim:create",
      "claim:read",
      "claim:update",
      "claim:delete",
      "claim:import",
      "claim:scope_all",
      "receipt:create",
      "users:manage",
      "roles:manage",
      "admin:settings",
      "notifications:read",
    ],
  },
  SUPERVISOR: {
    allow: [
      "dashboard:read",
      "policy:create",
      "policy:read",
      "policy:update",
      "policy:scope_village",
      "notifications:read",
      "calculation:live",
      "upload:google-drive",
      "upload:one-drive",
      "mis:read",
      "mis:scope_village",
      "claim:create",
      "claim:read",
      "claim:update",
      "claim:scope_village",
      "receipt:create",
      "notifications:read",
    ],
  },
  USER: {
    allow: [
      "dashboard:read",
      "policy:create",
      "policy:read",
      "policy:scope_own",
      "notifications:read",
      "calculation:live",
      "upload:google-drive",
      "upload:one-drive",
    ],
  },
};

export async function upsertPermissionCatalog(prisma: PrismaClient): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();
  for (const entry of PERMISSION_CATALOG) {
    const row = await prisma.permission.upsert({
      where: { key: entry.key },
      update: {
        label: entry.label,
        group: entry.group,
        groupOrder: entry.groupOrder,
        description: entry.description,
        isScope: entry.isScope ?? false,
        sortOrder: entry.sortOrder ?? 0,
      },
      create: {
        key: entry.key,
        label: entry.label,
        group: entry.group,
        groupOrder: entry.groupOrder,
        description: entry.description,
        isScope: entry.isScope ?? false,
        sortOrder: entry.sortOrder ?? 0,
      },
    });
    keyToId.set(entry.key, row.id);
  }
  const wc = await prisma.permission.upsert({
    where: { key: WILDCARD_PERMISSION },
    update: { label: "All permissions", group: "System", groupOrder: 0 },
    create: {
      key: WILDCARD_PERMISSION,
      label: "All permissions",
      group: "System",
      groupOrder: 0,
      isScope: false,
    },
  });
  keyToId.set(WILDCARD_PERMISSION, wc.id);
  return keyToId;
}

export async function upsertSystemRoles(
  prisma: PrismaClient,
  keyToId: Map<string, string>,
): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();
  const defs: { slug: string; name: string; legacy: keyof typeof LEGACY_ROLE_SLUGS }[] = [
    { slug: LEGACY_ROLE_SLUGS.SUPER_ADMIN, name: "Super Admin", legacy: "SUPER_ADMIN" },
    { slug: LEGACY_ROLE_SLUGS.ADMIN, name: "Admin", legacy: "ADMIN" },
    { slug: LEGACY_ROLE_SLUGS.SUPERVISOR, name: "Supervisor", legacy: "SUPERVISOR" },
    { slug: LEGACY_ROLE_SLUGS.USER, name: "User", legacy: "USER" },
  ];

  for (const d of defs) {
    const role = await prisma.rbacRole.upsert({
      where: { slug: d.slug },
      update: { name: d.name, isSystem: true, isActive: true, isDeleted: false },
      create: {
        name: d.name,
        slug: d.slug,
        isSystem: true,
        description: `System role (${d.legacy})`,
      },
    });
    slugToId.set(d.slug, role.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const cfg = DEFAULT_ROLE_PERMISSIONS[d.legacy];
    const allowResolved = resolvePermissionClosure(cfg.allow);
    const denySet = new Set(cfg.deny ?? []);

    const assignments: { permissionId: string; effect: PermissionEffect }[] = [];
    for (const key of allowResolved) {
      if (denySet.has(key)) continue;
      const pid = keyToId.get(key);
      if (pid) assignments.push({ permissionId: pid, effect: "ALLOW" });
    }
    for (const key of denySet) {
      const pid = keyToId.get(key);
      if (pid) assignments.push({ permissionId: pid, effect: "DENY" });
    }

    if (assignments.length > 0) {
      await prisma.rolePermission.createMany({
        data: assignments.map((a) => ({ roleId: role.id, ...a })),
      });
    }

    await prisma.rbacRole.update({
      where: { id: role.id },
      data: { permVersion: { increment: 1 } },
    });
  }

  return slugToId;
}
