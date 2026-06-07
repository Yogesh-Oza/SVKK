/** Subset of insured-party patch routed to per-policy holder snapshots. */
export type HolderRoutablePartyPatch = {
  partyName?: string;
  dateOfBirth?: Date | null;
  pan?: string | null;
  aadhaarNo?: string | null;
  mobile?: string;
  email?: string | null;
  customerId?: string | null;
  svkkPublicId?: string | null;
};

/** Policy patch fields that store per-year holder snapshots. */
export type HolderSnapshotPolicyPatch = {
  holderName?: string | null;
  holderDateOfBirth?: Date | null;
  holderPan?: string | null;
  holderAadhaarNo?: string | null;
};

/** Policy-level holder fields snapshotted per fiscal-year policy row. */
export type PolicyHolderSnapshot = {
  holderName?: string | null;
  holderDateOfBirth?: Date | null;
  holderPan?: string | null;
  holderAadhaarNo?: string | null;
};

export type InsuredPartyHolderLike = {
  name: string;
  dateOfBirth?: Date | null;
  pan?: string | null;
  aadhaarNo?: string | null;
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

/** Build snapshot fields from create / carry-forward holder input. */
export function holderSnapshotFromInput(input: {
  partyName: string;
  dateOfBirth?: Date | null;
  pan?: string | null;
  aadhaarNo?: string | null;
}): PolicyHolderSnapshot {
  return {
    holderName: input.partyName.trim(),
    holderDateOfBirth: input.dateOfBirth ?? null,
    holderPan: input.pan?.toUpperCase() ?? null,
    holderAadhaarNo: input.aadhaarNo ?? null,
  };
}

/**
 * Move holder display fields from insured-party patch onto the policy patch.
 * Identity fields (mobile, customerId, svkkPublicId) stay on InsuredParty.
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
  return {
    ...party,
    name: resolvePolicyHolderName(policy, party),
    dateOfBirth: resolvePolicyHolderDateOfBirth(policy, party) ?? null,
    pan: resolvePolicyHolderPan(policy, party) ?? null,
    aadhaarNo: resolvePolicyHolderAadhaar(policy, party) ?? null,
  };
}
