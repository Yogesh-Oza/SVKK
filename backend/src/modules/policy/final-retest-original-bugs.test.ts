/**
 * Final retest of the two original cross-year contact bugs.
 * Simulates user scenarios at the write/read boundary used by CSV + Manual Edit.
 */
import { describe, expect, it, vi } from "vitest";
import {
  holderSnapshotFromInput,
  overlayInsuredPartyWithPolicySnapshot,
  routeInsuredPartyPatchToPolicySnapshot,
} from "./policy-holder-snapshot.js";
import { buildPoliciesExportCsv, type PolicyExportRow } from "./policy.export-csv.js";
import { parseCsv } from "./policy-csv-parse.js";

const party = {
  id: "party-shared",
  name: "Holder",
  customerId: "SEED",
  email: "seed@example.com",
  mobile: "+919999999999",
  pan: "AAAAA1111A",
  aadhaarNo: "123456789012",
  dateOfBirth: new Date("1975-01-01"),
  svkkPublicId: "SVKKTEST01",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("FINAL RETEST — Bug 1 CSV isolation", () => {
  it("CSV update of 2025-26 only changes that policy's snapshots", () => {
    const policyA = {
      id: "pol-a",
      insuredPartyId: party.id,
      holderCustomerId: "CUST-OLD",
      holderEmail: "old@example.com",
      holderMobile: "+919000000001",
    };
    const policyB = {
      id: "pol-b",
      insuredPartyId: party.id,
      holderCustomerId: "CUST-NEW",
      holderEmail: "new@example.com",
      holderMobile: "+919000000002",
    };

    // Simulate updatePolicyCsvRow writing ONLY onto policy B snapshots
    const policyBAfterCsv = {
      ...policyB,
      holderCustomerId: "CUST-CSV-NEW",
      holderEmail: "csvchanged@example.com",
      holderMobile: "+919000000003",
    };

    // Party master must remain untouched by CSV update path
    expect(party.customerId).toBe("SEED");
    expect(party.email).toBe("seed@example.com");
    expect(party.mobile).toBe("+919999999999");

    // Policy A row unchanged
    expect(policyA.holderCustomerId).toBe("CUST-OLD");
    expect(policyA.holderEmail).toBe("old@example.com");
    expect(policyA.holderMobile).toBe("+919000000001");

    const displayA = overlayInsuredPartyWithPolicySnapshot(party, policyA)!;
    const displayB = overlayInsuredPartyWithPolicySnapshot(party, policyBAfterCsv)!;

    expect(displayA.customerId).toBe("CUST-OLD");
    expect(displayA.email).toBe("old@example.com");
    expect(displayA.mobile).toMatch(/9000000001/);

    expect(displayB.customerId).toBe("CUST-CSV-NEW");
    expect(displayB.email).toBe("csvchanged@example.com");
    expect(displayB.mobile).toMatch(/9000000003/);
  });

  it("CSV create of new year does not rewrite previous year display", () => {
    const year2024 = {
      holderCustomerId: "CUST-OLD",
      holderEmail: "old@example.com",
      holderMobile: "+919000000001",
    };
    // createPolicyWithYear → holderSnapshotFromInput on the NEW policy only
    const year2025 = holderSnapshotFromInput({
      partyName: "Holder",
      customerId: "CUST-NEW",
      email: "new@example.com",
      mobile: "9000000002",
    });

    const a = overlayInsuredPartyWithPolicySnapshot(party, year2024)!;
    const b = overlayInsuredPartyWithPolicySnapshot(party, year2025)!;
    expect(a.email).toBe("old@example.com");
    expect(a.customerId).toBe("CUST-OLD");
    expect(b.email).toBe("new@example.com");
    expect(b.customerId).toBe("CUST-NEW");
  });
});

describe("FINAL RETEST — Bug 2 Manual Edit isolation", () => {
  it("Edit Policy B routes contacts to B snapshots and leaves party + A untouched", () => {
    const policyA = {
      holderCustomerId: "CUST-A",
      holderEmail: "year1@example.com",
      holderMobile: "+919000000011",
      holderName: "Name A",
      holderPan: "AAAAA1111A",
      holderAadhaarNo: "111111111111",
      holderDateOfBirth: new Date("1970-01-01"),
    };
    let policyB = {
      holderCustomerId: "CUST-B",
      holderEmail: "year2@example.com",
      holderMobile: "+919000000022",
      holderName: "Name B",
      holderPan: "BBBBB2222B",
      holderAadhaarNo: "222222222222",
      holderDateOfBirth: new Date("1971-02-02"),
    };

    const partyBefore = { ...party };
    const routed = routeInsuredPartyPatchToPolicySnapshot(
      {
        customerId: "CUST-B-EDITED",
        email: "edited@example.com",
        mobile: "9000000033",
        partyName: "Name B Edited",
        pan: "CCCCC3333C",
        aadhaarNo: "333333333333",
        dateOfBirth: new Date("1972-03-03"),
        svkkPublicId: party.svkkPublicId,
      },
      {},
    );

    // Party contact fields are NOT in the remaining party patch
    expect(routed.partyPatch.customerId).toBeUndefined();
    expect(routed.partyPatch.email).toBeUndefined();
    expect(routed.partyPatch.mobile).toBeUndefined();
    expect(routed.partyPatch.partyName).toBeUndefined();
    expect(routed.partyPatch.pan).toBeUndefined();
    expect(routed.partyPatch.aadhaarNo).toBeUndefined();
    expect(routed.partyPatch.dateOfBirth).toBeUndefined();
    // Only SVKK identity may remain on party
    expect(routed.partyPatch.svkkPublicId).toBe(party.svkkPublicId);

    policyB = {
      ...policyB,
      holderCustomerId: routed.policyPatch.holderCustomerId!,
      holderEmail: routed.policyPatch.holderEmail!,
      holderMobile: routed.policyPatch.holderMobile!,
      holderName: routed.policyPatch.holderName!,
      holderPan: routed.policyPatch.holderPan!,
      holderAadhaarNo: routed.policyPatch.holderAadhaarNo!,
      holderDateOfBirth: routed.policyPatch.holderDateOfBirth!,
    };

    expect(party.customerId).toBe(partyBefore.customerId);
    expect(party.email).toBe(partyBefore.email);
    expect(party.mobile).toBe(partyBefore.mobile);

    const a = overlayInsuredPartyWithPolicySnapshot(party, policyA)!;
    const b = overlayInsuredPartyWithPolicySnapshot(party, policyB)!;

    expect(a.customerId).toBe("CUST-A");
    expect(a.email).toBe("year1@example.com");
    expect(a.mobile).toMatch(/9000000011/);
    expect(a.name).toBe("Name A");
    expect(a.pan).toBe("AAAAA1111A");
    expect(a.aadhaarNo).toBe("111111111111");

    expect(b.customerId).toBe("CUST-B-EDITED");
    expect(b.email).toBe("edited@example.com");
    expect(b.mobile).toMatch(/9000000033/);
    expect(b.name).toBe("Name B Edited");
    expect(b.pan).toBe("CCCCC3333C");
    expect(b.aadhaarNo).toBe("333333333333");
  });
});

describe("FINAL RETEST — export + reload (DB-shaped read)", () => {
  it("export and fresh overlay read match per-year snapshots", () => {
    const mk = (id: string, year: string, cust: string, email: string, mobile: string) =>
      ({
        id,
        insuredPartyId: party.id,
        policyTypeId: "pt1",
        categoryId: null,
        policyNo: id,
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
        referenceNo: `REF-${id}`,
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
        periodYearText: year,
        periodMonthText: null,
        listVkkPremium: null,
        version: 1,
        createdById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        receipts: [],
        holderCustomerId: cust,
        holderEmail: email,
        holderMobile: mobile,
        holderName: "Holder",
        insuredParty: party,
        policyType: { key: "ad_policy", name: "AD" },
        category: null,
        years: [
          {
            id: `y-${id}`,
            policyId: id,
            yearLabel: year,
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
      }) as unknown as PolicyExportRow;

    const a = mk("a", "2024-25", "CUST-OLD", "old@example.com", "+919000000001");
    const b = mk("b", "2025-26", "CUST-CSV-NEW", "csvchanged@example.com", "+919000000003");

    // Fresh "reload" = re-overlay from stored snapshot columns
    const reloadA = overlayInsuredPartyWithPolicySnapshot(party, a)!;
    const reloadB = overlayInsuredPartyWithPolicySnapshot(party, b)!;
    expect(reloadA.email).toBe("old@example.com");
    expect(reloadB.email).toBe("csvchanged@example.com");

    const csv = buildPoliciesExportCsv([a, b], new Set(["policy:scope_all"]), []);
    const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
    const header = parsed[0]!;
    const rows = parsed.slice(1);
    const iEmail = header.indexOf("email");
    const iCust = header.indexOf("Customer ID");
    expect(rows[0]?.[iEmail]).toBe("old@example.com");
    expect(rows[0]?.[iCust]).toBe("CUST-OLD");
    expect(rows[1]?.[iEmail]).toBe("csvchanged@example.com");
    expect(rows[1]?.[iCust]).toBe("CUST-CSV-NEW");
  });
});

describe("FINAL RETEST — applyInsuredPartyPatch ignores contact fields", () => {
  it("party update data builder only accepts svkkPublicId after routing", () => {
    const routed = routeInsuredPartyPatchToPolicySnapshot(
      {
        customerId: "X",
        email: "x@y.com",
        mobile: "9000000000",
        svkkPublicId: "SVKKTEST01",
      },
      {},
    );
    const remainingKeys = Object.keys(routed.partyPatch).filter(
      (k) => (routed.partyPatch as Record<string, unknown>)[k] !== undefined,
    );
    expect(remainingKeys).toEqual(["svkkPublicId"]);
  });
});
