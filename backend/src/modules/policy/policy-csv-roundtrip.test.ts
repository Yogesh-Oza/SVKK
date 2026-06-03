import { describe, expect, it } from "vitest";
import { PayMethod, Prisma } from "@prisma/client";
import {
  collectPaymentsFromCsvMap,
  paymentCsvHeader,
} from "./policy-csv-payment-columns.js";
import { buildPolicyCsvImportTemplateHeaders } from "./policy-csv-export-layout.js";
import { parseCsv, rowToHeaderMap } from "./policy-csv-parse.js";
import { buildPoliciesExportCsv, type PolicyExportRow } from "./policy.export-csv.js";

function paymentRow(
  overrides: Partial<PolicyExportRow["years"][number]["payments"][number]> = {},
): PolicyExportRow["years"][number]["payments"][number] {
  return {
    id: "pay1",
    policyYearId: "y1",
    amount: new Prisma.Decimal(800),
    transactionNumber: "testqas1",
    transactionDate: new Date("2026-12-02T00:00:00.000Z"),
    bankName: null,
    branchName: null,
    accountNumber: "8574859632",
    nameAsPerCheque: null,
    ifscCode: null,
    notOver: null,
    dishonourReason: null,
    returnCharges: new Prisma.Decimal(800),
    otherCharges: new Prisma.Decimal(800),
    status: "COMPLETED",
    method: "UPI",
    chequeId: null,
    cheque: null,
    migratedRunId: null,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("policy CSV export → import round-trip", () => {
  it("re-imports exported payment columns using the same canonical headers", () => {
    const row = {
      id: "p1",
      insuredPartyId: "ip1",
      policyTypeId: "pt1",
      categoryId: null,
      policyNo: "PN-RT",
      village: "V1",
      referenceNo: "REF-RT",
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
          policyId: "p1",
          yearLabel: "2026-27",
          policyChartId: "c1",
          paymentMode: "UPI",
          members: [],
          payments: [
            paymentRow({
              id: "pay-cash",
              createdAt: new Date("2026-06-01T08:00:00.000Z"),
              method: "CASH",
              amount: new Prisma.Decimal(500),
              transactionDate: new Date("2002-09-05T00:00:00.000Z"),
              status: "FAILED",
              returnCharges: new Prisma.Decimal(500),
              otherCharges: new Prisma.Decimal(500),
              transactionNumber: null,
              accountNumber: null,
            }),
            paymentRow({
              id: "pay-chq",
              createdAt: new Date("2026-06-01T09:00:00.000Z"),
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
            paymentRow(),
          ],
        },
      ],
    } as PolicyExportRow;

    const csv = buildPoliciesExportCsv([row], new Set(["policy:scope_all"]), ["2026-27"]);
    const [header, data] = parseCsv(csv.replace(/^\uFEFF/, ""));
    const map = rowToHeaderMap(header!, data!);

    expect(header).toContain(paymentCsvHeader(1, "method"));
    expect(header).toContain(paymentCsvHeader(1, "mobileNumber"));
    expect(header).toContain(paymentCsvHeader(2, "bankName"));

    const payments = collectPaymentsFromCsvMap(map);
    expect(payments).toHaveLength(3);
    // CSV slot 1 = newest; import normalizes to oldest-first for DB.
    expect(payments[0]?.method).toBe(PayMethod.CASH);
    expect(payments[0]?.amount).toBe(500);
    expect(payments[1]?.method).toBe(PayMethod.CHQ);
    expect(payments[1]?.dishonourReason).toBe("test 1");
    expect(payments[2]?.method).toBe(PayMethod.UPI);
    expect(payments[2]?.amount).toBe(800);
    expect(payments[2]?.accountNumber).toContain("8574859632");
  });

  it("import template headers are a superset of any single-policy export headers", () => {
    const template = new Set(buildPolicyCsvImportTemplateHeaders(1, 3));
    const [exportHeader] = parseCsv(
      buildPoliciesExportCsv(
        [
          {
            id: "p1",
            years: [
              {
                id: "y1",
                payments: [
                  paymentRow({ method: "UPI", id: "a", createdAt: new Date("2026-06-03T10:00:00.000Z") }),
                  paymentRow({
                    method: "CHQ",
                    id: "b",
                    createdAt: new Date("2026-06-02T10:00:00.000Z"),
                  }),
                  paymentRow({
                    method: "CASH",
                    id: "c",
                    createdAt: new Date("2026-06-01T10:00:00.000Z"),
                  }),
                ],
                members: [],
              },
            ],
          } as PolicyExportRow,
        ],
        new Set(["policy:scope_all"]),
        [],
      ).replace(/^\uFEFF/, ""),
    );

    for (const h of exportHeader ?? []) {
      if (h.startsWith("Payment ")) {
        expect(template.has(h)).toBe(true);
      }
    }
  });
});
