import { describe, expect, it } from "vitest";
import { PayMethod, Prisma } from "@prisma/client";
import { buildPolicyCsvSample, buildPolicyCsvHeaders } from "./policy-csv-format.js";
import {
  collectMembersFromCsvMap,
  collectPaymentsFromCsvMap,
  memberSlotHeader,
  paymentSlotHeader,
} from "./policy-csv-slots.js";
import { parseCsv, rowToHeaderMap } from "./policy-csv-parse.js";
import { buildPoliciesExportCsv, type PolicyExportRow } from "./policy.export-csv.js";

function paymentRow(
  overrides: Partial<PolicyExportRow["years"][number]["payments"][number]> = {},
): PolicyExportRow["years"][number]["payments"][number] {
  return {
    id: "pay1",
    policyYearId: "y1",
    amount: new Prisma.Decimal(1000),
    transactionNumber: "CHQ-100",
    transactionDate: new Date("2026-01-10T00:00:00.000Z"),
    bankName: "Demo Bank",
    branchName: "Main",
    accountNumber: "123456",
    nameAsPerCheque: "Holder",
    ifscCode: "DEMO0001",
    notOver: "50000",
    dishonourReason: null,
    returnCharges: null,
    otherCharges: null,
    status: "PENDING",
    method: "CHQ",
    chequeId: "ch1",
    cheque: {
      number: "CHQ-100",
      status: "PENDING",
      bankName: "Demo Bank",
      accountNo: "123456",
      branch: "Main",
      nameAsPerCheque: "Holder",
      ifsc: "DEMO0001",
      notOver: "50000",
      chequeDate: new Date("2026-01-10T00:00:00.000Z"),
      reason: null,
    },
    migratedRunId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("policy CSV slots", () => {
  it("headers include extended member and payment columns", () => {
    const headers = buildPolicyCsvHeaders();
    expect(headers).toContain("Member 1 Name");
    expect(headers).toContain("Member 2 Name");
    expect(headers).toContain("Member 3 Name");
    expect(headers).toContain("Member 4 Name");
    expect(headers).toContain(paymentSlotHeader(2, "amount"));
    expect(headers).toContain(paymentSlotHeader(2, "policy_cheque_no"));
    expect(headers.indexOf("Member 1 Name")).toBeGreaterThan(headers.indexOf("url"));
  });

  it("sample CSV includes demo data for three members and no payment 2 data", () => {
    const rows = parseCsv(buildPolicyCsvSample());
    const header = rows[0]!;
    const data = rows[1]!;
    expect(header).toContain("Member 1 Name");
    expect(data.join(",")).toContain("Demo Member One");
    expect(data.join(",")).toContain("Demo Member Two");
    expect(data.join(",")).toContain("Demo Member Three");
    const map = rowToHeaderMap(header, data);
    expect(map.get(paymentSlotHeader(2, "amount")) ?? "").toBe("");
    expect(map.get(paymentSlotHeader(1, "amount")) ?? "").toBe("");
  });

  it("collects multiple members from CSV map", () => {
    const map = new Map<string, string>([
      [memberSlotHeader(1, "Name"), "Alice"],
      [memberSlotHeader(1, "DOB"), "1990-01-01"],
      [memberSlotHeader(1, "Relationship"), "Self"],
      [memberSlotHeader(1, "Gender"), "F"],
      [memberSlotHeader(2, "Name"), "Bob"],
      [memberSlotHeader(2, "DOB"), "1992-02-02"],
      [memberSlotHeader(2, "Relationship"), "Spouse"],
      [memberSlotHeader(2, "Gender"), "M"],
      [memberSlotHeader(3, "Name"), "Charlie"],
      [memberSlotHeader(3, "DOB"), "2015-03-03"],
      [memberSlotHeader(3, "Relationship"), "Son"],
      [memberSlotHeader(3, "Gender"), "M"],
    ]);
    const members = collectMembersFromCsvMap(map);
    expect(members).toHaveLength(3);
    expect(members[0]?.name).toBe("Alice");
    expect(members[2]?.name).toBe("Charlie");
  });

  it("collects multiple payments from CSV map", () => {
    const map = new Map<string, string>([
      [paymentSlotHeader(1, "amount"), "1000"],
      [paymentSlotHeader(1, "method"), "CHQ"],
      [paymentSlotHeader(1, "policy_cheque_no"), "111"],
      [paymentSlotHeader(1, "bank"), "Bank A"],
      [paymentSlotHeader(2, "amount"), "500"],
      [paymentSlotHeader(2, "method"), "UPI"],
      [paymentSlotHeader(2, "transactionNumber"), "UPI-99"],
    ]);
    const payments = collectPaymentsFromCsvMap(map);
    expect(payments).toHaveLength(2);
    expect(payments[0]?.amount).toBe(1000);
    expect(payments[0]?.method).toBe(PayMethod.CHQ);
    expect(payments[1]?.method).toBe(PayMethod.UPI);
    expect(payments[1]?.transactionNumber).toBe("UPI-99");
  });
});

describe("buildPoliciesExportCsv multiple slots", () => {
  it("exports member 1, 2, 3 and two payments", () => {
    const base = {
      id: "p1",
      insuredPartyId: "ip1",
      policyTypeId: "pt1",
      categoryId: null,
      policyNo: "PN-1",
      village: "V1",
      referenceNo: "REF-1",
      periodYearText: "2026-27",
      createdAt: new Date("2026-05-13T06:44:18.937Z"),
      updatedAt: new Date("2026-05-13T06:47:44.544Z"),
      deletedAt: null,
      insuredParty: {
        id: "ip1",
        customerId: "C1",
        mobile: "+919999999999",
        svkkPublicId: "SVKK1",
        name: "Holder",
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
          yearLabel: "2026-27",
          policyChartId: "c1",
          policyStart: null,
          policyEnd: null,
          paymentMode: "CHQ",
          members: [
            {
              id: "m1",
              policyYearId: "y1",
              name: "Member One",
              dob: new Date("2010-01-15"),
              relationship: "Son",
              gender: "M",
              riderAmount: 0 as unknown as import("@prisma/client").Prisma.Decimal,
              sumInsured: null,
              cumulativeBonus: null,
              dateOfJoining: null,
              memberPhone: null,
              addOnsAmount: null,
              basicPremium: null,
              ageAtEntry: 16,
              deletedAt: null,
            },
            {
              id: "m2",
              policyYearId: "y1",
              name: "Member Two",
              dob: new Date("2012-02-20"),
              relationship: "Daughter",
              gender: "F",
              riderAmount: 0 as unknown as import("@prisma/client").Prisma.Decimal,
              sumInsured: null,
              cumulativeBonus: null,
              dateOfJoining: null,
              memberPhone: null,
              addOnsAmount: null,
              basicPremium: null,
              ageAtEntry: 14,
              deletedAt: null,
            },
            {
              id: "m3",
              policyYearId: "y1",
              name: "Member Three",
              dob: new Date("2015-03-10"),
              relationship: "Son",
              gender: "M",
              riderAmount: 0 as unknown as import("@prisma/client").Prisma.Decimal,
              sumInsured: null,
              cumulativeBonus: null,
              dateOfJoining: null,
              memberPhone: null,
              addOnsAmount: null,
              basicPremium: null,
              ageAtEntry: 11,
              deletedAt: null,
            },
          ],
          payments: [
            paymentRow({
              id: "p1",
              transactionNumber: "CHQ-ONE",
              cheque: {
                number: "CHQ-ONE",
                status: "PENDING",
                bankName: "Demo Bank",
                accountNo: "123456",
                branch: "Main",
                nameAsPerCheque: "Holder",
                ifsc: "DEMO0001",
                notOver: "50000",
                chequeDate: new Date("2026-01-10T00:00:00.000Z"),
                reason: null,
              },
            }),
            paymentRow({
              id: "p2",
              method: "UPI",
              transactionNumber: "UPI-TWO",
              amount: new Prisma.Decimal(250),
              cheque: null,
              chequeId: null,
            }),
          ],
        },
      ],
    } as PolicyExportRow;

    const csv = buildPoliciesExportCsv([base], new Set(["policy:scope_all"]), ["2026-27"]);
    const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
    const header = rows[0]!;
    const data = rows[1]!;
    const map = rowToHeaderMap(header, data);

    expect(map.get(memberSlotHeader(1, "Name"))).toBe("Member One");
    expect(map.get(memberSlotHeader(2, "Name"))).toBe("Member Two");
    expect(map.get(memberSlotHeader(3, "Name"))).toBe("Member Three");
    expect(map.get(paymentSlotHeader(1, "policy_cheque_no"))).toBe("CHQ-ONE");
    expect(map.get(paymentSlotHeader(2, "transactionNumber"))).toBe("UPI-TWO");
    expect(map.get(paymentSlotHeader(2, "amount"))).toBe("250");
  });
});
