import { describe, expect, it } from "vitest";
import { buildReceiptDocumentHtml, type PolicyDetailForReceipt } from "./policy-receipt-print";

function basePolicy(): PolicyDetailForReceipt {
  return {
    id: "policy-1",
    createdAt: "2026-07-28T00:00:00.000Z",
    policyNo: "POL-1001",
    previousPolicyNo: null,
    referenceNo: "REF-1",
    adProductVariant: "FAMILY_FLOATER",
    area: "Mumbai",
    village: "Andheri",
    personsInsuredCount: 3,
    remarks: null,
    insuredParty: {
      name: "Yogesh Patel",
      svkkPublicId: "SVKK001",
      customerId: "CUST001",
      pan: "ABCDE1234F",
      aadhaarNo: "123412341234",
      mobile: "9999999999",
      email: "test@example.com",
    },
    policyType: { name: "Mediclaim" },
    category: { key: "general", name: "General" },
    years: [
      {
        yearLabel: "2026",
        sumInsured: 500000,
        vkkPremium: 12000,
        amountReceived: 12000,
        bankName: "SBI",
        utrRef: "UTR123",
        yearRemarks: null,
        members: [],
        receipts: [{ receiptNo: "RCP/2026/00001", policyDate: "2026-07-28T00:00:00.000Z" }],
        payments: [],
      },
    ],
  };
}

describe("buildReceiptDocumentHtml", () => {
  it("renders insured members section with member rows", () => {
    const policy = basePolicy();
    policy.years[0]!.members = [
      { name: "Riya Patel", relationship: "Daughter", ageAtEntry: 12, gender: "F" },
      { name: "Nikhil Patel", relationship: "Son", ageAtEntry: 8, gender: "male" },
    ];

    const html = buildReceiptDocumentHtml(policy, { embedded: true });

    expect(html).toContain("Insured Members");
    expect(html).toContain("Member Name");
    expect(html).toContain("Riya Patel");
    expect(html).toContain("Daughter");
    expect(html).toContain("12");
    expect(html).toContain("Female");
    expect(html).toContain("Nikhil Patel");
    expect(html).toContain("Male");
  });

  it("renders empty state when no members exist", () => {
    const html = buildReceiptDocumentHtml(basePolicy(), { embedded: true });

    expect(html).toContain("No members added.");
  });
});
