import { hasPermissionInSet } from "../services/rbac.service.js";

/**
 * Masks PAN on insured party for users without full policy scope.
 */
export function maskInsuredParty(
  permissions: Set<string>,
  insuredParty: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!insuredParty) return null;
  if (hasPermissionInSet(permissions, "policy:scope_all") || hasPermissionInSet(permissions, "*:*")) {
    return insuredParty;
  }
  const { pan: _pan, ...rest } = insuredParty;
  return rest;
}
