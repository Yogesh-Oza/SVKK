import type { AdMemberRow } from "./ad-member-types";



function dateParse(value: string): Date | null {

  const trimmed = value.trim();

  if (!trimmed) return null;



  const fromIso = new Date(trimmed);

  if (!Number.isNaN(fromIso.getTime())) {

    return fromIso;

  }



  const m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);

  if (!m) return null;



  const day = Number(m[1]);

  const monthIndex = Number(m[2]) - 1;

  const year = Number(m[3]);

  if (!Number.isFinite(day) || !Number.isFinite(monthIndex) || !Number.isFinite(year)) {

    return null;

  }



  const d = new Date(Date.UTC(year, monthIndex, day));

  return Number.isNaN(d.getTime()) ? null : d;

}



export const CARRY_FORWARD_PRIOR_AGE = 24;

export const CARRY_FORWARD_NEW_AGE = 25;



/** Alert applies only to male members (form values M / Male / MALE). */

export function isMaleMember(member: AdMemberRow): boolean {

  const gender = member.gender.trim().toUpperCase();

  return gender === "M" || gender === "MALE";

}



/** Next policy-year end date (+1 calendar year) used when carry forward clears policyEnd. */

export function projectPolicyEndAfterCarryForward(priorEndIso: string): string {

  const prior = dateParse(priorEndIso);

  if (!prior) {

    return "";

  }

  const next = new Date(

    Date.UTC(prior.getUTCFullYear() + 1, prior.getUTCMonth(), prior.getUTCDate()),

  );

  return next.toISOString().slice(0, 10);

}



function ageFromDobOnAnchor(iso: string, anchorIso: string): string {

  if (!iso || !anchorIso) {

    return "";

  }

  const dob = dateParse(iso);

  const anchor = dateParse(anchorIso);

  if (!dob || !anchor || anchor.getTime() < dob.getTime()) {

    return "";

  }



  let years = anchor.getUTCFullYear() - dob.getUTCFullYear();

  const anchorMonth = anchor.getUTCMonth();

  const dobMonth = dob.getUTCMonth();

  const anchorDay = anchor.getUTCDate();

  const dobDay = dob.getUTCDate();

  const beforeBirthday =

    anchorMonth < dobMonth || (anchorMonth === dobMonth && anchorDay < dobDay);

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



/** Male members who were 24 on the prior policy end and turn 25 on the carried-forward year. */

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


