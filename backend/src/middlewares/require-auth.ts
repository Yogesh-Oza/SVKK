import type { Request, Response, NextFunction } from "express";
import type { Env } from "../config/env.js";
import { verifyAccessToken } from "../modules/auth/auth.service.js";
import { AppError } from "../errors/app-error.js";
import { getAccessTokenFromCookies } from "../modules/auth/auth.cookies.js";

export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction) => {
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
      req.userRole = payload.role;
      next();
    } catch (e) {
      next(e);
    }
  };
}
