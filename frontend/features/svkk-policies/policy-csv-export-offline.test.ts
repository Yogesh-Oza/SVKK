import { describe, expect, it } from "vitest";
import type { SvkkPolicyDetailForForm } from "./ad-policy-detail-to-form";
import { buildOfflinePoliciesCsv } from "./policy-csv-export-offline";
import type { OfflinePolicyListRow } from "@/lib/svkk/offline/types";

function listRow(partial: Partial<OfflinePolicyListRow> & { id: string; svkkId: string }): OfflinePolicyListRow {
  return {
    id: partial.id,
    svkkId: partial.svkkId,
    policyNo: partial.policyNo ?? "PN-1",
    holderName: partial.holderName ?? "Alice",
    mobile: partial.mobile ?? "9876543210",
    email: partial.email ?? "a@example.com",
    pan: partial.pan ?? null,
    village: partial.village ?? "Village A",
    area: partial.area ?? "Area 1",
    yearLabel: partial.yearLabel ?? "2025-26",
    periodMonthText: partial.periodMonthText ?? "June",
    periodYearText: partial.periodYearText ?? "2025-26",
    customerId: partial.customerId ?? "C1",
    previousPolicyNo: partial.previousPolicyNo ?? null,
    referenceNo: partial.referenceNo ?? "REF001",
    vkkPremium: partial.vkkPremium ?? "12000",
    sumInsured: partial.sumInsured ?? "500000",
    policyTypeId: partial.policyTypeId ?? "pt1",
    policyTypeName: partial.policyTypeName ?? "Family Floater",
    policyTypeKey: partial.policyTypeKey ?? "family_floater",
    categoryId: partial.categoryId ?? "cat1",
    categoryKey: partial.categoryKey ?? "B",
    categoryName: partial.categoryName ?? "Category B",
    categoryText: partial.categoryText ?? "Category B",
    remarks: partial.remarks ?? null,
    personsInsuredCount: partial.personsInsuredCount ?? 2,
    whatsappNo: partial.whatsappNo ?? null,
    policyGrouping: partial.policyGrouping ?? "NVKK",
    adProductVariant: partial.adProductVariant ?? null,
    createdAt: partial.createdAt ?? "2026-06-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-06-01T00:00:00.000Z",
    deletedAt: partial.deletedAt ?? null,
  };
}

function detail(id: string): SvkkPolicyDetailForForm {
  return {
    id,
    updatedAt: "2026-06-01T00:00:00.000Z",
    policyNo: "PN-1",
    village: "Village A",
    insuranceCompany: "Demo Co",
    tpa: "Demo TPA",
    personsInsuredCount: 2,
    policyGrouping: "NVKK",
    policyUrl: "https://example.com/policy.pdf",
    policyUrl2: null,
    addressLine1: "House 1",
    addressLine2: "Street",
    addressLine3: null,
    addressLine4: null,
    area: "Area 1",
    city: "City",
    pincode: "400001",
    nomineeName: "Nom",
    nomineeRelation: "Spouse",
    nomineeDateOfBirth: "1990-01-01",
    contactPhone: "9123456789",
    remarks: "General Remark:\nhello",
    referenceNo: "REF001",
    periodYearText: "2025-26",
    periodMonthText: "June",
    holderRelationship: "Self",
    holderGender: "F",
    holderName: "Alice",
    holderJoiningDate: "2018-04-01",
    holderAge: 40,
    holderAddOns: null,
    categoryText: "Category B",
    mobileSecondary: null,
    loanStatus: null,
    loanAmount: null,
    previousPolicyNo: null,
    previousEndDate: null,
    policyGroup: "NVKK",
    refundChequeAmount: null,
    refundChequeNo: null,
    refundChequeDate: null,
    cdAccountUsed: false,
    cdAmount: null,
    courierStatus: "YES",
    courierDate: null,
    courierCompany: null,
    podNumber: null,
    courierAddress: null,
    insuredParty: {
      svkkPublicId: "SVKK100",
      name: "Alice",
      mobile: "9876543210",
      email: "a@example.com",
      customerId: "C1",
      pan: "ABCDE1234F",
      aadhaarNo: "123412341234",
      dateOfBirth: "1985-05-05",
    },
    policyType: { id: "pt1", name: "Family Floater", key: "family_floater" },
    category: { key: "B", name: "Category B" },
    years: [
      {
        yearLabel: "2025-26",
        policyStart: "2025-04-01",
        policyEnd: "2026-03-31",
        sumInsured: "500000",
        expectedNetPremium: "11000",
        vkkPremium: "12000",
        grossPremium: "13000",
        commissionAmount: "500",
        twoLacFloater: "0",
        yearPolicyHolderPremium: "10000",
        gaamMahajanVkk: "0",
        excessShortAmount: "0",
        diffPaidByHolder: "0",
        holderCumulativeBonus: "0",
        holderJoiningYear: "2018-19",
        holderBasicPremium: "9000",
        payments: [
          {
            method: "UPI",
            amount: "12000",
            transactionNumber: "TXN1",
            transactionDate: "2025-04-02",
            accountNumber: "9876543210",
            cheque: null,
          },
        ],
        members: [
          {
            name: "Bob",
            relationship: "Son",
            dob: "2010-01-01",
            gender: "M",
            sumInsured: "500000",
            cumulativeBonus: "0",
            dateOfJoining: "2020-04-01",
            memberPhone: "9000000000",
            addOnsAmount: "0",
            basicPremium: "2000",
            ageAtEntry: 10,
          },
        ],
      },
    ],
  };
}

describe("buildOfflinePoliciesCsv", () => {
  it("exports selected fields from cached detail", () => {
    const csv = buildOfflinePoliciesCsv({
      rows: [listRow({ id: "p1", svkkId: "SVKK100" })],
      detailsById: new Map([["p1", detail("p1")]]),
      selectedUiKeys: ["SVKK ID", "Holder name", "members:Name", "payments:method"],
    });
    const [header, row] = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(header).toContain("SVKK ID");
    expect(header).toContain("Holder name");
    expect(header).toContain("Member 1 Name");
    expect(header).toContain("Payment 1 Mode of Payment");
    expect(header).not.toContain("Village");
    expect(row).toContain("SVKK100");
    expect(row).toContain("Alice");
    expect(row).toContain("Bob");
    expect(row).toContain("UPI");
  });

  it("falls back to list-row fields when detail is missing", () => {
    const csv = buildOfflinePoliciesCsv({
      rows: [listRow({ id: "p1", svkkId: "SVKK100", village: "Village A" })],
      detailsById: new Map(),
      selectedUiKeys: ["SVKK ID", "Village"],
    });
    const [, row] = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(row).toContain("SVKK100");
    expect(row).toContain("Village A");
  });

  it("omits commission columns without permission", () => {
    const csv = buildOfflinePoliciesCsv({
      rows: [listRow({ id: "p1", svkkId: "SVKK100" })],
      detailsById: new Map([["p1", detail("p1")]]),
      includeCommission: false,
    });
    expect(csv).not.toContain("VKK commission");
    expect(csv).not.toContain("Commission amount");
  });
});
