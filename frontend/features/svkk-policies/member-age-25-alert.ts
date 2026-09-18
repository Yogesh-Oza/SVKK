import { dateParse, toIsoDate } from "@/lib/svkk/premium/engine";

import type { AdMemberRow } from "./ad-member-types";

export const CARRY_FORWARD_PRIOR_AGE = 24;
export const CARRY_FORWARD_NEW_AGE = 25;

/** Alert applies only to male members (form values M / Male / MALE). */
export function isMaleMember(member: AdMemberRow): boolean {
  const gender = member.gender.trim().toUpperCase();
  return gender === "M" || gender === "MALE";
}

/** Next policy-year end date (+1 calendar year) used when carry forward clears policyEnd. */
export function projectPolicyEndAfterCarryForward(priorEnd: string): string {
  const prior = dateParse(priorEnd);
  if (!prior) {
    return "";
  }
  const next = new Date(prior.getFullYear() + 1, prior.getMonth(), prior.getDate());
  return toIsoDate(next);
}

function ageFromDobOnAnchor(dobValue: string, anchorValue: string): string {
  if (!dobValue || !anchorValue) {
    return "";
  }
  const dob = dateParse(dobValue);
  const anchor = dateParse(anchorValue);
  if (!dob || !anchor || anchor.getTime() < dob.getTime()) {
    return "";
  }

  let years = anchor.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    anchor.getMonth() < dob.getMonth() ||
    (anchor.getMonth() === dob.getMonth() && anchor.getDate() < dob.getDate());
  if (beforeBirthday) {
    years -= 1;
  }
  return years >= 0 ? String(years) : "";
}

/** Member age at policy anchor (DOB-derived when possible, else manual age field). */
export function resolveMemberAge(member: AdMemberRow, anchorIso: string): number | null {
  if (member.dob && anchorIso) {
    const fromDob = ageFromDobOnAnchor(member.dob, anchorIso);
    if (fromDob) {
      const parsed = Number(fromDob);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  const parsed = Number(member.age);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveNewAgeOnCarryForward(
  member: AdMemberRow,
  priorAnchorIso: string,
  newAnchorIso: string,
): number | null {
  if (member.dob.trim() && newAnchorIso) {
    return resolveMemberAge(member, newAnchorIso);
  }
  const priorAge = resolveMemberAge(member, priorAnchorIso);
  if (priorAge === null) {
    return null;
  }
  return priorAge + 1;
}

/**
 * Male members who were 24 on the prior policy end and turn 25 on the
 * carried-forward year. Do not flag while still 24 on the new year.
 */
export function membersTurning25OnCarryForward(
  members: readonly AdMemberRow[],
  priorAnchorIso: string,
  newAnchorIso?: string,
): string[] {
  if (!priorAnchorIso.trim()) {
    return [];
  }
  const projectedNewAnchor =
    newAnchorIso?.trim() || projectPolicyEndAfterCarryForward(priorAnchorIso);
  if (!projectedNewAnchor) {
    return [];
  }

  const names: string[] = [];
  for (const member of members) {
    if (!isMaleMember(member)) {
      continue;
    }
    const priorAge = resolveMemberAge(member, priorAnchorIso);
    if (priorAge !== CARRY_FORWARD_PRIOR_AGE) {
      continue;
    }
    const newAge = resolveNewAgeOnCarryForward(member, priorAnchorIso, projectedNewAnchor);
    if (newAge !== CARRY_FORWARD_NEW_AGE) {
      continue;
    }
    names.push(member.name.trim() || "Member");
  }
  return names;
}

/**
 * Form age as-of date: prefer current policy end; otherwise prior end
 * (after carry-forward clears policyEnd — ages stay on prior year, not +1).
 */
export function resolveFormAgeAnchor(policyEnd: string, previousEndDate: string): string {
  if (policyEnd.trim()) {
    return policyEnd.trim();
  }
  return previousEndDate.trim();
}

/** @deprecated Ages are no longer auto-advanced on CF; kept for callers/tests. */
export function memberAgeAfterCarryForward(
  member: AdMemberRow,
  priorAnchorIso: string,
  newAnchorIso?: string,
): string {
  const projectedNewAnchor =
    newAnchorIso?.trim() || projectPolicyEndAfterCarryForward(priorAnchorIso);
  if (!projectedNewAnchor) {
    return member.age;
  }
  const newAge = resolveNewAgeOnCarryForward(member, priorAnchorIso, projectedNewAnchor);
  return newAge != null ? String(newAge) : member.age;
}

/** Alert copy for carry-forward turning-25 notice (informational only). */
export function formatMemberTurning25AlertMessage(names: readonly string[]): string {
  if (names.length === 0) {
    return "";
  }
  if (names.length === 1) {
    return `${names[0]} is now 25 so need to take action - new policy or make him policy holder`;
  }
  return `${names.join(", ")} are now 25 so need to take action - new policy or make them policy holder`;
}

export function buildCarryForwardTurning25AlertMessage(
  members: readonly AdMemberRow[],
  priorAnchorIso: string,
  newAnchorIso?: string,
): string {
  return formatMemberTurning25AlertMessage(
    membersTurning25OnCarryForward(members, priorAnchorIso, newAnchorIso),
  );
}
