import type { Request, Response, NextFunction } from "express";
import type { Env } from "../config/env.js";
import { verifyAccessToken } from "../modules/auth/auth.service.js";
import { AppError } from "../errors/app-error.js";
import { getAccessTokenFromCookies } from "../modules/auth/auth.cookies.js";
import { prisma } from "../lib/prisma.js";
import {
  getEffectivePermissions,
  getRoleWithVersion,
} from "../services/rbac.service.js";

export function requireAuth(env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
      const fromCookie = getAccessTokenFromCookies(req);
      const token = bearer ?? fromCookie;
      if (!token) {
        throw new AppError("UNAUTHORIZED", "Missing access token (cookie or bearer)", 401);
      }
      const payload = verifyAccessToken(token, env);
      req.userId = payload.sub;
      req.roleId = payload.roleId;

      const role = await getRoleWithVersion(payload.roleId);
      if (!role) {
        throw new AppError("FORBIDDEN", "Role not found or removed", 403);
      }
      if (!role.isActive) {
        throw new AppError("FORBIDDEN", "Role is disabled", 403);
      }
      if (payload.pv !== role.permVersion) {
        throw new AppError("FORBIDDEN", "Permissions changed — sign in again", 403);
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { refreshTokenVersion: true, roleId: true },
      });
      if (!user || user.roleId !== payload.roleId) {
        throw new AppError("UNAUTHORIZED", "Session invalid", 401);
      }

      req.roleSlug = role.slug;
      req.roleName = role.name;
      req.permissions = await getEffectivePermissions(payload.roleId);
      next();
    } catch (e) {
      next(e);
    }
  };
}
