import { describe, expect, it } from "vitest";
import { PayMethod, Prisma } from "@prisma/client";
import { buildPolicyCsvSample, buildPolicyCsvHeaders } from "./policy-csv-format.js";
import {
  collectMembersFromCsvMap,
  collectPaymentsFromCsvMap,
  memberSlotHeader,
  paymentCsvHeader,
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
    expect(headers).toContain("PRE. END DATE");
    expect(headers).toContain("Member 4 Name");
    expect(headers).toContain(paymentCsvHeader(2, "amountReceived"));
    expect(headers).toContain(paymentCsvHeader(2, "method"));
    expect(headers.indexOf("Member 1 Name")).toBeLessThan(headers.indexOf("url"));
    expect(headers.indexOf("Member 2 Name")).toBeLessThan(headers.indexOf("nominee_name"));
    expect(headers.indexOf("Member 2 Name")).toBeGreaterThan(headers.indexOf("Member 1 Name"));
  });

  it("sample CSV uses export-aligned Payment 1 UPI headers", () => {
    const rows = parseCsv(buildPolicyCsvSample());
    const header = rows[0]!;
    const data = rows[1]!;
    const map = rowToHeaderMap(header, data);
    expect(header).toContain("Payment 1 Mode of Payment");
    expect(header).toContain("Payment 1 Mobile Number");
    expect(header).not.toContain("mode of payment");
    expect(header).not.toContain("Payment 1 Bank Name");
    expect(map.get("Payment 1 Mode of Payment")).toBe("UPI");
    expect(header).toContain("Member 1 Name");
    expect(data.join(",")).toContain("Demo Member One");
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
      [paymentCsvHeader(1, "amountReceived"), "1000"],
      [paymentCsvHeader(1, "method"), "CHQ"],
      ["policy_cheque_no", "111"],
      ["bank", "Bank A"],
      [paymentCsvHeader(2, "amountReceived"), "500"],
      [paymentCsvHeader(2, "method"), "UPI"],
      [paymentCsvHeader(2, "transactionNumber"), "UPI-99"],
    ]);
    const payments = collectPaymentsFromCsvMap(map);
    expect(payments).toHaveLength(2);
    // CSV slot 1 = newest; persisted oldest-first.
    expect(payments[0]?.amount).toBe(500);
    expect(payments[0]?.method).toBe(PayMethod.UPI);
    expect(payments[1]?.amount).toBe(1000);
    expect(payments[1]?.method).toBe(PayMethod.CHQ);
  });
});

describe("buildPoliciesExportCsv multiple slots", () => {
  it("exports all member and payment slots in policy list CSV", () => {
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
              createdAt: new Date("2026-01-10T10:00:00.000Z"),
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
              createdAt: new Date("2026-01-11T10:00:00.000Z"),
              method: "UPI",
              transactionNumber: "UPI-TWO",
              amount: new Prisma.Decimal(250),
              accountNumber: "8574859632",
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
    expect(header).toContain("Member 2 Name");
    expect(header).toContain(paymentCsvHeader(2, "method"));
    expect(map.get(paymentCsvHeader(1, "method"))).toBe("UPI");
    expect(map.get(paymentCsvHeader(1, "transactionNumber"))).toBe("UPI-TWO");
    expect(map.get(paymentCsvHeader(1, "amountReceived"))).toBe("250");
    expect(map.get(paymentCsvHeader(2, "transactionNumber"))).toBe("CHQ-ONE");
    expect(map.get(paymentCsvHeader(2, "method"))).toBe("CHQ");
  });

  it("exports three payment transactions in UI order with accurate amounts", () => {
    const mk = (
      id: string,
      createdAt: string,
      overrides: Partial<PolicyExportRow["years"][number]["payments"][number]>,
    ) =>
      paymentRow({
        id,
        createdAt: new Date(createdAt),
        cheque: null,
        chequeId: null,
        ...overrides,
      });

    const row = {
      id: "p-multi",
      insuredPartyId: "ip1",
      policyTypeId: "pt1",
      categoryId: null,
      policyNo: "PN-MULTI",
      village: "V1",
      referenceNo: "REF-M",
      periodYearText: "2026-27",
      createdAt: new Date(),
      updatedAt: new Date(),
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
          policyId: "p-multi",
          yearLabel: "2026-27",
          policyChartId: "c1",
          paymentMode: "UPI",
          members: [],
          payments: [
            mk("pay-cash", "2026-06-01T08:00:00.000Z", {
              method: "CASH",
              amount: new Prisma.Decimal(500),
              transactionDate: new Date("2002-09-05T00:00:00.000Z"),
              status: "FAILED",
              returnCharges: new Prisma.Decimal(500),
              otherCharges: new Prisma.Decimal(500),
            }),
            mk("pay-chq", "2026-06-01T09:00:00.000Z", {
              method: "CHQ",
              amount: new Prisma.Decimal(200),
              transactionNumber: "testqas",
              transactionDate: new Date("2026-12-02T00:00:00.000Z"),
              bankName: "testqas",
              branchName: "testqas",
              accountNumber: "1234265",
              nameAsPerCheque: "testqas",
              ifscCode: "testqas",
              notOver: "testqas",
              status: "FAILED",
              dishonourReason: "test 1",
              returnCharges: new Prisma.Decimal(200),
              otherCharges: new Prisma.Decimal(200),
            }),
            mk("pay-upi", "2026-06-01T10:00:00.000Z", {
              method: "UPI",
              amount: new Prisma.Decimal(800),
              transactionNumber: "testqas1",
              transactionDate: new Date("2026-12-02T00:00:00.000Z"),
              accountNumber: "8574859632",
              status: "COMPLETED",
              returnCharges: new Prisma.Decimal(800),
              otherCharges: new Prisma.Decimal(800),
            }),
          ],
        },
      ],
    } as PolicyExportRow;

    const csv = buildPoliciesExportCsv([row], new Set(["policy:scope_all"]), ["2026-27"]);
    const [header, data] = parseCsv(csv.replace(/^\uFEFF/, ""));
    const map = rowToHeaderMap(header!, data!);

    expect(map.get(paymentCsvHeader(1, "method"))).toBe("UPI");
    expect(map.get(paymentCsvHeader(1, "transactionNumber"))).toBe("testqas1");
    expect(map.get(paymentCsvHeader(1, "amountReceived"))).toBe("800");
    expect(map.get(paymentCsvHeader(1, "mobileNumber"))).toContain("8574859632");
    expect(data!.some((cell) => cell.includes("8574859632"))).toBe(true);
    expect(map.get(paymentCsvHeader(1, "transactionStatus"))).toBe("CLEARED");

    expect(header).toContain(paymentCsvHeader(1, "mobileNumber"));
    expect(header).not.toContain(paymentCsvHeader(1, "bankName"));
    expect(header).toContain(paymentCsvHeader(2, "bankName"));

    expect(map.get(paymentCsvHeader(2, "method"))).toBe("CHQ");
    expect(map.get(paymentCsvHeader(2, "amountReceived"))).toBe("200");
    expect(map.get(paymentCsvHeader(2, "transactionNumber"))).toBe("testqas");
    expect(map.get(paymentCsvHeader(2, "dishonourReason"))).toBe("test 1");

    expect(map.get(paymentCsvHeader(3, "method"))).toBe("CASH");
    expect(map.get(paymentCsvHeader(3, "amountReceived"))).toBe("500");
    expect(map.get(paymentCsvHeader(3, "transactionStatus"))).toBe("DISHONOURED");
  });
});
