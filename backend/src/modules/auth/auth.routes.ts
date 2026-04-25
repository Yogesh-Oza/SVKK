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
  REFRESH_COOKIE,
  ACCESS_TOKEN_COOKIE,
  setAccessCookie,
  setRefreshCookie,
  clearAuthCookies,
} from "./auth.cookies.js";

export function createAuthRouter(env: Env) {
  const r = Router();

  r.get("/me", requireAuth(env), async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, name: true, role: true },
      });
      if (!user) {
        return next(new AppError("NOT_FOUND", "User not found", 404));
      }
      res.json(user);
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
      const user = await updateMyProfile(req.userId, {
        name: body.name,
        email: body.email,
        password,
      });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/login", async (req, res, next) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(1),
        })
        .parse(req.body);

      const user = await verifyCredentials(body.email, body.password);
      const accessToken = signAccessToken(user, env);
      const refreshToken = signRefreshToken(user, env);

      setAccessCookie(res, env, accessToken);
      setRefreshCookie(res, env, refreshToken);

      await prisma.userSession.create({
        data: {
          userId: user.id,
          deviceLabel: req.headers["user-agent"]?.slice(0, 200),
          ipHash: req.ip ? Buffer.from(req.ip).toString("base64").slice(0, 64) : null,
        },
      });

      req.log.info({ userId: user.id }, "login ok");
      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/refresh", async (req, res, next) => {
    try {
      const token = req.cookies?.[REFRESH_COOKIE];
      if (!token) {
        return res.status(401).json({
          code: "NO_REFRESH",
          message: "Refresh cookie missing",
          traceId: req.traceId,
        });
      }
      const payload = verifyRefreshToken(token, env);
      const user = await assertRefreshVersion(payload.sub, payload.rtv);
      const accessToken = signAccessToken(user, env);
      const newRefresh = signRefreshToken(user, env);
      setAccessCookie(res, env, accessToken);
      setRefreshCookie(res, env, newRefresh);
      req.log.info({ userId: user.id }, "token refreshed");
      // Body token helps SPA retry the failed request in the same tick; httpOnly is source of truth.
      res.json({ accessToken });
    } catch (e) {
      next(e);
    }
  });

  r.post("/logout", async (req, res, next) => {
    try {
      const token = req.cookies?.[REFRESH_COOKIE];
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

export { REFRESH_COOKIE, ACCESS_TOKEN_COOKIE };
export const authCookieParser = cookieParser();
