import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import { assertRoleAssignable } from "../../services/rbac.service.js";
import {
  assertAtLeastOneOtherRolesManager,
  assertSafeUserRoleChange,
} from "../../domain/permissions/self-demotion.js";
import { logRbacAudit } from "../../services/rbac-audit.service.js";
import { LEGACY_ROLE_SLUGS } from "../../lib/permission-seed.js";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  roleId: true,
  rbacRole: { select: { id: true, name: true, slug: true, isActive: true } },
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  roleId: string;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("CONFLICT", "Email is already in use", 409);
  }
  await assertRoleAssignable(input.roleId);
  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: {
      email,
      name: input.name,
      passwordHash,
      roleId: input.roleId,
    },
    select: USER_SELECT,
  });
}

export async function updateUser(
  actorId: string,
  id: string,
  input: {
    name?: string;
    email?: string;
    password?: string;
    roleId?: string;
  },
) {
  const u = await prisma.user.findUnique({
    where: { id },
    include: { rbacRole: { select: { slug: true } } },
  });
  if (!u) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  if (input.email && input.email.toLowerCase() !== u.email) {
    const ex = await prisma.user.findFirst({
      where: { email: input.email.toLowerCase() },
    });
    if (ex) {
      throw new AppError("CONFLICT", "Email is already in use", 409);
    }
  }

  if (input.roleId !== undefined) {
    await assertRoleAssignable(input.roleId);
    await assertSafeUserRoleChange(actorId, id, input.roleId);
    await assertAtLeastOneOtherRolesManager(actorId, id, input.roleId);
  }

  const data: {
    name?: string;
    email?: string;
    roleId?: string;
    passwordHash?: string;
    refreshTokenVersion?: { increment: number };
  } = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email.toLowerCase();
  if (input.roleId !== undefined) data.roleId = input.roleId;
  if (input.password !== undefined && input.password.length >= 8) {
    data.passwordHash = await bcrypt.hash(input.password, 10);
    data.refreshTokenVersion = { increment: 1 };
  }

  const roleChanging = input.roleId !== undefined && input.roleId !== u.roleId;
  if (roleChanging) {
    data.refreshTokenVersion = { increment: 1 };
  }

  if (Object.keys(data).length === 0) {
    return prisma.user.findUniqueOrThrow({ where: { id }, select: USER_SELECT });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });

  if (roleChanging) {
    await logRbacAudit({
      action: "USER_ROLE_CHANGED",
      actorId,
      targetUserId: id,
      oldSnapshot: { roleId: u.roleId, roleSlug: u.rbacRole?.slug },
      newSnapshot: { roleId: input.roleId },
    });
  }

  return updated;
}

export async function assertCanDeleteUser(actorId: string, targetId: string): Promise<void> {
  if (actorId === targetId) {
    throw new AppError("FORBIDDEN", "Cannot delete your own account", 403);
  }
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { rbacRole: { select: { slug: true } } },
  });
  if (!target) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }
  if (target.rbacRole?.slug === LEGACY_ROLE_SLUGS.SUPER_ADMIN) {
    const superRole = await prisma.rbacRole.findUnique({
      where: { slug: LEGACY_ROLE_SLUGS.SUPER_ADMIN },
    });
    if (!superRole) return;
    const count = await prisma.user.count({ where: { roleId: superRole.id } });
    if (count <= 1) {
      throw new AppError("FORBIDDEN", "Cannot delete the last super admin", 403);
    }
  }
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}
