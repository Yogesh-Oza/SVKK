import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/app-error.js";
import type { PermissionKey } from "../domain/permissions/catalog.js";
import { hasPermissionInSet, getEffectivePermissions } from "../services/rbac.service.js";

/**
 * Route-level permission guard. Requires `req.roleId` from auth middleware.
 */
export function requirePermission(key: PermissionKey | string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const roleId = req.roleId;
      if (!roleId) {
        return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
      }

      const perms =
        req.permissions ?? (await getEffectivePermissions(roleId));
      req.permissions = perms;

      if (!hasPermissionInSet(perms, key)) {
        return next(new AppError("FORBIDDEN", "Insufficient permissions", 403));
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Pass if the role has any of the listed permissions (OR). */
export function requireAnyPermission(keys: readonly string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const roleId = req.roleId;
      if (!roleId) {
        return next(new AppError("UNAUTHORIZED", "Not authenticated", 401));
      }

      const perms =
        req.permissions ?? (await getEffectivePermissions(roleId));
      req.permissions = perms;

      if (!keys.some((k) => hasPermissionInSet(perms, k))) {
        return next(new AppError("FORBIDDEN", "Insufficient permissions", 403));
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** @internal For unit tests — checks permission against a preloaded set */
export function isRoleAllowed(key: string, perms: Set<string>): boolean {
  return hasPermissionInSet(perms, key);
}
