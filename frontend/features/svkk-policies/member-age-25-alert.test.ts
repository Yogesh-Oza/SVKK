import { describe, expect, it } from "vitest";
import type { AdMemberRow } from "./ad-member-types";
import {
  buildMemberAge25AlertMessage,
  membersNeedingAge25Alert,
  resolveMemberAge,
} from "./member-age-25-alert";

function member(partial: Partial<AdMemberRow>): AdMemberRow {
  return {
    name: "",
    relationship: "",
    dob: "",
    age: "",
    dateOfJoining: "",
    sumInsured: "",
    cumulativeBonus: "",
    phNo: "",
    addOnsAmount: "",
    basicPremium: "",
    gender: "M",
    ...partial,
  };
}

describe("member age 25 alert", () => {
  it("flags members aged 25 or older", () => {
    const names = membersNeedingAge25Alert(
      [member({ name: "Ravi", age: "25" }), member({ name: "Anita", age: "24" })],
      "2026-05-01",
    );
    expect(names).toEqual(["Ravi"]);
  });

  it("derives age from DOB when age field is empty", () => {
    const age = resolveMemberAge(
      member({ dob: "2000-06-01", age: "" }),
      "2026-06-01",
    );
    expect(age).toBe(26);
  });

  it("formats the alert message for a single member", () => {
    const message = buildMemberAge25AlertMessage(
      [member({ name: "Ravi Kumar", age: "27" })],
      "2026-05-01",
    );
    expect(message).toBe(
      "Ravi Kumar is now over 25 so need to take action - new policy or make him policy holder",
    );
  });

  it("uses exact copy for members aged exactly 25", () => {
    const message = buildMemberAge25AlertMessage(
      [member({ name: "Demo Member One", age: "25" })],
      "2026-05-01",
    );
    expect(message).toBe(
      "Demo Member One is now 25 so need to take action - new policy or make him policy holder",
    );
  });
});
