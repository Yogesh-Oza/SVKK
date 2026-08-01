import { normalizeMobile } from "../../domain/phone.js";

/** Subset of insured-party patch routed to per-policy holder snapshots. */
export type HolderRoutablePartyPatch = {
  partyName?: string;
  dateOfBirth?: Date | null;
  pan?: string | null;
  aadhaarNo?: string | null;
  mobile?: string;
  email?: string | null;
  customerId?: string | null;
  /** Kept on InsuredParty — stable identity / renewal grouping. Not snapshotted. */
  svkkPublicId?: string | null;
};

/** Policy patch fields that store per-year holder snapshots. */
export type HolderSnapshotPolicyPatch = {
  holderName?: string | null;
  holderDateOfBirth?: Date | null;
  holderPan?: string | null;
  holderAadhaarNo?: string | null;
  holderCustomerId?: string | null;
  holderEmail?: string | null;
  holderMobile?: string | null;
};

/** Policy-level holder fields snapshotted per fiscal-year policy row. */
export type PolicyHolderSnapshot = {
  holderName?: string | null;
  holderDateOfBirth?: Date | null;
  holderPan?: string | null;
  holderAadhaarNo?: string | null;
  holderCustomerId?: string | null;
  holderEmail?: string | null;
  holderMobile?: string | null;
};

export type InsuredPartyHolderLike = {
  name: string;
  dateOfBirth?: Date | null;
  pan?: string | null;
  aadhaarNo?: string | null;
  customerId?: string | null;
  email?: string | null;
  mobile?: string | null;
};

/**
 * Display holder name for a policy row (snapshot first, then linked party).
 */
export function resolvePolicyHolderName(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): string {
  const snapshot = policy?.holderName?.trim();
  if (snapshot) {
    return snapshot;
  }
  return party?.name?.trim() || "";
}

export function resolvePolicyHolderDateOfBirth(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): Date | null | undefined {
  return policy?.holderDateOfBirth ?? party?.dateOfBirth ?? null;
}

export function resolvePolicyHolderPan(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): string | null | undefined {
  return policy?.holderPan ?? party?.pan ?? null;
}

export function resolvePolicyHolderAadhaar(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): string | null | undefined {
  return policy?.holderAadhaarNo ?? party?.aadhaarNo ?? null;
}

/**
 * Snapshot null/undefined → fall back to InsuredParty (legacy rows).
 * Snapshot "" → cleared for this policy (do not fall back).
 */
function resolveOptionalSnapshotString(
  snapshot: string | null | undefined,
  partyValue: string | null | undefined,
): string | null {
  if (snapshot !== undefined && snapshot !== null) {
    return snapshot.trim() || null;
  }
  return partyValue?.trim() || null;
}

export function resolvePolicyHolderCustomerId(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): string | null {
  return resolveOptionalSnapshotString(policy?.holderCustomerId, party?.customerId);
}

export function resolvePolicyHolderEmail(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): string | null {
  return resolveOptionalSnapshotString(policy?.holderEmail, party?.email);
}

export function resolvePolicyHolderMobile(
  policy: PolicyHolderSnapshot | null | undefined,
  party: InsuredPartyHolderLike | null | undefined,
): string | null {
  return resolveOptionalSnapshotString(policy?.holderMobile, party?.mobile);
}

/** Build snapshot fields from create / carry-forward holder input. */
export function holderSnapshotFromInput(input: {
  partyName: string;
  dateOfBirth?: Date | null;
  pan?: string | null;
  aadhaarNo?: string | null;
  customerId?: string | null;
  email?: string | null;
  mobile?: string | null;
}): PolicyHolderSnapshot {
  return {
    holderName: input.partyName.trim(),
    holderDateOfBirth: input.dateOfBirth ?? null,
    holderPan: input.pan?.toUpperCase() ?? null,
    holderAadhaarNo: input.aadhaarNo ?? null,
    // Store "" when absent so new policies do not keep falling through to a later party edit.
    holderCustomerId: input.customerId?.trim() || "",
    holderEmail: input.email?.trim() || "",
    holderMobile:
      input.mobile != null && String(input.mobile).trim()
        ? normalizeMobile(String(input.mobile))
        : "",
  };
}

/**
 * Move holder display/contact fields from insured-party patch onto the policy patch.
 * SVKK ID (`svkkPublicId`) stays on InsuredParty — stable identity for renewal grouping.
 */
export function routeInsuredPartyPatchToPolicySnapshot<
  TParty extends HolderRoutablePartyPatch,
  TPolicy extends HolderSnapshotPolicyPatch,
>(partyPatch: TParty, policyPatch: TPolicy): { partyPatch: TParty; policyPatch: TPolicy } {
  const nextParty: TParty = { ...partyPatch };
  const nextPolicy: TPolicy = { ...policyPatch };

  if (nextParty.partyName !== undefined) {
    nextPolicy.holderName = nextParty.partyName;
    delete nextParty.partyName;
  }
  if (nextParty.dateOfBirth !== undefined) {
    nextPolicy.holderDateOfBirth = nextParty.dateOfBirth;
    delete nextParty.dateOfBirth;
  }
  if (nextParty.pan !== undefined) {
    nextPolicy.holderPan = nextParty.pan;
    delete nextParty.pan;
  }
  if (nextParty.aadhaarNo !== undefined) {
    nextPolicy.holderAadhaarNo = nextParty.aadhaarNo;
    delete nextParty.aadhaarNo;
  }
  if (nextParty.customerId !== undefined) {
    // "" = cleared for this policy; do not leave null (null would fall back to party).
    nextPolicy.holderCustomerId = (nextParty.customerId ?? "").trim();
    delete nextParty.customerId;
  }
  if (nextParty.email !== undefined) {
    nextPolicy.holderEmail = (nextParty.email ?? "").trim();
    delete nextParty.email;
  }
  if (nextParty.mobile !== undefined) {
    nextPolicy.holderMobile = nextParty.mobile.trim()
      ? normalizeMobile(nextParty.mobile)
      : "";
    delete nextParty.mobile;
  }

  return { partyPatch: nextParty, policyPatch: nextPolicy };
}

/** Overlay insured-party holder fields with this policy's snapshot for API responses. */
export function overlayInsuredPartyWithPolicySnapshot<T extends InsuredPartyHolderLike>(
  party: T | null | undefined,
  policy: PolicyHolderSnapshot | null | undefined,
): T | null | undefined {
  if (!party) {
    return party;
  }
  const mobile = resolvePolicyHolderMobile(policy, party);
  return {
    ...party,
    name: resolvePolicyHolderName(policy, party),
    dateOfBirth: resolvePolicyHolderDateOfBirth(policy, party) ?? null,
    pan: resolvePolicyHolderPan(policy, party) ?? null,
    aadhaarNo: resolvePolicyHolderAadhaar(policy, party) ?? null,
    customerId: resolvePolicyHolderCustomerId(policy, party),
    email: resolvePolicyHolderEmail(policy, party),
    // Party.mobile is required in DB; keep a string for callers that expect it.
    mobile: mobile ?? party.mobile ?? "",
  };
}
