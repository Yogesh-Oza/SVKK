import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { AppError } from "../errors/app-error.js";

/** Minimal permission map — extend with seed RolePermission parity. */
const ALLOWED: Record<string, readonly UserRole[]> = {
  "policy:create": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
  "policy:read": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
  "policy:update": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "policy:delete": ["SUPER_ADMIN", "ADMIN"],
  "calculation:live": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
  "admin:charts": ["SUPER_ADMIN", "ADMIN"],
  "admin:policyTypes": ["SUPER_ADMIN", "ADMIN"],
  "upload:csv": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "logs:read": ["SUPER_ADMIN", "ADMIN"],
  "mis:read": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "claim:create": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
  "claim:read": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
  "claim:update": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "claim:delete": ["SUPER_ADMIN", "ADMIN"],
  "receipt:create": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
};

export function requirePermission(key: keyof typeof ALLOWED) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.userRole;
    if (!role) {
      return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
    }
    const allowed = ALLOWED[key];
    if (!allowed?.includes(role)) {
      return next(new AppError("FORBIDDEN", "Insufficient permissions", 403));
    }
    next();
  };
}
