import type { Request, Response, NextFunction } from "express";
import type { Env } from "../config/env.js";
import { verifyAccessToken } from "../modules/auth/auth.service.js";
import { AppError } from "../errors/app-error.js";

export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new AppError("UNAUTHORIZED", "Missing bearer token", 401);
      }
      const token = header.slice("Bearer ".length);
      const payload = verifyAccessToken(token, env);
      req.userId = payload.sub;
      req.userRole = payload.role;
      next();
    } catch (e) {
      next(e);
    }
  };
}
