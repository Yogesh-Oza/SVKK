import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import type { Env } from "../../config/env.js";
import { getRoleWithVersion } from "../../services/rbac.service.js";

export interface TokenPayload {
  sub: string;
  roleId: string;
  rtv: number;
  pv: number;
}

export async function verifyCredentials(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { rbacRole: { select: { isActive: true, isDeleted: true } } },
  });
  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }
  if (!user.rbacRole || user.rbacRole.isDeleted || !user.rbacRole.isActive) {
    throw new AppError("FORBIDDEN", "Account role is disabled", 403);
  }
  return user;
}

async function tokenPayloadForUser(user: User): Promise<TokenPayload> {
  const role = await getRoleWithVersion(user.roleId);
  if (!role || !role.isActive) {
    throw new AppError("FORBIDDEN", "Role is disabled", 403);
  }
  return {
    sub: user.id,
    roleId: user.roleId,
    rtv: user.refreshTokenVersion,
    pv: role.permVersion,
  };
}

export async function signAccessToken(user: User, env: Env): Promise<string> {
  const payload = await tokenPayloadForUser(user);
  const opts: SignOptions = { expiresIn: env.ACCESS_TOKEN_EXPIRES as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, opts);
}

export async function signRefreshToken(user: User, env: Env): Promise<string> {
  const payload = await tokenPayloadForUser(user);
  const opts: SignOptions = { expiresIn: env.REFRESH_TOKEN_EXPIRES as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, opts);
}

export function verifyAccessToken(token: string, env: Env): TokenPayload {
  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
    if (!payload.sub || !payload.roleId) {
      throw new Error("invalid payload");
    }
    return payload;
  } catch {
    throw new AppError("INVALID_TOKEN", "Access token invalid or expired", 401);
  }
}

export function verifyRefreshToken(token: string, env: Env): TokenPayload {
  try {
    return jwt.verify(token, env.REFRESH_TOKEN_SECRET) as TokenPayload;
  } catch {
    throw new AppError("INVALID_TOKEN", "Refresh token invalid or expired", 401);
  }
}

export async function assertRefreshVersion(userId: string, rtv: number): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.refreshTokenVersion !== rtv) {
    throw new AppError("INVALID_TOKEN", "Session revoked", 401);
  }
  const role = await getRoleWithVersion(user.roleId);
  if (!role || role.isDeleted || !role.isActive) {
    throw new AppError("FORBIDDEN", "Role is disabled", 403);
  }
  return user;
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenVersion: { increment: 1 } },
  });
}

export async function updateMyProfile(
  userId: string,
  input: { name?: string; email?: string; password?: string },
): Promise<User> {
  const data: { name?: string; email?: string; passwordHash?: string; refreshTokenVersion?: { increment: number } } =
    {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = input.email.toLowerCase();
  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, 10);
    data.refreshTokenVersion = { increment: 1 };
  }
  return prisma.user.update({ where: { id: userId }, data });
}
