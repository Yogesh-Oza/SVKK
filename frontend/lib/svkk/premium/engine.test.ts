import { describe, expect, it } from "vitest";

import { calculateAge, quoteFromInput } from "./engine";
import { SAMPLE_CHARTS, SAMPLE_DEFS } from "./sample-data";
import type { PremiumState } from "./types";

const state: PremiumState = {
  defs: SAMPLE_DEFS,
  charts: SAMPLE_CHARTS,
};

describe("quoteFromInput per-member sumInsured", () => {
  it("uses each member's sumInsured when set (Individual)", () => {
    const quote = quoteFromInput(state, {
      policyType: "individual",
      memberCount: 2,
      sumInsured: 500000,
      endDate: "14-10-2026",
      members: [
        {
          name: "Holder",
          dob: "13-10-2000",
          relationship: "self",
          gender: "male",
          addOnRider: 0,
          sumInsured: 500000,
        },
        {
          name: "Member",
          dob: "05-06-1990",
          relationship: "member",
          gender: "female",
          addOnRider: 0,
          sumInsured: 1000000,
        },
      ],
    });

    expect(quote.rows).toHaveLength(2);
    expect(quote.rows[0]?.error).toBeUndefined();
    expect(quote.rows[1]?.error).toBeUndefined();
    // Same age band would still differ by SI column: 18-35 @ 5L vs 36-45 @ 10L
    expect(quote.rows[0]?.basic).toBe(3900); // 18-35 @ 500000
    expect(quote.rows[1]?.basic).toBe(9400); // 36-45 @ 1000000
    expect(quote.basic).toBe(3900 + 9400);
  });

  it("falls back to shared input.sumInsured when member SI omitted", () => {
    const quote = quoteFromInput(state, {
      policyType: "individual",
      memberCount: 2,
      sumInsured: 500000,
      endDate: "14-10-2026",
      members: [
        {
          name: "Holder",
          dob: "13-10-2000",
          relationship: "self",
          gender: "male",
          addOnRider: 0,
        },
        {
          name: "Member",
          dob: "05-06-1990",
          relationship: "member",
          gender: "female",
          addOnRider: 0,
        },
      ],
    });

    expect(quote.rows[0]?.basic).toBe(3900);
    expect(quote.rows[1]?.basic).toBe(5400); // 36-45 @ 500000
  });

  it("recalculates only the row whose SI changed", () => {
    const baseMembers = [
      {
        name: "Holder",
        dob: "13-10-2000",
        relationship: "self" as const,
        gender: "male" as const,
        addOnRider: 0,
        sumInsured: 500000,
      },
      {
        name: "Member",
        dob: "05-06-1990",
        relationship: "member" as const,
        gender: "female" as const,
        addOnRider: 0,
        sumInsured: 500000,
      },
    ];
    const before = quoteFromInput(state, {
      policyType: "individual",
      memberCount: 2,
      sumInsured: 500000,
      endDate: "14-10-2026",
      members: baseMembers,
    });
    const after = quoteFromInput(state, {
      policyType: "individual",
      memberCount: 2,
      sumInsured: 500000,
      endDate: "14-10-2026",
      members: [
        baseMembers[0]!,
        { ...baseMembers[1]!, sumInsured: 300000 },
      ],
    });

    expect(after.rows[0]?.basic).toBe(before.rows[0]?.basic);
    expect(after.rows[1]?.basic).not.toBe(before.rows[1]?.basic);
    expect(after.rows[1]?.basic).toBe(3700); // 36-45 @ 300000
    expect(after.basic).toBe((before.rows[0]?.basic ?? 0) + 3700);
  });
});

describe("calculateAge", () => {
  it("calculates age from DOB and future calculation date", () => {
    expect(calculateAge("21-11-1979", "2028-07-28")).toBe(48);
  });

  it("does not add future years twice", () => {
    const dob = "21-11-1979";
    const currentCalculationDate = "2026-07-28";
    const futureCalculationDate = "2028-07-28";
    const currentAge = calculateAge(dob, currentCalculationDate);
    const futureAge = calculateAge(dob, futureCalculationDate);
    expect(currentAge).toBe(46);
    expect(futureAge).toBe(48);
    expect(futureAge).not.toBe((currentAge ?? 0) + 3);
  });
});
