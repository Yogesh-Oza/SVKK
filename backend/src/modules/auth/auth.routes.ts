import { Router } from "express";
import cookieParser from "cookie-parser";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { AppError } from "../../errors/app-error.js";
import {
  assertRefreshVersion,
  revokeAllRefreshTokens,
  signAccessToken,
  signRefreshToken,
  updateMyProfile,
  verifyCredentials,
  verifyRefreshToken,
} from "./auth.service.js";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";
import {
  getRefreshTokenFromCookies,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
} from "./auth.cookies.js";
import { authRateLimit } from "../../middlewares/rate-limit.js";

function serializeUser(
  user: {
    id: string;
    email: string;
    name: string;
    roleId: string | null;
    rbacRole: { id: string; name: string; slug: string; isActive: boolean } | null;
  },
  permissions: string[],
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: user.roleId,
    roleName: user.rbacRole?.name ?? "",
    roleSlug: user.rbacRole?.slug ?? "",
    roleIsActive: user.rbacRole?.isActive ?? false,
    permissions,
  };
}

export function createAuthRouter(env: Env) {
  const r = Router();

  r.get("/me", requireAuth(env), async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          email: true,
          name: true,
          roleId: true,
          rbacRole: { select: { id: true, name: true, slug: true, isActive: true } },
        },
      });
      if (!user) {
        return next(new AppError("NOT_FOUND", "User not found", 404));
      }
      res.json(serializeUser(user, [...(req.permissions ?? [])]));
    } catch (e) {
      next(e);
    }
  });

  r.patch("/me", requireAuth(env), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(2).max(100).optional(),
          email: z.string().email().optional(),
          password: z.string().min(8).optional().or(z.literal("")),
        })
        .parse(req.body);

      const password =
        body.password && body.password.length > 0 ? body.password : undefined;
      const user = await updateMyProfile(req.userId!, {
        name: body.name,
        email: body.email,
        password,
      });
      const full = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          roleId: true,
          rbacRole: { select: { id: true, name: true, slug: true, isActive: true } },
        },
      });
      res.json({
        user: serializeUser(full, [...(req.permissions ?? [])]),
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/login", authRateLimit, async (req, res, next) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(1),
        })
        .parse(req.body);

      const user = await verifyCredentials(body.email, body.password);
      const accessToken = await signAccessToken(user, env);
      const refreshToken = await signRefreshToken(user, env);

      setAccessCookie(res, env, accessToken);
      setRefreshCookie(res, env, refreshToken);

      await prisma.userSession.create({
        data: {
          userId: user.id,
          deviceLabel: req.headers["user-agent"]?.slice(0, 200),
          ipHash: req.ip ? Buffer.from(req.ip).toString("base64").slice(0, 64) : null,
        },
      });

      const full = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          roleId: true,
          rbacRole: { select: { id: true, name: true, slug: true, isActive: true } },
        },
      });

      const { getEffectivePermissions } = await import("../../services/rbac.service.js");
      const permissions = [...(await getEffectivePermissions(user.roleId))];

      req.log.info({ userId: user.id }, "login ok");
      res.json({
        user: serializeUser(full, permissions),
        accessToken,
        refreshToken,
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/refresh", async (req, res, next) => {
    try {
      const bodyRt = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
      const token = getRefreshTokenFromCookies(req) || (bodyRt.success ? bodyRt.data.refreshToken : undefined);
      if (!token) {
        return res.status(401).json({
          code: "NO_REFRESH",
          message: "Refresh cookie or body token missing",
          traceId: req.traceId,
        });
      }
      const payload = verifyRefreshToken(token, env);
      const user = await assertRefreshVersion(payload.sub, payload.rtv);
      const accessToken = await signAccessToken(user, env);
      const newRefresh = await signRefreshToken(user, env);
      setAccessCookie(res, env, accessToken);
      setRefreshCookie(res, env, newRefresh);
      req.log.info({ userId: user.id }, "token refreshed");
      res.json({ accessToken, refreshToken: newRefresh });
    } catch (e) {
      next(e);
    }
  });

  r.post("/logout", async (req, res, next) => {
    try {
      const bodyRt = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body);
      const token =
        getRefreshTokenFromCookies(req) || (bodyRt.success ? bodyRt.data.refreshToken : undefined);
      if (token) {
        try {
          const payload = verifyRefreshToken(token, env);
          await revokeAllRefreshTokens(payload.sub);
        } catch {
          /* ignore */
        }
      }
      clearAuthCookies(res, env);
      req.log.info("logout");
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export {
  getRefreshTokenFromCookies,
  getAccessTokenFromCookies,
  REFRESH_COOKIE,
  ACCESS_TOKEN_COOKIE,
} from "./auth.cookies.js";
export const authCookieParser = cookieParser();
