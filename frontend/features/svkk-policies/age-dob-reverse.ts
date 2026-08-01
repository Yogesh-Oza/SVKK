import { formatDateForFormInput } from "@/lib/svkk/form-date";

/**
 * Reverse Age → DOB using the **current calendar date** (not policy end / previous end).
 * Does not replace existing DOB → Age / age-anchor logic.
 *
 * @returns DD-MM-YYYY, or null when age is invalid/blank.
 */
export function dobFromAgeUsingToday(
  ageRaw: string,
  today: Date = new Date(),
): string | null {
  const trimmed = String(ageRaw ?? "").trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const age = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(age) || age < 0 || age > 150) {
    return null;
  }

  const year = today.getFullYear() - age;
  const month = today.getMonth();
  const day = today.getDate();
  // Clamp day for months shorter than today (e.g. 31 → 30, leap Feb 29 → 28).
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(day, lastDayOfMonth);
  const dob = new Date(year, month, safeDay);
  return formatDateForFormInput(
    `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`,
  );
}

/** True when DOB is empty so reverse Age → DOB may run. */
export function canAutoFillDobFromAge(dob: string | null | undefined): boolean {
  return !String(dob ?? "").trim();
}

/**
 * Whether Age → DOB may write the DOB field.
 * Allows overwrite only when DOB is blank, or DOB was last produced by Age → DOB
 * (so typing `6` then `60` can update DOB without treating the first digit as "existing DOB").
 */
export function shouldApplyDobFromAge(
  currentDob: string | null | undefined,
  dobWasAutoFilledFromAge: boolean,
): boolean {
  return canAutoFillDobFromAge(currentDob) || dobWasAutoFilledFromAge;
}
