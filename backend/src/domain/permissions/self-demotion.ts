import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import { getEffectivePermissions, hasPermissionInSet } from "../../services/rbac.service.js";

const CRITICAL_PERMISSIONS = ["roles:manage", "users:manage"] as const;

/**
 * Prevents an actor from removing their own last critical privilege or locking out all admins.
 */
export async function assertSafeUserRoleChange(
  actorId: string,
  targetUserId: string,
  newRoleId: string,
): Promise<void> {
  if (actorId !== targetUserId) {
    return;
  }

  const newPerms = await getEffectivePermissions(newRoleId);
  for (const key of CRITICAL_PERMISSIONS) {
    if (!hasPermissionInSet(newPerms, key)) {
      throw new AppError(
        "FORBIDDEN",
        "You cannot remove your own administrative permissions",
        403,
      );
    }
  }
}

/**
 * Ensures at least one other user retains roles:manage when actor demotes self.
 */
export async function assertAtLeastOneOtherRolesManager(
  actorId: string,
  targetUserId: string,
  newRoleId: string,
): Promise<void> {
  const newPerms = await getEffectivePermissions(newRoleId);
  if (hasPermissionInSet(newPerms, "roles:manage")) {
    return;
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { roleId: true },
  });
  if (!actor) return;

  const actorPerms = await getEffectivePermissions(actor.roleId);
  if (!hasPermissionInSet(actorPerms, "roles:manage")) {
    return;
  }

  if (actorId !== targetUserId) {
    return;
  }

  const others = await prisma.user.findMany({
    where: { id: { not: actorId } },
    select: { id: true, roleId: true },
  });

  for (const u of others) {
    const p = await getEffectivePermissions(u.roleId);
    if (hasPermissionInSet(p, "roles:manage")) {
      return;
    }
  }

  throw new AppError(
    "FORBIDDEN",
    "Cannot remove roles:manage from the last role manager in the system",
    403,
  );
}
