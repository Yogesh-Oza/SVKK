import {
  customAge,
  discountPct,
  normalizeMember,
} from "../../lib/svkk/premium/engine";
import type { MemberInput, PolicyKey, PremiumState, Quote, QuoteRow } from "../../lib/svkk/premium/types";
import type { AdPolicyFormValues } from "./ad-policy-form-values";

/** Same normalization as `normPolicyKey` in premium storage (avoids API import). */
function normPolicyKeyForCalc(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
/** Form field paths that should unlock live premium auto-calculation when edited by the user. */
export const CALC_TRIGGER_FIELD_PREFIXES = [
  "adProduct",
  "sumInsured",
  "person",
  "dob",
  "policyStart",
  "policyEnd",
  "previousEndDate",
  "holderGender",
  "relation",
  "holderAddOns",
  "members",
] as const;

/**
 * Returns whether a Formik field path should unlock auto-calculation after a user edit.
 *
 * @param path - Formik `name` or dotted path (e.g. `members[0].dob`).
 */
export function isCalcTriggerPath(path: string): boolean {
  const normalized = path.trim();
  if (!normalized) {
    return false;
  }
  return CALC_TRIGGER_FIELD_PREFIXES.some(
    (prefix) =>
      normalized === prefix ||
      normalized.startsWith(`${prefix}.`) ||
      normalized.startsWith(`${prefix}[`),
  );
}

/** Policy form context that controls whether live chart auto-calculation may run. */
export type AutoCalcContext = {
  isEdit: boolean;
  fetchedForUpdate: boolean;
};

/**
 * Live auto-calc is allowed only on create-new and carry-forward (not fetch/edit/update).
 */
export function canEnableLiveAutoCalc(ctx: AutoCalcContext): boolean {
  return !ctx.isEdit && !ctx.fetchedForUpdate;
}

/**
 * Whether auto-calc should unlock for a user-driven change (not during programmatic hydrate).
 *
 * @param path - Field path passed to `setFieldValue` or input `name`.
 * @param isHydrating - True while `loadPolicyDetailIntoForm` / edit `resetForm` runs.
 * @param ctx - Edit or fetch-for-update flows keep stored premiums (no unlock).
 */
export function shouldUnlockAutoCalc(
  path: string,
  isHydrating: boolean,
  ctx: AutoCalcContext,
): boolean {
  return canEnableLiveAutoCalc(ctx) && !isHydrating && isCalcTriggerPath(path);
}

/**
 * Whether live chart basic premium should overwrite a form field (create / carry-forward).
 * Skips when the user manually edited the field; updates when empty or stale vs chart.
 */
export function shouldApplyChartBasicToField(
  currentValue: string,
  chartBasic: number,
  isManual: boolean,
): boolean {
  if (isManual || chartBasic <= 0) {
    return false;
  }
  return parseInrForCalc(currentValue) !== chartBasic;
}

/**
 * Clear stored basic premium when the chart row errors (live mode only).
 * Prevents carry-forward / prior-year amounts from lingering when the summary is blank.
 */
export function shouldClearBasicOnChartError(
  currentValue: string,
  rowHasError: boolean,
  isManual: boolean,
): boolean {
  return rowHasError && !isManual && parseInrForCalc(currentValue) > 0;
}

/**
 * Sum insured for chart lookup: policy-level field, else highest member SI (carry-forward).
 */
export function resolveQuoteSumInsured(
  policySumInsured: string,
  members: ReadonlyArray<{ sumInsured?: string }>,
): number {
  const policy = parseInrForCalc(policySumInsured);
  if (policy > 0) {
    return policy;
  }
  let maxMember = 0;
  for (const m of members) {
    const si = parseInrForCalc(m.sumInsured ?? "");
    if (si > maxMember) {
      maxMember = si;
    }
  }
  return maxMember;
}

/** Map form gender codes to premium engine input. */
export function genderToQuoteInput(gender: string): MemberInput["gender"] {
  const g = gender.trim().toUpperCase();
  if (g === "M" || g === "MALE") {
    return "male";
  }
  if (g === "F" || g === "FEMALE") {
    return "female";
  }
  return "";
}

/** Parse INR-style numeric strings from form fields. */
export function parseInrForCalc(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) {
    return 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function holderGenderToMemberGender(holderGender: string): MemberInput["gender"] {
  if (holderGender === "M") {
    return "male";
  }
  if (holderGender === "F") {
    return "female";
  }
  return "";
}

function memberGenderToInput(gender: string): MemberInput["gender"] {
  if (gender === "M") {
    return "male";
  }
  if (gender === "F") {
    return "female";
  }
  return "";
}

/**
 * Build a premium summary from stored form amounts (no chart lookup for basic premium).
 * Discount percentages still follow product rules; ages are derived from DOB for display.
 */
export function quoteFromStoredFormValues(
  values: AdPolicyFormValues,
  premiumState: PremiumState,
  endDate: string,
): Quote {
  const rawKey = normPolicyKeyForCalc(values.adProduct || "");
  const policyKey: PolicyKey = premiumState.charts[rawKey] ? rawKey : "individual";
  const validMembers = (values.members || []).filter((m) => Boolean(m.name?.trim()) && Boolean(m.dob));
  const memberCount = 1 + validMembers.length;

  const holderMember: Partial<MemberInput> = {
    name: values.policyHolder || "Policy Holder",
    dob: values.dob || "",
    relationship: (values.relation || "self").toLowerCase() || "self",
    gender: holderGenderToMemberGender(values.holderGender),
    addOnRider: parseInrForCalc(values.holderAddOns),
  };

  const memberInputs: Partial<MemberInput>[] = validMembers.map((m, i) => ({
    name: m.name.trim() || `Member ${i + 1}`,
    dob: m.dob,
    relationship: (m.relationship || "member").toLowerCase() || "member",
    gender: memberGenderToInput(m.gender),
    addOnRider: parseInrForCalc(m.addOnsAmount),
  }));

  const allMembers = [holderMember, ...memberInputs];
  const storedBasics = [
    parseInrForCalc(values.basicPremiumPs),
    ...validMembers.map((m) => parseInrForCalc(m.basicPremium)),
  ];

  const rows: QuoteRow[] = allMembers.map((member, index) => {
    const normalized = normalizeMember(member, index, policyKey);
    const role: "holder" | "member" = index === 0 ? "holder" : "member";
    const age = customAge(normalized.dob, endDate);
    if (age == null) {
      return {
        ...normalized,
        role,
        age: null,
        error: "Age could not be calculated.",
      };
    }

    const basic = storedBasics[index] ?? 0;
    const rider = Number(normalized.addOnRider) || 0;
    const gross = basic + rider;
    const pct = discountPct(
      premiumState.defs,
      policyKey,
      role,
      memberCount,
      normalized.relationship,
      normalized.gender,
    );
    const rawDiscount = (gross * pct) / 100;
    const disc =
      policyKey === "asha_kiran" ? Math.floor(rawDiscount) : Math.ceil(rawDiscount);
    const net = Math.ceil(gross - disc);

    return {
      ...normalized,
      role,
      age,
      band: "—",
      basic,
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

  return {
    rows,
    basic,
    rider,
    gross,
    disc,
    net: Math.ceil(gross - disc),
  };
}
