import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/app-error.js";
import type { Env } from "../../config/env.js";

export interface TokenPayload {
  sub: string;
  role: UserRole;
  rtv: number;
}

export async function verifyCredentials(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }
  return user;
}

export function signAccessToken(user: User, env: Env): string {
  const opts: SignOptions = { expiresIn: env.ACCESS_TOKEN_EXPIRES as SignOptions["expiresIn"] };
  return jwt.sign(
    { sub: user.id, role: user.role, rtv: user.refreshTokenVersion },
    env.ACCESS_TOKEN_SECRET,
    opts,
  );
}

export function signRefreshToken(user: User, env: Env): string {
  const opts: SignOptions = { expiresIn: env.REFRESH_TOKEN_EXPIRES as SignOptions["expiresIn"] };
  return jwt.sign(
    { sub: user.id, role: user.role, rtv: user.refreshTokenVersion },
    env.REFRESH_TOKEN_SECRET,
    opts,
  );
}

export function verifyAccessToken(token: string, env: Env): TokenPayload {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
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
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.refreshTokenVersion !== rtv) {
    throw new AppError("TOKEN_REVOKED", "Session revoked", 401);
  }
  return user;
}

export async function revokeAllRefreshTokens(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenVersion: { increment: 1 } },
  });
}
