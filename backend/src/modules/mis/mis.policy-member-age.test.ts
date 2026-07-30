import { describe, expect, it } from "vitest";
import { sumPolicyMemberAgeBuckets } from "./mis.policy-member-age.js";

describe("sumPolicyMemberAgeBuckets", () => {
  it("sums all age-band columns", () => {
    expect(
      sumPolicyMemberAgeBuckets({
        age0_18: 10,
        age19_35: 20,
        age36_45: 5,
        age46_50: 3,
        age51_55: 2,
        age56_60: 1,
        age61_65: 4,
        age65p: 7,
      }),
    ).toBe(52);
  });
});
