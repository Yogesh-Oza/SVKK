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

  it("maps multiple payment transactions from API detail", () => {
    const values = policyDetailToAdFormValues({
      id: "p3",
      updatedAt: "2026-01-01",
      policyNo: "PN-1",
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
      policyGrouping: null,
      periodYearText: "2026-27",
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
      years: [
        {
          yearLabel: "2026-27",
          sumInsured: "100000",
          vkkPremium: "1",
          members: [],
          payments: [
            {
              method: "CHQ",
              amount: "5000",
              transactionNumber: "CHQ-A",
              bankName: "SBI",
              returnCharges: "100",
              otherCharges: "20",
              status: "COMPLETED",
              cheque: {
                number: "CHQ-A",
                bankName: "SBI",
                status: "CLEARED",
              },
            },
            {
              method: "UPI",
              amount: "1500",
              transactionNumber: "UTR-B",
              accountNumber: "9999888877",
              returnCharges: "0",
              otherCharges: "5",
              status: "PENDING",
              cheque: null,
            },
          ],
        },
      ],
    } as Parameters<typeof policyDetailToAdFormValues>[0]);

    expect(values.paymentTransactions).toHaveLength(2);
    expect(values.paymentTransactions[0]).toMatchObject({
      mode: "CHEQUE",
      transactionNumber: "CHQ-A",
      amountReceived: "5000",
      returnCharges: "100",
      otherCharges: "20",
      transactionStatus: "CLEARED",
    });
    expect(values.paymentTransactions[1]).toMatchObject({
      mode: "UPI",
      mobileNumber: "9999888877",
      transactionNumber: "UTR-B",
      amountReceived: "1500",
      returnCharges: "0",
      otherCharges: "5",
      transactionStatus: "PENDING",
    });
  });

  it("sorts payment rows by createdAt descending when API returns mixed order", () => {
    const values = policyDetailToAdFormValues({
      id: "p-order",
      updatedAt: "2026-01-01",
      policyNo: "PN-1",
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
      policyGrouping: null,
      periodYearText: "2026-27",
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
      years: [
        {
          yearLabel: "2026-27",
          sumInsured: "100000",
          vkkPremium: "1",
          members: [],
          payments: [
            {
              id: "pay-3",
              createdAt: "2026-05-29T00:00:00.000Z",
              method: "UPI",
              amount: "5000",
              transactionNumber: "UPI-3",
              accountNumber: "5000",
              cheque: null,
            },
            {
              id: "pay-2",
              createdAt: "2026-05-26T00:00:00.000Z",
              method: "CASH",
              amount: "2000",
              cheque: null,
            },
            {
              id: "pay-1",
              createdAt: "2026-05-25T00:00:00.000Z",
              method: "CHQ",
              amount: "1000",
              transactionNumber: "CHQ-1",
              cheque: { number: "CHQ-1", bankName: "SBI", status: "PENDING" },
            },
          ],
        },
      ],
    } as Parameters<typeof policyDetailToAdFormValues>[0]);

    expect(values.paymentTransactions).toHaveLength(3);
    expect(values.paymentTransactions.map((t) => t.mode)).toEqual([
      "UPI",
      "CASH",
      "CHEQUE",
    ]);
  });

  it("maps NEFT payment method back to Online in the form", () => {
    const values = policyDetailToAdFormValues({
      id: "p4",
      updatedAt: "2026-01-01",
      policyNo: "PN-1",
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
      policyGrouping: null,
      periodYearText: "2026-27",
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
      years: [
        {
          yearLabel: "2026-27",
          sumInsured: "100000",
          vkkPremium: "1",
          members: [],
          payments: [
            {
              method: "NEFT",
              amount: "4000",
              transactionNumber: "test 2",
              accountNumber: "1234567890",
              bankName: "test 2",
              status: "FAILED",
              dishonourReason: "test 2",
              cheque: null,
            },
          ],
        },
      ],
    } as Parameters<typeof policyDetailToAdFormValues>[0]);

    expect(values.paymentTransactions[0]).toMatchObject({
      mode: "ONLINE",
      transactionNumber: "test 2",
      accountNumber: "1234567890",
      amountReceived: "4000",
      transactionStatus: "DISHONOURED",
      dishonourReason: "test 2",
    });
  });
});
