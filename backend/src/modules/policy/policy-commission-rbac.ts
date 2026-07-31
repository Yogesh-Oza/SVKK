/**
 * `policy:commission` controls view/edit UI and read responses only — never whether
 * commission is calculated or persisted.
 *
 * On write without permission:
 * - Null / empty commission keys are stripped so PATCH does not wipe stored values
 *   (older clients cleared hidden fields to null).
 * - Non-null calculated commission values are accepted and saved.
 * - When commission is missing but grossPremium is present, fill from the formula.
 */

type CommissionYearFields = {
  grossPremium?: number | null;
  commissionAmount?: number | null;
  vkkCommission?: number | null;
};

/** Commission = round(gross × 15%); VKK Commission = commission × 50%. */
export function fillCommissionFromGross(year: CommissionYearFields): void {
  const gross = year.grossPremium;
  if (gross == null || !Number.isFinite(gross)) {
    return;
  }
  // Only fill omitted fields — never overwrite an explicit null (clear) or a set value.
  if (year.commissionAmount === undefined) {
    year.commissionAmount = Math.round(gross * 0.15);
  }
  if (year.vkkCommission === undefined) {
    const commission =
      year.commissionAmount != null && Number.isFinite(year.commissionAmount)
        ? year.commissionAmount
        : Math.round(gross * 0.15);
    year.vkkCommission = commission * 0.5;
  }
}

/**
 * Prepare commission fields on create/patch payloads.
 * Does not enforce permission on calculated values — only prevents null wipes
 * when the caller lacks `policy:commission`.
 */
export function assertOrStripCommissionFields(
  year: CommissionYearFields | undefined,
  hasCommissionPermission: boolean,
): void {
  if (!year) {
    return;
  }

  if (!hasCommissionPermission) {
    // Older clients without the permission often clear hidden fields to null;
    // strip those keys so PATCH leaves existing commission unchanged.
    if (year.commissionAmount === null) {
      delete year.commissionAmount;
    }
    if (year.vkkCommission === null) {
      delete year.vkkCommission;
    }
  }

  // Always ensure formula-based values when gross is known and commission is absent.
  fillCommissionFromGross(year);
}
