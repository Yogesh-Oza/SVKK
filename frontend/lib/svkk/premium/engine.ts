import type {
  ChartBand,
  ChartData,
  DiscountConfig,
  MemberInput,
  PolicyKey,
  PremiumState,
  Quote,
  QuoteRow,
} from "./types";

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function dateFromParts(y: number, m: number, d: number): Date | null {
  const out = new Date(y, m - 1, d);
  if (!isValidDate(out)) return null;
  if (out.getFullYear() !== y || out.getMonth() !== m - 1 || out.getDate() !== d) return null;
  return new Date(out.getFullYear(), out.getMonth(), out.getDate());
}

/**
 * Accepts DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, native Date, or Excel
 * serial number. Returns a date stripped to local Y/M/D (timezone-safe enough
 * for "completed age" math).
 */
export function dateParse(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return isValidDate(v) ? new Date(v.getFullYear(), v.getMonth(), v.getDate()) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const base = new Date(1899, 11, 30);
    const out = new Date(base.getTime() + Math.round(v) * 86400000);
    return isValidDate(out) ? new Date(out.getFullYear(), out.getMonth(), out.getDate()) : null;
  }
  const raw = String(v).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "-").replace(/\//g, "-");
  const parts = normalized.split("-").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 3) {
    if (parts[0]!.length === 4) {
      return dateFromParts(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    }
    if (parts[2]!.length === 4) {
      return dateFromParts(Number(parts[2]), Number(parts[1]), Number(parts[0]));
    }
  }
  const parsed = new Date(raw);
  return isValidDate(parsed)
    ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    : null;
}

/** Format a Date (or anything `dateParse` can read) as `YYYY-MM-DD` for HTML
 *  `<input type="date">`. Returns "" if the value can't be parsed. */
