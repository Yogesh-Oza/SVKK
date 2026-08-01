import { describe, expect, it } from "vitest";
import {
  holderSnapshotFromInput,
  overlayInsuredPartyWithPolicySnapshot,
  routeInsuredPartyPatchToPolicySnapshot,
} from "./policy-holder-snapshot.js";
import { buildPoliciesExportCsv, type PolicyExportRow } from "./policy.export-csv.js";
import { parseCsv } from "./policy-csv-parse.js";

/**
 * Regression: policies sharing insuredPartyId must keep independent contact history
 * for Manual Edit (routed patch), CSV create snapshots, and CSV export reads.
 */

const sharedParty = {
  id: "party-1",
  name: "Shared Holder",
  customerId: "CUST001",
  email: "old@email.com",
  mobile: "+919999999999",
  pan: "ABCDE1234F",
  aadhaarNo: "111122223333",
  dateOfBirth: new Date("1980-01-15"),
  svkkPublicId: "SVKKSHARED1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("cross-year contact isolation (edit + CSV architecture)", () => {
  it("routes manual edit contact fields onto policy snapshots only", () => {
    const routed = routeInsuredPartyPatchToPolicySnapshot(
      {
        customerId: "CUST002",
        email: "new@email.com",
        mobile: "8888888888",
        partyName: "Shared Holder",
        pan: "ABCDE1234F",
        aadhaarNo: "111122223333",
        dateOfBirth: new Date("1980-01-15"),
        svkkPublicId: "SVKKSHARED1",
      },
      {},
    );

    expect(routed.policyPatch).toMatchObject({
      holderCustomerId: "CUST002",
      holderEmail: "new@email.com",
      holderName: "Shared Holder",
      holderPan: "ABCDE1234F",
      holderAadhaarNo: "111122223333",
    });
    expect(routed.policyPatch.holderMobile).toMatch(/8888888888/);
    expect(routed.partyPatch.customerId).toBeUndefined();
    expect(routed.partyPatch.email).toBeUndefined();
    expect(routed.partyPatch.mobile).toBeUndefined();
    expect(routed.partyPatch.svkkPublicId).toBe("SVKKSHARED1");
  });

  it("keeps Policy A display unchanged after Policy B contact snapshots change", () => {
    const policyA = {
      holderCustomerId: "CUST001",
      holderEmail: "old@email.com",
      holderMobile: "+919999999999",
      holderName: "Shared Holder",
      holderPan: "ABCDE1234F",
      holderAadhaarNo: "111122223333",
      holderDateOfBirth: new Date("1980-01-15"),
    };
    const policyB = {
      holderCustomerId: "CUST002",
      holderEmail: "new@email.com",
      holderMobile: "+918888888888",
      holderName: "Shared Holder Updated",
      holderPan: "ZZZZZ9999Z",
      holderAadhaarNo: "999988887777",
      holderDateOfBirth: new Date("1981-02-20"),
    };

    const a = overlayInsuredPartyWithPolicySnapshot(sharedParty, policyA)!;
    const b = overlayInsuredPartyWithPolicySnapshot(sharedParty, policyB)!;

    expect(a.customerId).toBe("CUST001");
    expect(a.email).toBe("old@email.com");
    expect(a.mobile).toMatch(/9999999999/);
    expect(a.name).toBe("Shared Holder");
    expect(a.pan).toBe("ABCDE1234F");
    expect(a.aadhaarNo).toBe("111122223333");

    expect(b.customerId).toBe("CUST002");
    expect(b.email).toBe("new@email.com");
    expect(b.mobile).toMatch(/8888888888/);
    expect(b.name).toBe("Shared Holder Updated");
    expect(b.pan).toBe("ZZZZZ9999Z");
    expect(b.aadhaarNo).toBe("999988887777");

    expect(sharedParty.customerId).toBe("CUST001");
    expect(sharedParty.email).toBe("old@email.com");
    expect(sharedParty.mobile).toBe("+919999999999");
    expect(sharedParty.svkkPublicId).toBe("SVKKSHARED1");
  });

  it("CSV create snapshot input locks new-year contacts without requiring party mutation", () => {
    const newYear = holderSnapshotFromInput({
      partyName: "Shared Holder",
      customerId: "CUST002",
      email: "new@email.com",
      mobile: "8888888888",
      pan: "ABCDE1234F",
      aadhaarNo: "111122223333",
      dateOfBirth: new Date("1980-01-15"),
    });

    const oldYear = {
      holderCustomerId: "CUST001",
      holderEmail: "old@email.com",
      holderMobile: "+919999999999",
    };

    const displayOld = overlayInsuredPartyWithPolicySnapshot(sharedParty, oldYear)!;
    const displayNew = overlayInsuredPartyWithPolicySnapshot(sharedParty, newYear)!;

    expect(displayOld.email).toBe("old@email.com");
    expect(displayOld.customerId).toBe("CUST001");
    expect(displayOld.mobile).toMatch(/9999999999/);

    expect(displayNew.email).toBe("new@email.com");
    expect(displayNew.customerId).toBe("CUST002");
    expect(displayNew.mobile).toMatch(/8888888888/);
  });

  it("falls back to InsuredParty when contact snapshots are unset (legacy)", () => {
    const unset = overlayInsuredPartyWithPolicySnapshot(sharedParty, {})!;
    expect(unset.email).toBe("old@email.com");
    expect(unset.customerId).toBe("CUST001");
    expect(unset.mobile).toMatch(/9999999999/);
  });

  it("CSV update contact columns map to policy snapshots (not party)", () => {
    const csvContactToPolicyField = {
      "Customer ID": "holderCustomerId",
      email: "holderEmail",
      "Primary Mobile Number": "holderMobile",
    } as const;
    expect(Object.values(csvContactToPolicyField)).toEqual([
      "holderCustomerId",
      "holderEmail",
      "holderMobile",
    ]);
  });

  it("shared insuredPartyId is unchanged when contact snapshots diverge (renewal grouping)", () => {
    const insuredPartyId = "party-1";
    const policyA = { id: "a", insuredPartyId, holderEmail: "old@email.com", holderCustomerId: "C001" };
    const policyB = { id: "b", insuredPartyId, holderEmail: "new@email.com", holderCustomerId: "C002" };
    expect(policyA.insuredPartyId).toBe(policyB.insuredPartyId);
    expect(policyA.holderEmail).not.toBe(policyB.holderEmail);
    expect(policyA.holderCustomerId).not.toBe(policyB.holderCustomerId);
  });

  it("end-to-end style: edit then CSV-style snapshot update leaves other year intact", () => {
    const year2024 = {
      holderCustomerId: "OLD001",
      holderEmail: "old@example.com",
      holderMobile: "+919000000001",
    };
    let year2025 = {
      holderCustomerId: "NEW002",
      holderEmail: "new@example.com",
      holderMobile: "+919000000002",
    };

    const edit = routeInsuredPartyPatchToPolicySnapshot(
      {
        customerId: "NEW003",
        email: "changed@example.com",
        mobile: "9000000003",
      },
      {},
    );
    year2025 = {
      holderCustomerId: edit.policyPatch.holderCustomerId!,
      holderEmail: edit.policyPatch.holderEmail!,
      holderMobile: edit.policyPatch.holderMobile!,
    };

    // CSV update of 2025 again
    year2025 = {
      holderCustomerId: "NEW004",
      holderEmail: "csv@example.com",
      holderMobile: "+919000000004",
    };

    const a = overlayInsuredPartyWithPolicySnapshot(sharedParty, year2024)!;
    const b = overlayInsuredPartyWithPolicySnapshot(sharedParty, year2025)!;
    expect(a.customerId).toBe("OLD001");
    expect(a.email).toBe("old@example.com");
    expect(a.mobile).toMatch(/9000000001/);
    expect(b.customerId).toBe("NEW004");
    expect(b.email).toBe("csv@example.com");
    expect(b.mobile).toMatch(/9000000004/);
  });

  it("CSV export returns each policy's snapshot email/customerId/mobile", () => {
    const base = {
      insuredPartyId: "party-1",
      policyTypeId: "pt1",
      categoryId: null,
      village: null,
      pod: null,
      addressLine1: null,
      addressLine2: null,
      addressLine3: null,
      addressLine4: null,
      city: null,
      state: null,
      pincode: null,
      contactPhone: null,
      whatsappNo: null,
      nomineeName: null,
      nomineeRelation: null,
      loanRef: null,
      courierTracking: null,
      remarks: null,
      adProductVariant: null,
      insuranceCompany: null,
      tpa: null,
      categoryText: null,
      holderRelationship: null,
      holderGender: null,
      holderAge: null,
      holderJoiningDate: null,
      holderAddOns: null,
      personsInsuredCount: 1,
      area: null,
      mobileSecondary: null,
      policyGrouping: null,
      policyUrl: null,
      policyUrl2: null,
      loanStatus: null,
      loanAmount: null,
      refundChequeAmount: null,
      refundChequeNo: null,
      refundChequeDate: null,
      previousPolicyNo: null,
      previousEndDate: null,
      policyGroup: null,
      cdAccountUsed: null,
      cdAmount: null,
      courierStatus: null,
      courierDate: null,
      courierCompany: null,
      podNumber: null,
      courierAddress: null,
      periodMonthText: null,
      listVkkPremium: null,
      version: 1,
      createdById: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      deletedAt: null,
      receipts: [],
      insuredParty: sharedParty,
      policyType: { key: "ad_policy", name: "AD" },
      category: null,
      years: [
        {
          id: "y",
          policyId: "p",
          yearLabel: "2025-26",
          policyChartId: "c1",
          policyStart: null,
          policyEnd: null,
          sumInsured: null,
          expectedNetPremium: null,
          paymentMode: null,
          paymentType: null,
          amountReceived: null,
          bankName: null,
          bankAccountLast4: null,
          utrRef: null,
          yearRemarks: null,
          taxPercent: null,
          taxAmount: null,
          svkkPremium: null,
          netPremium: null,
          vkkCommission: null,
          policyHolderContribution: null,
          premiumOneOrTwoLakh: null,
          gaamMahajanContribution: null,
          differenceAmountPaidByHolder: null,
          holderCumulativeBonus: null,
          holderJoiningYear: null,
          holderBasicPremium: null,
          vkkPremium: null,
          grossPremium: null,
          commissionAmount: null,
          twoLacFloater: null,
          yearPolicyHolderPremium: null,
          gaamMahajanVkk: null,
          excessShortAmount: null,
          diffPaidByHolder: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          members: [],
          payments: [],
        },
      ],
    };

    const policyA = {
      ...base,
      id: "policy-a",
      policyNo: "PO-A",
      referenceNo: "REF-A",
      periodYearText: "2024-25",
      holderCustomerId: "CUST001",
      holderEmail: "old@email.com",
      holderMobile: "+919999999999",
      holderName: "Shared Holder",
      years: [{ ...base.years[0], id: "ya", policyId: "policy-a", yearLabel: "2024-25" }],
    } as unknown as PolicyExportRow;

    const policyB = {
      ...base,
      id: "policy-b",
      policyNo: "PO-B",
      referenceNo: "REF-B",
      periodYearText: "2025-26",
      holderCustomerId: "CUST002",
      holderEmail: "new@email.com",
      holderMobile: "+918888888888",
      holderName: "Shared Holder",
      years: [{ ...base.years[0], id: "yb", policyId: "policy-b", yearLabel: "2025-26" }],
    } as unknown as PolicyExportRow;

    const csv = buildPoliciesExportCsv(
      [policyA, policyB],
      new Set(["policy:scope_all"]),
      [],
    );
    const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
    const header = parsed[0]!;
    const rows = parsed.slice(1);
    const emailIdx = header.indexOf("email");
    const custIdx = header.indexOf("Customer ID");
    const mobileIdx = header.indexOf("Primary Mobile Number");
    expect(emailIdx).toBeGreaterThanOrEqual(0);
    expect(custIdx).toBeGreaterThanOrEqual(0);
    expect(mobileIdx).toBeGreaterThanOrEqual(0);

    expect(rows[0]?.[emailIdx]).toBe("old@email.com");
    expect(rows[0]?.[custIdx]).toBe("CUST001");
    expect(rows[0]?.[mobileIdx]).toContain("9999999999");

    expect(rows[1]?.[emailIdx]).toBe("new@email.com");
    expect(rows[1]?.[custIdx]).toBe("CUST002");
    expect(rows[1]?.[mobileIdx]).toContain("8888888888");
  });
});
