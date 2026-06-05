import type { AdMemberRow } from "./ad-member-types";

function dateParse(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Prefer ISO-style parsing (YYYY-MM-DD or full ISO timestamps).
  const fromIso = new Date(trimmed);
  if (!Number.isNaN(fromIso.getTime())) {
    return fromIso;
  }

  // Fallback for DD-MM-YYYY inputs.
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

export const MEMBER_AGE_ALERT_THRESHOLD = 25;

type MemberAge25AlertDetail = {
  name: string;
  age: number;
};

function ageFromDobOnAnchor(iso: string, anchorIso: string): string {
  if (!iso || !anchorIso) {
    return "";
  }
  const dob = dateParse(iso);
  const anchor = dateParse(anchorIso);
  if (!dob || !anchor || anchor.getTime() < dob.getTime()) {
    return "";
  }

  // Calendar-based year delta (avoids floating-point year approximation).
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

function membersNeedingAge25AlertDetails(
  members: readonly AdMemberRow[],
  anchorIso: string,
): MemberAge25AlertDetail[] {
  const rows: MemberAge25AlertDetail[] = [];
  for (const member of members) {
    const age = resolveMemberAge(member, anchorIso);
    if (age === null || age < MEMBER_AGE_ALERT_THRESHOLD) {
      continue;
    }
    const name = member.name.trim() || "Member";
    rows.push({ name, age });
  }
  return rows;
}

/** Names of members whose age is at or above the alert threshold. */
export function membersNeedingAge25Alert(
  members: readonly AdMemberRow[],
  anchorIso: string,
): string[] {
  return membersNeedingAge25AlertDetails(members, anchorIso).map((r) => r.name);
}

/** Alert copy shown in the policy form modal (informational only). */
export function formatMemberAge25AlertMessage(details: readonly MemberAge25AlertDetail[]): string {
  if (details.length === 0) {
    return "";
  }
  const allExact25 = details.every((d) => d.age === 25);
  const anyOver25 = details.some((d) => d.age > 25);

  if (details.length === 1) {
    const row = details[0]!;
    const agePhrase = row.age === 25 ? "now 25" : "now over 25";
    return `${row.name} is ${agePhrase} so need to take action - new policy or make him policy holder`;
  }

  const names = details.map((d) => d.name);
  const agePhrase = allExact25 ? "now 25" : anyOver25 ? "now 25 or over 25" : "now 25";
  return `${names.join(", ")} are ${agePhrase} so need to take action - new policy or make them policy holder`;
}

export function buildMemberAge25AlertMessage(
  members: readonly AdMemberRow[],
  anchorIso: string,
): string {
  return formatMemberAge25AlertMessage(membersNeedingAge25AlertDetails(members, anchorIso));
}
