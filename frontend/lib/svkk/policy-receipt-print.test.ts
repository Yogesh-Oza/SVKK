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

  it("omits insured members section when no members exist", () => {
    const html = buildReceiptDocumentHtml(basePolicy(), { embedded: true });

    expect(html).not.toContain("No members added.");
    expect(html).not.toContain("Insured Members");
    expect(html).toContain("Amount in Words");
  });

  it("keeps receipt height flexible and uses compact density for many members", () => {
    const policy = basePolicy();
    policy.years[0]!.members = [
      { name: "A One", relationship: "Spouse", ageAtEntry: 40, gender: "F" },
      { name: "B Two", relationship: "Daughter", ageAtEntry: 12, gender: "F" },
      { name: "C Three", relationship: "Son", ageAtEntry: 10, gender: "M" },
      { name: "D Four", relationship: "Father", ageAtEntry: 70, gender: "M" },
    ];

    const html = buildReceiptDocumentHtml(policy, { embedded: true });

    expect(html).toContain("receipt-density-compact");
    expect(html).toContain("height: auto");
    expect(html).toContain("max-height: none");
    expect(html).toContain("A One");
    expect(html).toContain("D Four");
    expect(html).toContain("Amount in Words");
    // Rows must keep natural height so member growth cannot clip field labels.
    expect(html).toMatch(/\.rrow\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
  });
});