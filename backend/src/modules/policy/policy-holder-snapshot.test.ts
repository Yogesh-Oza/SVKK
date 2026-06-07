import { describe, expect, it } from "vitest";
import {
  holderSnapshotFromInput,
  overlayInsuredPartyWithPolicySnapshot,
  resolvePolicyHolderName,
  routeInsuredPartyPatchToPolicySnapshot,
} from "./policy-holder-snapshot.js";

describe("resolvePolicyHolderName", () => {
  it("prefers policy snapshot over party name", () => {
    expect(
      resolvePolicyHolderName({ holderName: "New Name 2026" }, { name: "Old Name 2025" }),
    ).toBe("New Name 2026");
  });

  it("falls back to party name when snapshot is empty", () => {
    expect(resolvePolicyHolderName({ holderName: "" }, { name: "Party Name" })).toBe("Party Name");
  });
});

describe("routeInsuredPartyPatchToPolicySnapshot", () => {
  it("moves holder fields to policy patch and keeps identity on party", () => {
    const routed = routeInsuredPartyPatchToPolicySnapshot(
      {
        partyName: "Updated Holder",
        dateOfBirth: new Date("1976-09-12"),
        pan: "ABCDE1234F",
        aadhaarNo: "123456789012",
        mobile: "9876543210",
        customerId: "PO83197030",
      },
      {},
    );

    expect(routed.policyPatch.holderName).toBe("Updated Holder");
    expect(routed.policyPatch.holderDateOfBirth).toEqual(new Date("1976-09-12"));
    expect(routed.policyPatch.holderPan).toBe("ABCDE1234F");
    expect(routed.policyPatch.holderAadhaarNo).toBe("123456789012");
    expect(routed.partyPatch.partyName).toBeUndefined();
    expect(routed.partyPatch.mobile).toBe("9876543210");
    expect(routed.partyPatch.customerId).toBe("PO83197030");
  });
});

describe("overlayInsuredPartyWithPolicySnapshot", () => {
  it("returns party fields overridden by policy snapshot", () => {
    const party = {
      name: "Shared Party",
      dateOfBirth: new Date("1970-01-01"),
      pan: "OLDPAN1111A",
      aadhaarNo: "111111111111",
    };
    const overlaid = overlayInsuredPartyWithPolicySnapshot(party, {
      holderName: "2025 Snapshot",
      holderDateOfBirth: new Date("1976-09-12"),
      holderPan: "NEWPA1234B",
      holderAadhaarNo: "999999999999",
    });

    expect(overlaid.name).toBe("2025 Snapshot");
    expect(overlaid.dateOfBirth).toEqual(new Date("1976-09-12"));
    expect(overlaid.pan).toBe("NEWPA1234B");
    expect(overlaid.aadhaarNo).toBe("999999999999");
  });
});

describe("holderSnapshotFromInput", () => {
  it("normalizes holder snapshot from create body", () => {
    expect(
      holderSnapshotFromInput({
        partyName: " Kishor ",
        dateOfBirth: new Date("1976-09-12"),
        pan: "abcde1234f",
        aadhaarNo: "1234",
      }),
    ).toEqual({
      holderName: "Kishor",
      holderDateOfBirth: new Date("1976-09-12"),
      holderPan: "ABCDE1234F",
      holderAadhaarNo: "1234",
    });
  });
});
