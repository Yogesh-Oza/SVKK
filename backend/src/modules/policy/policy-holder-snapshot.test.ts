import { describe, expect, it } from "vitest";
import {
  holderSnapshotFromInput,
  overlayInsuredPartyWithPolicySnapshot,
  resolvePolicyHolderCustomerId,
  resolvePolicyHolderEmail,
  resolvePolicyHolderMobile,
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
  it("moves holder + contact fields to policy patch and keeps SVKK ID on party", () => {
    const routed = routeInsuredPartyPatchToPolicySnapshot(
      {
        partyName: "Updated Holder",
        dateOfBirth: new Date("1976-09-12"),
        pan: "ABCDE1234F",
        aadhaarNo: "123456789012",
        mobile: "9876543210",
        email: "new@email.com",
        customerId: "PO83197030",
        svkkPublicId: "SVKKKEEP01",
      },
      {},
    );

    expect(routed.policyPatch.holderName).toBe("Updated Holder");
    expect(routed.policyPatch.holderDateOfBirth).toEqual(new Date("1976-09-12"));
    expect(routed.policyPatch.holderPan).toBe("ABCDE1234F");
    expect(routed.policyPatch.holderAadhaarNo).toBe("123456789012");
    expect(routed.policyPatch.holderCustomerId).toBe("PO83197030");
    expect(routed.policyPatch.holderEmail).toBe("new@email.com");
    expect(routed.policyPatch.holderMobile).toMatch(/9876543210/);
    expect(routed.partyPatch.partyName).toBeUndefined();
    expect(routed.partyPatch.mobile).toBeUndefined();
    expect(routed.partyPatch.email).toBeUndefined();
    expect(routed.partyPatch.customerId).toBeUndefined();
    expect(routed.partyPatch.svkkPublicId).toBe("SVKKKEEP01");
  });

  it("stores empty contact snapshots so clear does not fall back to party", () => {
    const routed = routeInsuredPartyPatchToPolicySnapshot(
      { customerId: null, email: "", mobile: "  " },
      {},
    );
    expect(routed.policyPatch.holderCustomerId).toBe("");
    expect(routed.policyPatch.holderEmail).toBe("");
    expect(routed.policyPatch.holderMobile).toBe("");
  });
});

describe("contact snapshot isolation across shared InsuredParty", () => {
  const sharedParty = {
    name: "Shared Holder",
    customerId: "CUST001",
    email: "old@email.com",
    mobile: "9999999999",
    pan: null,
    aadhaarNo: null,
    dateOfBirth: null,
  };

  it("editing policy B contact overlay does not change policy A display", () => {
    const policyA = {
      holderCustomerId: "CUST001",
      holderEmail: "old@email.com",
      holderMobile: "9999999999",
    };
    const policyBAfterEdit = {
      holderCustomerId: "CUST999",
      holderEmail: "new@email.com",
      holderMobile: "8888888888",
    };

    const displayA = overlayInsuredPartyWithPolicySnapshot(sharedParty, policyA);
    const displayB = overlayInsuredPartyWithPolicySnapshot(sharedParty, policyBAfterEdit);

    expect(displayA?.customerId).toBe("CUST001");
    expect(displayA?.email).toBe("old@email.com");
    expect(displayA?.mobile).toMatch(/9999999999/);

    expect(displayB?.customerId).toBe("CUST999");
    expect(displayB?.email).toBe("new@email.com");
    expect(displayB?.mobile).toMatch(/8888888888/);

    // Shared party master unchanged — historical fallback still original.
    expect(sharedParty.customerId).toBe("CUST001");
    expect(sharedParty.email).toBe("old@email.com");
    expect(sharedParty.mobile).toBe("9999999999");
  });

  it("falls back to party when snapshot columns are unset (legacy)", () => {
    expect(resolvePolicyHolderCustomerId({}, sharedParty)).toBe("CUST001");
    expect(resolvePolicyHolderEmail({}, sharedParty)).toBe("old@email.com");
    expect(resolvePolicyHolderMobile({}, sharedParty)).toBe("9999999999");
  });

  it("explicit empty snapshot clears display without reading party", () => {
    expect(resolvePolicyHolderCustomerId({ holderCustomerId: "" }, sharedParty)).toBeNull();
    expect(resolvePolicyHolderEmail({ holderEmail: "" }, sharedParty)).toBeNull();
    expect(resolvePolicyHolderMobile({ holderMobile: "" }, sharedParty)).toBeNull();
  });
});

describe("overlayInsuredPartyWithPolicySnapshot", () => {
  it("returns party fields overridden by policy snapshot including contacts", () => {
    const party = {
      name: "Shared Party",
      dateOfBirth: new Date("1970-01-01"),
      pan: "OLDPAN1111A",
      aadhaarNo: "111111111111",
      customerId: "OLD-CUST",
      email: "old@x.com",
      mobile: "1111111111",
    };
    const overlaid = overlayInsuredPartyWithPolicySnapshot(party, {
      holderName: "2025 Snapshot",
      holderDateOfBirth: new Date("1976-09-12"),
      holderPan: "NEWPA1234B",
      holderAadhaarNo: "999999999999",
      holderCustomerId: "NEW-CUST",
      holderEmail: "new@x.com",
      holderMobile: "2222222222",
    });

    expect(overlaid.name).toBe("2025 Snapshot");
    expect(overlaid.dateOfBirth).toEqual(new Date("1976-09-12"));
    expect(overlaid.pan).toBe("NEWPA1234B");
    expect(overlaid.aadhaarNo).toBe("999999999999");
    expect(overlaid.customerId).toBe("NEW-CUST");
    expect(overlaid.email).toBe("new@x.com");
    expect(overlaid.mobile).toMatch(/2222222222/);
  });
});

describe("holderSnapshotFromInput", () => {
  it("normalizes holder + contact snapshot from create body", () => {
    expect(
      holderSnapshotFromInput({
        partyName: " Kishor ",
        dateOfBirth: new Date("1976-09-12"),
        pan: "abcde1234f",
        aadhaarNo: "1234",
        customerId: " CUST1 ",
        email: " a@b.com ",
        mobile: "9876543210",
      }),
    ).toEqual({
      holderName: "Kishor",
      holderDateOfBirth: new Date("1976-09-12"),
      holderPan: "ABCDE1234F",
      holderAadhaarNo: "1234",
      holderCustomerId: "CUST1",
      holderEmail: "a@b.com",
      holderMobile: expect.stringMatching(/9876543210/),
    });
  });
});
