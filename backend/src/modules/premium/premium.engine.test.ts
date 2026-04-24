import { describe, expect, it } from "vitest";
import { ChartMode } from "@prisma/client";
import { calculatePremium, completedAge } from "./premium.engine.js";
import type { PremiumMatrixJson } from "./premium.types.js";

const holder: PremiumMatrixJson = {
  bands: [
    { label: "0-17", minAge: 0, maxAge: 17 },
    { label: "36-45", minAge: 36, maxAge: 45 },
  ],
  siColumns: [500000],
  matrix: [
    [2300],
    [5700],
  ],
  daughterDiscountPercent: 50,
};

const member: PremiumMatrixJson = {
  bands: [
    { label: "0-17", minAge: 0, maxAge: 17 },
    { label: "36-45", minAge: 36, maxAge: 45 },
  ],
  siColumns: [500000],
  matrix: [
    [2300],
    [4500],
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
});
