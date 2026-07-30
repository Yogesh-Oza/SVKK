export const POLICY_MEMBER_AGE_BUCKET_KEYS = [
  "age0_18",
  "age19_35",
  "age36_45",
  "age46_50",
  "age51_55",
  "age56_60",
  "age61_65",
  "age65p",
] as const;

export type PolicyMemberAgeBucketKey = (typeof POLICY_MEMBER_AGE_BUCKET_KEYS)[number];

export type PolicyMemberAgeBuckets = Record<PolicyMemberAgeBucketKey, number>;

/** Sum all age-band columns — should match Members + policies when DOB data is complete. */
export function sumPolicyMemberAgeBuckets(row: PolicyMemberAgeBuckets): number {
  let total = 0;
  for (const key of POLICY_MEMBER_AGE_BUCKET_KEYS) {
    total += row[key] ?? 0;
  }
  return total;
}

export function withTotalAgeCount<T extends PolicyMemberAgeBuckets>(row: T): T & { totalAgeCount: number } {
  return { ...row, totalAgeCount: sumPolicyMemberAgeBuckets(row) };
}

export function ageCountMatchesMembersPlusPolicies(row: {
  membersPlusPolicies: number;
  totalAgeCount: number;
}): boolean {
  return row.totalAgeCount === row.membersPlusPolicies;
}
