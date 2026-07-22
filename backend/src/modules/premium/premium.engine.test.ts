import { describe, expect, it } from "vitest";
import { ChartMode } from "@prisma/client";
import { calculatePremium, completedAge } from "./premium.engine.js";
import type { PremiumMatrixJson } from "./premium.types.js";

const holder: PremiumMatrixJson = {
  bands: [
    { label: "0-17", minAge: 0, maxAge: 17 },
    { label: "36-45", minAge: 36, maxAge: 45 },
  ],
  siColumns: [300000, 500000, 1000000],
  matrix: [
    [1500, 2300, 4100],
    [3100, 5700, 9800],
  ],
  daughterDiscountPercent: 50,
};

const member: PremiumMatrixJson = {
  bands: [
    { label: "0-17", minAge: 0, maxAge: 17 },
    { label: "36-45", minAge: 36, maxAge: 45 },
  ],
  siColumns: [300000, 500000, 1000000],
  matrix: [
    [1500, 2300, 4100],
    [3100, 4500, 7900],
  ],
  daughterDiscountPercent: 50,
};

describe("completedAge", () => {
  it("matches completed years on reference date", () => {
    const end = new Date("2026-10-14T00:00:00.000Z");
    const dob = new Date("1987-10-13T00:00:00.000Z");
    expect(completedAge(dob, end)).toBe(39);
  });
});

describe("calculatePremium", () => {
  it("matches Asha Kiran style sample (approximate chart numbers)", () => {
    const end = new Date("2026-10-14T00:00:00.000Z");
    const res = calculatePremium({
      chartMode: ChartMode.HOLDER_MEMBER,
      holderChart: holder,
      memberChart: member,
      policyEnd: end,
      sumInsured: 500000,
      members: [
        {
          name: "Policy Holder",
          dob: new Date("1987-10-13"),
          relationship: "self",
          gender: "male",
          riderAmount: 0,
        },
        {
          name: "Spouse",
          dob: new Date("1990-06-05"),
          relationship: "spouse",
          gender: "female",
          riderAmount: 0,
        },
        {
          name: "Daughter",
          dob: new Date("2014-08-11"),
          relationship: "daughter",
          gender: "female",
          riderAmount: 0,
        },
      ],
    });

    expect(res.lines).toHaveLength(3);
    expect(res.grossPremium).toBe(12500);
    expect(res.discountTotal).toBe(1150);
    expect(res.netPremium).toBe(11350);
  });

  it("uses per-member sumInsured when provided", () => {
    const end = new Date("2026-10-14T00:00:00.000Z");
    const res = calculatePremium({
      chartMode: ChartMode.SINGLE,
      holderChart: holder,
      memberChart: null,
      policyEnd: end,
      sumInsured: 500000,
      members: [
        {
          name: "Holder",
          dob: new Date("1987-10-13"),
          relationship: "self",
          gender: "male",
          sumInsured: 500000,
        },
        {
          name: "Parent",
          dob: new Date("1985-10-13"),
          relationship: "parent",
          gender: "male",
          sumInsured: 1000000,
        },
      ],
    });

    expect(res.lines[0]?.basic).toBe(5700); // 36-45 @ 500000
    expect(res.lines[1]?.basic).toBe(9800); // 36-45 @ 1000000
    expect(res.basicPremium).toBe(5700 + 9800);
  });

  it("falls back to shared sumInsured when member SI omitted", () => {
    const end = new Date("2026-10-14T00:00:00.000Z");
    const res = calculatePremium({
      chartMode: ChartMode.SINGLE,
      holderChart: holder,
      memberChart: null,
      policyEnd: end,
      sumInsured: 500000,
      members: [
        {
          name: "Holder",
          dob: new Date("1987-10-13"),
          relationship: "self",
          gender: "male",
        },
        {
          name: "Parent",
          dob: new Date("1985-10-13"),
          relationship: "parent",
          gender: "male",
        },
      ],
    });

    expect(res.lines[0]?.basic).toBe(5700);
    expect(res.lines[1]?.basic).toBe(5700);
    expect(res.basicPremium).toBe(11400);
  });

  it("recalculates only the line whose SI changed", () => {
    const end = new Date("2026-10-14T00:00:00.000Z");
    const base = {
      chartMode: ChartMode.SINGLE as const,
      holderChart: holder,
      memberChart: null,
      policyEnd: end,
      sumInsured: 500000,
    };
    const before = calculatePremium({
      ...base,
      members: [
        {
          name: "Holder",
          dob: new Date("1987-10-13"),
          relationship: "self",
          gender: "male",
          sumInsured: 500000,
        },
        {
          name: "Parent",
          dob: new Date("1985-10-13"),
          relationship: "parent",
          gender: "male",
          sumInsured: 500000,
        },
      ],
    });
    const after = calculatePremium({
      ...base,
      members: [
        {
          name: "Holder",
          dob: new Date("1987-10-13"),
          relationship: "self",
          gender: "male",
          sumInsured: 500000,
        },
        {
          name: "Parent",
          dob: new Date("1985-10-13"),
          relationship: "parent",
          gender: "male",
          sumInsured: 300000,
        },
      ],
    });

    expect(after.lines[0]?.basic).toBe(before.lines[0]?.basic);
    expect(after.lines[1]?.basic).toBe(3100); // 36-45 @ 300000
    expect(after.lines[1]?.basic).not.toBe(before.lines[1]?.basic);
  });
});
