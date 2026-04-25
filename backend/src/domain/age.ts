/**
 * Full date age in years at asOf (not calendar year difference).
 */
export function ageYearsAt(dob: Date, asOf: Date): number {
  let years = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}
