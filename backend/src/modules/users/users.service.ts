import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
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
  role: UserRole;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("CONFLICT", "Email is already in use", 409);
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: {
      email,
      name: input.name,
      passwordHash,
      role: input.role,
    },
    select: USER_SELECT,
  });
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
  },
) {
  const u = await prisma.user.findUnique({ where: { id } });
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

  const data: {
    name?: string;
    email?: string;
    role?: UserRole;
    passwordHash?: string;
    refreshTokenVersion?: { increment: number };
  } = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }
  if (input.email !== undefined) {
    data.email = input.email.toLowerCase();
  }
  if (input.role !== undefined) {
    data.role = input.role;
  }
  if (input.password !== undefined && input.password.length >= 8) {
    data.passwordHash = await bcrypt.hash(input.password, 10);
    data.refreshTokenVersion = { increment: 1 };
  }

  if (Object.keys(data).length === 0) {
    return prisma.user.findUniqueOrThrow({
      where: { id },
      select: USER_SELECT,
    });
  }

  return prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });
}

/**
 * @throws AppError if actor cannot delete target (self-delete, last super admin) or user missing
 */
export async function assertCanDeleteUser(actorId: string, targetId: string): Promise<void> {
  if (actorId === targetId) {
    throw new AppError("FORBIDDEN", "Cannot delete your own account", 403);
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }
  if (target.role === "SUPER_ADMIN") {
    const count = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
    if (count <= 1) {
      throw new AppError("FORBIDDEN", "Cannot delete the last super admin", 403);
    }
  }
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}
