import { AppError } from "../../errors/app-error.js";

type CommissionYearFields = {
  commissionAmount?: number | null;
  vkkCommission?: number | null;
};

/**
 * Enforce `policy:commission` on year create/patch payloads.
 *
 * - Non-null commission values without permission → 403
 * - Null / present-but-empty keys without permission → strip so PATCH does not
 *   wipe stored commission (clients without the permission often clear hidden fields)
 */
export function assertOrStripCommissionFields(
  year: CommissionYearFields | undefined,
  hasCommissionPermission: boolean,
): void {
  if (!year || hasCommissionPermission) {
    return;
  }
  if (year.commissionAmount != null || year.vkkCommission != null) {
    throw new AppError("FORBIDDEN", "Insufficient permissions for commission fields", 403);
  }
  delete year.commissionAmount;
  delete year.vkkCommission;
}
