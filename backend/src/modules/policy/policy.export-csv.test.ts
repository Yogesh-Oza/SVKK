import { describe, expect, it } from "vitest";
import {
  buildPoliciesExportCsv,
  pickExportPolicyYear,
  type PolicyExportRow,
} from "./policy.export-csv.js";

function minimalRow(overrides: Partial<PolicyExportRow> = {}): PolicyExportRow {
  return {
    id: "p1",
    insuredPartyId: "ip1",
    policyTypeId: "pt1",
    categoryId: null,
    policyNo: "PN-1",
    village: "V1",
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
    personsInsuredCount: 2,
    area: null,
    referenceNo: "REF-1",
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
    periodYearText: "2026-27",
    periodMonthText: "November",
    listVkkPremium: null,
    version: 1,
    createdById: null,
    createdAt: new Date("2026-05-13T06:44:18.937Z"),
    updatedAt: new Date("2026-05-13T06:47:44.544Z"),
    deletedAt: null,
    insuredParty: {
      id: "ip1",
      customerId: "CUST1",
      mobile: "+919999999999",
      svkkPublicId: "SVKK1",
      name: "Test Holder",
      email: null,
      pan: null,
      aadhaarNo: null,
      dateOfBirth: new Date("2001-05-13T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    policyType: { key: "ad_policy", name: "AD Policy" },
    category: { key: "C", name: "Category C" },
    years: [
      {
        id: "y1",
        policyId: "p1",
        yearLabel: "2026-27",
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
        members: [
          {
            id: "m1",
            policyYearId: "y1",
            name: "Member One",
            dob: new Date("2010-01-15T00:00:00.000Z"),
            relationship: "Son",
            gender: "M",
            riderAmount: null as unknown as import("@prisma/client").Prisma.Decimal,
            sumInsured: null,
            cumulativeBonus: null,
            dateOfJoining: null,
            memberPhone: null,
            addOnsAmount: null,
            basicPremium: null,
            ageAtEntry: 16,
            deletedAt: null,
          },
        ],
        payments: [],
      },
    ],
    ...overrides,
  } as PolicyExportRow;
}

describe("pickExportPolicyYear", () => {
  it("prefers filtered year label when present", () => {
    const years = [
      { ...minimalRow().years[0]!, yearLabel: "2026-27" },
      { ...minimalRow().years[0]!, id: "y0", yearLabel: "2025-26" },
    ];
    const picked = pickExportPolicyYear(years, ["2025-26"]);
    expect(picked?.yearLabel).toBe("2025-26");
  });

  it("uses latest year when no filter matches", () => {
    const years = [
      { ...minimalRow().years[0]!, yearLabel: "2026-27" },
      { ...minimalRow().years[0]!, id: "y0", yearLabel: "2025-26" },
    ];
    const picked = pickExportPolicyYear(years, []);
    expect(picked?.yearLabel).toBe("2026-27");
  });
});

describe("buildPoliciesExportCsv", () => {
  it("includes member columns at the end", () => {
    const csv = buildPoliciesExportCsv([minimalRow()], new Set(["policy:scope_all"]), ["2026-27"]);
    const [headerLine, dataLine] = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(headerLine).toContain("Member 1 Name");
    expect(headerLine).toContain("Member 1 DOB");
    expect(headerLine?.indexOf("Member 1 Name")).toBeGreaterThan(headerLine!.indexOf("Updated at"));
    expect(dataLine).toContain("Member One");
    expect(dataLine).toContain("2010-01-15");
  });
});
