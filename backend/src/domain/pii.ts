import type { UserRole } from "@prisma/client";

const ROLES_PII: UserRole[] = ["ADMIN", "SUPER_ADMIN", "SUPERVISOR"];

/**
 * Strips PII for operators (USER) when reading insured party in API JSON.
 */
export function maskInsuredParty<T extends { pan?: string | null } | null | undefined>(
  role: UserRole,
  row: T,
): T {
  if (!row || ROLES_PII.includes(role)) {
    return row;
  }
  if (!("pan" in row) || row.pan == null) {
    return row;
  }
  return { ...row, pan: null } as T;
}
