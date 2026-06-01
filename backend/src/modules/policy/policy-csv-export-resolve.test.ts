import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { resolveYearPremiumForExport } from "./policy-csv-export-resolve.js";
import { buildPoliciesExportCsv, type PolicyExportRow } from "./policy.export-csv.js";
import { formatPhoneForCsvExport } from "./policy-csv-utils.js";

function dec(n: string): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function yearSlice(
  overrides: Record<string, unknown> = {},
): PolicyExportRow["years"][number] {
  return {
    id: "y1",
    policyId: "p1",
    yearLabel: "2026-27",
    policyChartId: "c1",
    policyStart: null,
    policyEnd: null,
    sumInsured: null,
    expectedNetPremium: dec("5000"),
    paymentMode: null,
    paymentType: null,
    amountReceived: null,
    bankName: null,
    bankAccountLast4: null,
    utrRef: null,
    yearRemarks: null,
    taxPercent: dec("18"),
    taxAmount: dec("900"),
    svkkPremium: null,
    netPremium: null,
    vkkCommission: dec("200"),
    policyHolderContribution: null,
    premiumOneOrTwoLakh: null,
    gaamMahajanContribution: null,
    differenceAmountPaidByHolder: null,
    holderCumulativeBonus: null,
    holderJoiningYear: null,
    holderBasicPremium: null,
    vkkPremium: dec("5900"),
    grossPremium: dec("5000"),
    commissionAmount: null,
    twoLacFloater: null,
    yearPolicyHolderPremium: null,
    gaamMahajanVkk: dec("100"),
    excessShortAmount: dec("50"),
    diffPaidByHolder: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    members: [],
    payments: [],
    ...overrides,
  } as PolicyExportRow["years"][number];
}

describe("resolveYearPremiumForExport", () => {
  it("falls back svkkPremium from vkkPremium", () => {
    const resolved = resolveYearPremiumForExport(yearSlice());
    expect(resolved.svkkPremium?.toString()).toBe("5900");
  });

  it("falls back netPremium from expectedNetPremium", () => {
    const resolved = resolveYearPremiumForExport(yearSlice());
    expect(resolved.netPremium?.toString()).toBe("5000");
  });

  it("falls back gaamMahajanContribution from gaamMahajanVkk", () => {
    const resolved = resolveYearPremiumForExport(yearSlice());
    expect(resolved.gaamMahajanContribution?.toString()).toBe("100");
  });
});

describe("formatPhoneForCsvExport", () => {
  it("prefixes tab and uses 10-digit local from E.164", () => {
    expect(formatPhoneForCsvExport("+919876543210")).toBe("\t9876543210");
  });

  it("returns empty for blank input", () => {
    expect(formatPhoneForCsvExport("")).toBe("");
    expect(formatPhoneForCsvExport(null)).toBe("");
  });
});

describe("buildPoliciesExportCsv premium and phone", () => {
  it("exports legacy premium fallbacks and tab-prefixed mobile", () => {
    const row = {
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
      contactPhone: "9123456789",
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
      referenceNo: "REF-X",
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
      periodMonthText: null,
      listVkkPremium: null,
      version: 1,
      createdById: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedAt: null,
      insuredParty: {
        id: "ip1",
        customerId: "C1",
        mobile: "+919876543210",
        svkkPublicId: "SVKK-1",
        name: "Holder",
        email: null,
        pan: null,
        aadhaarNo: null,
        dateOfBirth: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      policyType: { key: "ad_policy", name: "AD" },
      category: null,
      years: [yearSlice()],
    } as PolicyExportRow;

    const csv = buildPoliciesExportCsv([row], new Set(["policy:scope_all"]), ["2026-27"]);
    const dataLine = csv.replace(/^\uFEFF/, "").split("\r\n")[1] ?? "";

    expect(dataLine).toContain(",5900,");
    expect(dataLine).toContain(",100,");
    expect(dataLine).toContain("\t9876543210");
    expect(dataLine).not.toMatch(/9\.\d+E\+09/i);
  });
});
