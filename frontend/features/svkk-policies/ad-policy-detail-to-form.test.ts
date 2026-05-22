import { describe, expect, it } from "vitest";
import { monthFromReferenceNo, policyDetailToAdFormValues } from "./ad-policy-detail-to-form";
import { resolveAdProductFormValue } from "./ad-product-variant";

describe("monthFromReferenceNo", () => {
  it("parses JAN from NVKK reference", () => {
    expect(monthFromReferenceNo("NVKK2026JAN0003")).toBe("January");
  });
});

describe("resolveAdProductFormValue", () => {
  it("maps ASHA_KIRAN variant to Asha-Kiran", () => {
    expect(resolveAdProductFormValue("ASHA_KIRAN", "AD Policy", "ad_policy")).toBe("Asha-Kiran");
  });
});

describe("policyDetailToAdFormValues", () => {
  it("maps periodMonthText and adProductVariant for edit form selects", () => {
    const values = policyDetailToAdFormValues({
      id: "p1",
      policyNo: "PO-1",
      referenceNo: "RTY2025MAR0021",
      village: "Bharudia",
      area: "Byculla",
      remarks: null,
      adProductVariant: "ASHA_KIRAN",
      insuranceCompany: "NIA",
      tpa: "MD India",
      categoryText: "d",
      holderRelationship: "Self",
      holderGender: "M",
      holderAge: 62,
      personsInsuredCount: 2,
      policyGrouping: "RTY",
      periodYearText: "2025-26",
      periodMonthText: "January",
      insuredParty: {
        svkkPublicId: "RTYMAR0021",
        name: "Holder",
        customerId: "1H4144945",
        mobile: "+919535130822",
        email: null,
        pan: null,
        aadhaarNo: null,
        dateOfBirth: "1963-12-20T00:00:00.000Z",
      },
      policyType: { id: "t1", name: "AD Policy", key: "ad_policy" },
      category: null,
      years: [
        {
          id: "y1",
          yearLabel: "2025-26",
          policyStart: "2026-04-05T00:00:00.000Z",
          policyEnd: "2027-04-04T00:00:00.000Z",
          sumInsured: "500000",
          vkkPremium: "51019",
          members: [],
        },
      ],
    } as Parameters<typeof policyDetailToAdFormValues>[0]);

    expect(values.adProduct).toBe("Asha-Kiran");
    expect(values.month).toBe("January");
    expect(values.cat).toBe("d");
    expect(values.svkkPublicId).toBe("RTYMAR0021");
    expect(values.refNo).toBe("RTY2025MAR0021");
    expect(values.policyGroup).toBe("RTY");
    expect(values.policyGrouping).toBe("RTY");
  });

  it("maps policyGrouping into policyGroup when policyGroup column is empty", () => {
    const values = policyDetailToAdFormValues({
      id: "p2",
      policyNo: null,
      referenceNo: null,
      village: "V",
      area: null,
      remarks: null,
      adProductVariant: null,
      insuranceCompany: null,
      tpa: null,
      categoryText: null,
      holderRelationship: null,
      holderGender: null,
      holderAge: null,
      personsInsuredCount: 1,
      policyGrouping: "NVKK",
      policyGroup: null,
      periodYearText: "2026",
      periodMonthText: null,
      insuredParty: {
        svkkPublicId: "x",
        name: "H",
        customerId: null,
        mobile: null,
        email: null,
        pan: null,
        aadhaarNo: null,
        dateOfBirth: null,
      },
      policyType: { id: "t1", name: "AD", key: "ad" },
      category: null,
      years: [{ id: "y1", yearLabel: "2026", sumInsured: "100000", vkkPremium: "1", members: [] }],
    } as Parameters<typeof policyDetailToAdFormValues>[0]);

    expect(values.policyGroup).toBe("NVKK");
  });
});
