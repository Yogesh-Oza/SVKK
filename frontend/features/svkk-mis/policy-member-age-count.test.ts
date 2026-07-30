import { describe, expect, it } from "vitest";
import {
  ageCountMatchesMembersPlusPolicies,
  sumPolicyMemberAgeBuckets,
  withTotalAgeCount,
} from "./policy-member-age-count";

describe("policy-member-age-count", () => {
  it("sums age buckets and flags mismatch against members + policies", () => {
    const buckets = {
      age0_18: 100,
      age19_35: 200,
      age36_45: 50,
      age46_50: 25,
      age51_55: 10,
      age56_60: 5,
      age61_65: 4,
      age65p: 6,
    };
    const row = withTotalAgeCount(buckets);

    expect(sumPolicyMemberAgeBuckets(row)).toBe(400);
    expect(row.totalAgeCount).toBe(400);
    expect(ageCountMatchesMembersPlusPolicies({ totalAgeCount: 400, membersPlusPolicies: 400 })).toBe(
      true,
    );
    expect(ageCountMatchesMembersPlusPolicies({ totalAgeCount: 400, membersPlusPolicies: 401 })).toBe(
      false,
    );
  });
});
