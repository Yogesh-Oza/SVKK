/**
 * Regression: export for policy PO- 14010061252700000246 (Asha Kiran, 2 members, 1 payment).
 * Values captured from live DB audit 2026-06-01.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { POLICY_CSV_FLAT_HEADERS } from "./policy-csv-flat-headers.js";
import { parseCsv, rowToHeaderMap } from "./policy-csv-parse.js";
import {
  buildPoliciesExportCsv,
  type PolicyExportRow,
} from "./policy.export-csv.js";
import { memberSlotHeader } from "./policy-csv-slots.js";

function po14010061252700000246Row(): PolicyExportRow {
  return {
    id: "cmpgteshb0n1hwd14mua1r02t",
    insuredPartyId: "ip",
    policyTypeId: "pt",
    categoryId: "cat",
    policyNo: "PO- 14010061252700000246",
    village: "Kharoi",
    pod: null,
    addressLine1: "5/2 DSK Trilok CHS",
    addressLine2: "Road No.469 K.W. Chitle Path",
    addressLine3: "Opp. Vartak Hall",
    addressLine4: null,
    city: "mumbai",
    state: null,
    pincode: "400028",
    contactPhone: "8879161038",
    whatsappNo: null,
    nomineeName: "Charmi Viren Chheda",
    nomineeRelation: "Spouse",
    loanRef: null,
    courierTracking: null,
    remarks: "[legacy-import v1 ref=VKK2025OCT0046]",
    adProductVariant: null,
    insuranceCompany: "The New India Assurance Co. Ltd.",
    tpa: "MD India Health Insurance TPA Pvt Limited",
    categoryText: null,
    holderRelationship: "Self",
    holderGender: null,
    holderAge: 35,
    holderJoiningDate: null,
    holderAddOns: null,
    personsInsuredCount: 3,
    area: "Dadar-West",
    referenceNo: "VKK2025OCT0046",
    mobileSecondary: null,
    policyGrouping: "RTY",
    policyUrl: null,
    policyUrl2: null,
    loanStatus: "NO",
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
    periodYearText: "2025-26",
    periodMonthText: "October",
    listVkkPremium: null,
    version: 1,
    createdById: null,
    createdAt: new Date("2026-05-22T11:07:06.287Z"),
    updatedAt: new Date("2026-05-22T11:07:06.287Z"),
    deletedAt: null,
    insuredParty: {
      id: "ip",
      customerId: "PO84682409",
      mobile: "8879161038",
      svkkPublicId: "RTYOCT0046",
      name: "Viren Murji Chheda",
      email: "babuchheda@gmail.com",
      pan: "ALPPC2917E",
      aadhaarNo: null,
      dateOfBirth: new Date("1990-06-22T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    policyType: { key: "asha_kiran", name: "Asha Kiran" },
    category: { id: "cat", key: "D", name: "Category D" },
    years: [
      {
        id: "y1",
        policyId: "cmpgteshb0n1hwd14mua1r02t",
        yearLabel: "2025-26",
        policyChartId: "c1",
        policyStart: new Date("2025-11-03T00:00:00.000Z"),
        policyEnd: new Date("2026-11-02T00:00:00.000Z"),
        sumInsured: new Prisma.Decimal(500000),
        expectedNetPremium: new Prisma.Decimal(11872),
        paymentMode: "CHEQUE",
        paymentType: null,
        amountReceived: new Prisma.Decimal(11872),
        bankName: null,
        bankAccountLast4: null,
        utrRef: null,
        yearRemarks: "cheque:CH-000038 | bank:HDFC Bank | status:CLEARED",
        taxPercent: null,
        taxAmount: null,
        svkkPremium: null,
        netPremium: null,
        vkkCommission: null,
        policyHolderContribution: null,
        premiumOneOrTwoLakh: null,
        gaamMahajanContribution: null,
        differenceAmountPaidByHolder: null,
        holderCumulativeBonus: new Prisma.Decimal(0),
        holderJoiningYear: null,
        holderBasicPremium: new Prisma.Decimal(9805),
        vkkPremium: new Prisma.Decimal(11872),
        grossPremium: new Prisma.Decimal(11872),
        commissionAmount: new Prisma.Decimal(1781),
        twoLacFloater: new Prisma.Decimal(11872),
        yearPolicyHolderPremium: new Prisma.Decimal(11872),
        gaamMahajanVkk: null,
        excessShortAmount: new Prisma.Decimal(0),
        diffPaidByHolder: new Prisma.Decimal(0),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        members: [
          {
            id: "m1",
            policyYearId: "y1",
            name: "Charmi Viren Chheda",
            dob: new Date("1991-10-21T00:00:00.000Z"),
            relationship: "Spouse",
            gender: "O",
            riderAmount: new Prisma.Decimal(0),
            sumInsured: new Prisma.Decimal(500000),
            cumulativeBonus: new Prisma.Decimal(0),
            dateOfJoining: new Date("2018-11-02T00:00:00.000Z"),
            memberPhone: null,
            addOnsAmount: null,
            basicPremium: new Prisma.Decimal(1638),
            ageAtEntry: 34,
            deletedAt: null,
          },
          {
            id: "m2",
            policyYearId: "y1",
            name: "Naysha Viren Chheda",
            dob: new Date("2015-07-26T00:00:00.000Z"),
            relationship: "Daughter",
            gender: "O",
            riderAmount: new Prisma.Decimal(0),
            sumInsured: new Prisma.Decimal(500000),
            cumulativeBonus: new Prisma.Decimal(0),
            dateOfJoining: new Date("2018-11-02T00:00:00.000Z"),
            memberPhone: null,
            addOnsAmount: null,
            basicPremium: new Prisma.Decimal(857),
            ageAtEntry: 10,
            deletedAt: null,
          },
        ],
        payments: [
          {
            id: "pay1",
            policyYearId: "y1",
            amount: new Prisma.Decimal(11872),
            transactionNumber: "CH-000038",
            transactionDate: new Date("2025-08-07T00:00:00.000Z"),
            bankName: "HDFC Bank",
            branchName: "Mumbai - 400028",
            accountNumber: "AC-50100122747962",
            nameAsPerCheque: "Keval J. Gala",
            ifscCode: "HDFC0001119",
            notOver: "8000",
            dishonourReason: null,
            returnCharges: null,
            otherCharges: null,
            status: "CLEARED",
            method: "CHQ",
            chequeId: "ch1",
            cheque: {
              number: "CH-000038",
              status: "CLEARED",
              bankName: "HDFC Bank",
              accountNo: "AC-50100122747962",
              branch: "Mumbai - 400028",
              nameAsPerCheque: "Keval J. Gala",
              ifsc: "HDFC0001119",
              notOver: "8000",
              chequeDate: new Date("2025-08-07T00:00:00.000Z"),
              reason: null,
            },
            migratedRunId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          },
        ],
      },
    ],
  } as PolicyExportRow;
}

describe("PO- 14010061252700000246 export", () => {
  it("includes full flat template plus member 2 columns with expected values", () => {
    const csv = buildPoliciesExportCsv(
      [po14010061252700000246Row()],
      new Set(["policy:scope_all"]),
      ["2025-26"],
    );
    const [header, data] = parseCsv(csv.replace(/^\uFEFF/, ""));
    expect(header?.slice(0, POLICY_CSV_FLAT_HEADERS.length)).toEqual([
      ...POLICY_CSV_FLAT_HEADERS,
    ]);
    const map = rowToHeaderMap(header!, data!);

    expect(map.get("policy no")).toBe("PO- 14010061252700000246");
    expect(map.get("SVKK ID")).toBe("RTYOCT0046");
    expect(map.get("Holder name")).toBe("Viren Murji Chheda");
    expect(map.get("Gross premium")).toBe("11872");
    expect(map.get("SVKK premium")).toBe("11872");
    expect(map.get("Net premium")).toBe("11872");
    expect(map.get("policy_cheque_no")).toBe("CH-000038");
    expect(map.get("Member 1 Name")).toBe("Charmi Viren Chheda");
    expect(map.get("Member 1 Gender")).toBe("Other");
    expect(map.get(memberSlotHeader(2, "Name"))).toBe("Naysha Viren Chheda");
    expect(map.get(memberSlotHeader(2, "Gender"))).toBe("Other");
    expect(map.get("ref no")).toBe("VKK2025OCT0046");

    const emptyOk = [
      "Holder Aadhaar",
      "previous policy no",
      "PRE. END DATE",
      "Holder gender",
      "Tax %",
      "Tax amount",
      "VKK commission",
      "Gaam mahajan contribution",
    ];
    for (const col of emptyOk) {
      expect(map.get(col) ?? "").toBe("");
    }
  });
});
