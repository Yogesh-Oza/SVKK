import { describe, expect, it } from "vitest";
import { compressListRow, expandDetail } from "./compress";

describe("offline compress", () => {
  it("compresses list row fields", () => {
    const row = compressListRow({
      id: "p1",
      policyNo: "PN-1",
      holderName: "Test Holder",
      periodYearText: "2025-26",
      periodMonthText: "July",
      village: "V1",
      updatedAt: "2026-06-24T10:00:00.000Z",
      createdAt: "2026-06-20T10:00:00.000Z",
      referenceNo: "REF-1",
      vkkPremium: "12000",
      sumInsured: "500000",
      policyType: { id: "pt1", name: "Family Floater", key: "family_floater" },
      category: { id: "c1", key: "B", name: "Category B" },
      categoryText: "Category B",
      insuredParty: {
        svkkPublicId: "SVKK001",
        name: "Test Holder",
        mobile: "9999999999",
        customerId: "C1",
      },
    });
    expect(row.svkkId).toBe("SVKK001");
    expect(row.yearLabel).toBe("2025-26");
    expect(row.periodMonthText).toBe("July");
    expect(row.policyTypeName).toBe("Family Floater");
    expect(row.categoryName).toBe("Category B");
    expect(row.vkkPremium).toBe("12000");
  });

  it("expandDetail returns same form shape", () => {
    const detail = {
      id: "p1",
      updatedAt: "2026-06-24T10:00:00.000Z",
      policyNo: null,
      village: null,
      insuranceCompany: null,
      tpa: null,
      personsInsuredCount: null,
      policyGrouping: null,
      policyUrl: null,
      policyUrl2: null,
      addressLine1: null,
      addressLine2: null,
      addressLine3: null,
      addressLine4: null,
      area: null,
      city: null,
      pincode: null,
      nomineeName: null,
      nomineeRelation: null,
      contactPhone: null,
      remarks: null,
      referenceNo: null,
      periodYearText: null,
      periodMonthText: null,
      holderRelationship: null,
      holderGender: null,
      holderJoiningDate: null,
      holderAge: null,
      holderAddOns: null,
      categoryText: null,
      mobileSecondary: null,
      loanStatus: null,
      loanAmount: null,
      previousPolicyNo: null,
      previousEndDate: null,
      policyGroup: null,
      refundChequeAmount: null,
      refundChequeNo: null,
      refundChequeDate: null,
      cdAccountUsed: null,
      cdAmount: null,
      courierStatus: null,
      courierDate: null,
      courierCompany: null,
      podNumber: null,
      courierAddress: null,
      insuredParty: {
        svkkPublicId: "SVKK001",
        name: "Test",
        mobile: "999",
        email: null,
        customerId: null,
        pan: null,
        aadhaarNo: null,
        dateOfBirth: null,
      },
      category: null,
      years: [],
    };
    expect(expandDetail(detail).id).toBe("p1");
  });
});