export function toIsoDate(v: unknown): string {
  const d = dateParse(v);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "Completed age" between DOB and end date, identical to reference logic. */
export function customAge(dob: unknown, endDate: unknown): number | null {
  const b = dateParse(dob);
  const e = dateParse(endDate);
  if (!b || !e || e < b) return null;
  let years = e.getFullYear() - b.getFullYear();
  const birthdayThisYear = new Date(e.getFullYear(), b.getMonth(), b.getDate());
  if (e < birthdayThisYear) years -= 1;
  return years;
}

export function relationshipOptions(policy: PolicyKey, index: number): string[] {
  if (index === 0) return ["self"];
  if (policy === "asha_kiran") return ["spouse", "daughter"];
  return ["member", "spouse", "son", "daughter", "parent"];
}

export function normalizeMember(
  member: Partial<MemberInput>,
  index: number,
  policy: PolicyKey,
): MemberInput {
  const options = relationshipOptions(policy, index);
  const relationship = options.includes(String(member.relationship))
    ? String(member.relationship)
    : options[0]!;
  const gender: MemberInput["gender"] =
    relationship === "daughter"
      ? "female"
      : ((member.gender as MemberInput["gender"]) || (index === 0 ? "male" : ""));
  return {
    name: String(member.name || (index === 0 ? "Policy Holder" : "Member " + index)),
    dob: String(member.dob || ""),
    relationship,
    gender,
    addOnRider: Number(member.addOnRider) || 0,
  };
}

/**
 * Ensure `members` has exactly `count` rows (clamped to [1,10]) with proper
 * defaults — mirrors the reference `ensureMembers`.
 */
export function ensureMembers(
  members: Partial<MemberInput>[],
  count: number,
  policy: PolicyKey,
): MemberInput[] {
  const target = Math.max(1, Math.min(10, Number(count) || 1));
  const out = [...members];
  while (out.length < target) {
    const idx = out.length;
    const rel =
      idx === 0
        ? "self"
        : policy === "asha_kiran"
          ? idx === 1
            ? "spouse"
            : "daughter"
          : "member";
    out.push({
      name: idx === 0 ? "Policy Holder" : "Member " + idx,
      dob: "",
      relationship: rel,
      gender: rel === "daughter" ? "female" : "",
      addOnRider: 0,
    });
  }
  return out.slice(0, target).map((m, i) => normalizeMember(m, i, policy));
}

export function chartRows(
  charts: PremiumState["charts"],
  policy: PolicyKey,
  role: "holder" | "member",
): ChartBand[] {
  const chart = charts[policy];
  if (Array.isArray(chart)) return chart;
  if (!chart) return [];
  return role === "holder" ? chart.holder || [] : chart.member || chart.holder || [];
}

export function siList(charts: PremiumState["charts"], policy: PolicyKey): number[] {
  const chart = charts[policy];
  const rows: ChartBand[] = Array.isArray(chart)
    ? chart
    : [...(chart?.holder || []), ...(chart?.member || [])];
  const all = rows.flatMap((r) => Object.keys(r.premiums || {}).map(Number));
  return [...new Set(all)].filter(Number.isFinite).sort((a, b) => a - b);
}

function premiumFor(
  charts: PremiumState["charts"],
  policy: PolicyKey,
  role: "holder" | "member",
  age: number,
  si: number,
): { premium: number; band: string } | { error: string } {
  const rows = chartRows(charts, policy, role);
  const hit = rows.find((r) => age >= r.min && age <= r.max);
  if (!hit) return { error: "No age band found for age " + age };
  const value = hit.premiums?.[String(si)];
  if (value == null) return { error: "No premium found for SI ₹" + si + " in age band " + hit.label };
  return { premium: Number(value), band: hit.label };
}

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function discountPct(
  defs: PremiumState["defs"],
  policy: PolicyKey,
  role: "holder" | "member",
  count: number,
  rel: string,
  gender: string,
): number {
  const d: DiscountConfig | undefined = defs[policy]?.discount;
  if (!d) return 0;
  if (d.type === "daughter") {
    return rel === "daughter" && gender === "female" ? asNumber(d.daughter) : 0;
  }
  if (d.different === "yes") {
    return role === "holder" ? asNumber(d.holder) : asNumber(d.member);
  }
  const c = Math.min(Math.max(Number(count) || 1, 1), 7) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  return asNumber(d.byCount?.[c] || 0);
}

/**
 * For Asha Kiran: holder chart is applied to the oldest *non-daughter* member.
 * Falls back to index 0 if every member is a daughter / no ages.
 */
function ashaKiranHolderChartIndex(
  members: Partial<MemberInput>[],
  endDate: unknown,
): number {
  const eligible: { index: number; age: number }[] = [];
  members.forEach((member, index) => {
    const normalized = normalizeMember(member, index, "asha_kiran");
    if (normalized.relationship === "daughter") return;
    const age = customAge(normalized.dob, endDate);
    if (age == null) return;
    eligible.push({ index, age });
  });
  if (!eligible.length) return 0;
  eligible.sort((a, b) => b.age - a.age || a.index - b.index);
  return eligible[0]!.index;
}

export interface QuoteInput {
  policyType: PolicyKey;
  memberCount: number;
  sumInsured: number;
  endDate: string;
  members: Partial<MemberInput>[];
}

/**
 * Reproduces the reference `quoteFromInput` 1:1:
 *  - per-member basic premium from chart (holder vs member chart for AK)
 *  - gross = basic + rider
 *  - discount = gross * pct / 100, floor for asha_kiran daughter, ceil otherwise
 *  - net = ceil(gross - discount)
 */
export function quoteFromInput(
  state: PremiumState,
  input: QuoteInput,
): Quote {
  const safeMembers = (input.members || []).map((m, i) => normalizeMember(m, i, input.policyType));
  const ashaHolderIndex =
    input.policyType === "asha_kiran"
      ? ashaKiranHolderChartIndex(safeMembers, input.endDate)
      : 0;

  const rows: QuoteRow[] = safeMembers.map((member, index) => {
    const appliedRole: "holder" | "member" =
      input.policyType === "asha_kiran"
        ? index === ashaHolderIndex
          ? "holder"
          : "member"
        : index === 0
          ? "holder"
          : "member";
    const age = customAge(member.dob, input.endDate);
    if (age == null) {
      return {
        ...member,
        role: appliedRole,
        age: null,
        error: "Age could not be calculated.",
      };
    }
    const premium = premiumFor(state.charts, input.policyType, appliedRole, age, Number(input.sumInsured));
    if ("error" in premium) {
      return { ...member, role: appliedRole, age, error: premium.error };
    }
    const rider = Number(member.addOnRider) || 0;
    const gross = premium.premium + rider;
    const pct = discountPct(
      state.defs,
      input.policyType,
      appliedRole,
      input.memberCount,
      member.relationship,
      member.gender,
    );
    const rawDiscount = (gross * pct) / 100;
    const disc = input.policyType === "asha_kiran" ? Math.floor(rawDiscount) : Math.ceil(rawDiscount);
    const net = Math.ceil(gross - disc);
    return {
      ...member,
      role: appliedRole,
      age,
      band: premium.band,
      basic: premium.premium,
      rider,
      gross,
      pct,
      disc,
      net,
    };
  });

  const basic = rows.reduce((sum, r) => sum + (r.basic || 0), 0);
  const rider = rows.reduce((sum, r) => sum + (r.rider || 0), 0);
  const gross = rows.reduce((sum, r) => sum + (r.gross || 0), 0);
  const disc = rows.reduce((sum, r) => sum + (r.disc || 0), 0);
  return { rows, basic, rider, gross, disc, net: Math.ceil(gross - disc) };
}

/** INR formatter matching the reference HTML's `rs()`. */
export function rs(n: number | string): string {
  return new Intl.NumberFormat("en-IN").format(Number(n) || 0);
}

export type ChartData_ = ChartData; // re-export for consumers
