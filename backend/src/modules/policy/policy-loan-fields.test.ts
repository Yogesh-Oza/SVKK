import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createPolicyBodySchema, patchPolicyBodySchema } from "./policy.schemas.js";
import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import { parseOptionalDecimal } from "./policy-csv-create.js";
import { buildPolicyCsvSample, buildPolicyCsvSampleHeaders } from "./policy-csv-format.js";
import { parseCsv } from "./policy-csv-parse.js";
import { buildPoliciesExportCsv, type PolicyExportRow } from "./policy.export-csv.js";
import { fmtCsvDecimal } from "./policy-csv-utils.js";

const minimalCreateBody = {
  mobile: "9999999999",
  partyName: "Test Holder",
  email: "test@example.com",
  policyTypeId: "ptype-1",
  policyChartId: "chart-1",
  yearLabel: "2025-26",
  sumInsured: 100000,
  village: "test-village",
  whatsappNo: "9999999999",
  area: "test-area",
  personsInsuredCount: 1,
  periodMonthText: "January",
  members: [],
};

function exportRow(overrides: Partial<PolicyExportRow> = {}): PolicyExportRow {
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
    nomineeDateOfBirth: null,
    loanRef: null,
    courierTracking: null,
    remarks: null,
    adProductVariant: null,
    insuranceCompany: null,
    tpa: null,
    categoryText: null,
    holderRelationship: null,
    holderGender: null,
    holderName: null,
    holderDateOfBirth: null,
    holderPan: null,
    holderAadhaarNo: null,
    holderCustomerId: null,
    holderEmail: null,
    holderMobile: null,
    holderAge: null,
    holderJoiningDate: null,
    holderAddOns: null,
    personsInsuredCount: 1,
    area: null,
    referenceNo: "REF-1",
    mobileSecondary: null,
    policyGrouping: null,
    policyUrl: null,
    policyUrl2: null,
    loanStatus: "YES",
    loanAmount: new Prisma.Decimal(10000),
    loanRepaymentAmount: new Prisma.Decimal(2000),
    loanPendingAmount: new Prisma.Decimal(8000),
    policyBankHolderName: null,
    policyBankAccountNo: null,
    policyBankIfsc: null,
    policyBankBranch: null,
    policyBankName: null,
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
    periodYearText: "2025-26",
    periodMonthText: "April",
    listVkkPremium: null,
    version: 1,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    receipts: [],
    insuredParty: {
      id: "ip-shared",
      customerId: "CUST1",
      mobile: "+919999999999",
      svkkPublicId: "SVKK1",
      name: "Shared Holder",
      email: null,
      pan: null,
      aadhaarNo: null,
      dateOfBirth: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    policyType: { key: "ad_policy", name: "AD Policy" },
    category: null,
    years: [
      {
        id: "y1",
        policyId: "p1",
        yearLabel: "2025-26",
        policyStart: null,
        policyEnd: null,
        sumInsured: new Prisma.Decimal(100000),
        expectedNetPremium: null,
        policyChartId: null,
        holderCumulativeBonus: null,
        holderJoiningYear: null,
        holderBasicPremium: null,
        grossPremium: null,
        taxPercent: null,
        taxAmount: null,
        svkkPremium: null,
        netPremium: null,
        vkkCommission: null,
        commissionAmount: null,
        yearPolicyHolderPremium: null,
        twoLacFloater: null,
        gaamMahajanContribution: null,
        excessShortAmount: null,
        diffPaidByHolder: null,
        yearRemarks: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        members: [],
        payments: [],
      },
    ],
    ...overrides,
  } as PolicyExportRow;
}

describe("loan repayment + pending amount (existing policy-level fields)", () => {
  it("sample CSV headers include loan_repayment and loan_pending_amt", () => {
    const headers = buildPolicyCsvSampleHeaders();
    expect(headers).toContain("loan_repayment");
    expect(headers).toContain("loan_pending_amt");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("loan_repayment");
    expect(POLICY_CSV_FLAT_HEADERS).toContain("loan_pending_amt");

    const [sampleHeader] = parseCsv(buildPolicyCsvSample());
    expect(sampleHeader).toContain("loan_repayment");
    expect(sampleHeader).toContain("loan_pending_amt");
  });

  it("API create accepts repayment/pending including zero", () => {
    const result = createPolicyBodySchema.safeParse({
      ...minimalCreateBody,
      loanStatus: "YES",
      loanAmount: 10000,
      loanRepaymentAmount: 0,
      loanPendingAmount: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.loanRepaymentAmount).toBe(0);
      expect(result.data.loanPendingAmount).toBe(0);
    }
  });

  it("API patch accepts null clear and positive amounts (policy-scoped)", () => {
    expect(
      patchPolicyBodySchema.safeParse({
        yearLabel: "2025-26",
        loanRepaymentAmount: null,
        loanPendingAmount: null,
      }).success,
    ).toBe(true);

    const updated = patchPolicyBodySchema.safeParse({
      yearLabel: "2024-25",
      loanRepaymentAmount: 2500.5,
      loanPendingAmount: 7499.5,
    });
    expect(updated.success).toBe(true);
    if (updated.success) {
      expect(updated.data.loanRepaymentAmount).toBe(2500.5);
      expect(updated.data.loanPendingAmount).toBe(7499.5);
    }
  });

  it("CSV create parser allows blank, zero, and positive; rejects negative", () => {
    expect(parseOptionalDecimal("")).toBeUndefined();
    expect(parseOptionalDecimal("0")).toBe(0);
    expect(parseOptionalDecimal("1500.25")).toBe(1500.25);
    expect(() => parseOptionalDecimal("-1")).toThrow(/invalid number/);
  });

  it("fmtCsvDecimal preserves zero (does not treat as empty)", () => {
    expect(fmtCsvDecimal(new Prisma.Decimal(0))).toBe("0");
    expect(fmtCsvDecimal(null)).toBe("");
  });

  it("CSV export keeps independent repayment/pending per policy sharing a party", () => {
    const csv = buildPoliciesExportCsv(
      [
        exportRow({
          id: "p-a",
          loanRepaymentAmount: new Prisma.Decimal(1000),
          loanPendingAmount: new Prisma.Decimal(9000),
        }),
        exportRow({
          id: "p-b",
          policyNo: "PN-2",
          referenceNo: "REF-2",
          loanRepaymentAmount: new Prisma.Decimal(5000),
          loanPendingAmount: new Prisma.Decimal(0),
          years: [
            {
              ...exportRow().years[0]!,
              id: "y2",
              policyId: "p-b",
            },
          ],
        }),
      ],
      new Set(["policy:scope_all"]),
    );

    const rows = parseCsv(csv);
    const header = rows[0]!;
    const repayIdx = header.indexOf("loan_repayment");
    const pendingIdx = header.indexOf("loan_pending_amt");
    expect(repayIdx).toBeGreaterThan(-1);
    expect(pendingIdx).toBeGreaterThan(-1);

    const data = rows.slice(1).filter((r) => r.some((c) => c.trim()));
    expect(data).toHaveLength(2);
    expect(data[0]![repayIdx]).toBe("1000");
    expect(data[0]![pendingIdx]).toBe("9000");
    expect(data[1]![repayIdx]).toBe("5000");
    expect(data[1]![pendingIdx]).toBe("0");
  });

  it("rejects negative amounts on create schema", () => {
    expect(
      createPolicyBodySchema.safeParse({
        ...minimalCreateBody,
        loanRepaymentAmount: -1,
      }).success,
    ).toBe(false);
  });
});
