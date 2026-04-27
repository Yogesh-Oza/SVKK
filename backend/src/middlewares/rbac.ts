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
  "upload:csv": ["SUPER_ADMIN", "ADMIN"],
  /** Policy document upload to shared Google Drive folder (service account). */
  "upload:google-drive": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "USER"],
  "logs:read": ["SUPER_ADMIN", "ADMIN"],
  "mis:read": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "claim:create": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "claim:read": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "claim:update": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  "claim:delete": ["SUPER_ADMIN", "ADMIN"],
  /** Data-entry USER: no receipts per product spec. */
  "receipt:create": ["SUPER_ADMIN", "ADMIN", "SUPERVISOR"],
  /** User CRUD (list, create, update, delete) — super admin only per product spec. */
  "users:manage": ["SUPER_ADMIN"],
};

/** @internal Exported for unit tests of the permission matrix. */
export function isRoleAllowed(
  key: keyof typeof ALLOWED,
  role: UserRole,
): boolean {
  return Boolean(ALLOWED[key]?.includes(role));
}

export function requirePermission(key: keyof typeof ALLOWED) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.userRole;
    if (!role) {
      return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
    }
    if (!isRoleAllowed(key, role)) {
      return next(new AppError("FORBIDDEN", "Insufficient permissions", 403));
    }
    next();
  };
}
