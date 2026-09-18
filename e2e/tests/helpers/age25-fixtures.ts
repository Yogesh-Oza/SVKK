import type { Page, Route } from "@playwright/test";

export const E2E_POLICY_ID = "e2e-age25-policy-id";
export const E2E_SVKK_ID = "E2EAGE250001";

type MemberFixture = {
  name: string;
  relationship: string;
  dob: string;
  gender: string;
  ageAtEntry: number | null;
};

/** Prior policy end: son born 15-06-2001 is age 24; +1 year → age 25. */
export function buildTurning25PolicyDetail(member: MemberFixture) {
  return {
    id: E2E_POLICY_ID,
    updatedAt: new Date().toISOString(),
    adProductVariant: null,
    policyNo: "E2E-POL-AGE25",
    village: "Test Village",
    insuranceCompany: null,
    tpa: null,
    personsInsuredCount: 2,
    policyGrouping: "OTHER",
    policyUrl: null,
    policyUrl2: null,
    addressLine1: "E2E Address",
    addressLine2: null,
    addressLine3: null,
    addressLine4: null,
    area: "Test Area",
    city: "Mumbai",
    pincode: "400001",
    nomineeName: null,
    nomineeRelation: null,
    nomineeDateOfBirth: null,
    contactPhone: "9876543210",
    whatsappNo: "9876543210",
    remarks: null,
    referenceNo: "OTHER2025JUN9999",
    periodYearText: "2025-26",
    periodMonthText: "June",
    holderRelationship: "self",
    holderGender: "M",
    holderName: "E2E Holder",
    holderDateOfBirth: "1985-01-01",
    holderPan: null,
    holderAadhaarNo: null,
    holderJoiningDate: null,
    holderAge: 40,
    holderAddOns: "0",
    categoryText: "B",
    mobileSecondary: null,
    loanStatus: null,
    loanAmount: null,
    loanRepaymentAmount: null,
    loanPendingAmount: null,
    previousPolicyNo: null,
    previousEndDate: null,
    policyGroup: "OTHER",
    refundChequeAmount: null,
    refundChequeNo: null,
    refundChequeDate: null,
    cdAccountUsed: null,
    cdAmount: null,
    courierStatus: null,
    courierDate: null,
    courierCompany: null,
    podNumber: null,
    courierAddress: null,
    insuredParty: {
      svkkPublicId: E2E_SVKK_ID,
      name: "E2E Holder",
      mobile: "9876543210",
      email: "e2e@svkk.local",
      customerId: "CUST-E2E-AGE25",
      pan: null,
      aadhaarNo: null,
      dateOfBirth: "1985-01-01",
    },
    policyType: { id: "e2e-type", name: "Family Floater", key: "family_floater" },
    category: { key: "B", name: "Category B" },
    years: [
      {
        yearLabel: "2025-26",
        policyStart: "2024-06-15",
        policyEnd: "2025-06-15",
        sumInsured: "200000",
        expectedNetPremium: "0",
        vkkPremium: "0",
        grossPremium: "0",
        commissionAmount: "0",
        twoLacFloater: "0",
        yearPolicyHolderPremium: "0",
        gaamMahajanVkk: "0",
        excessShortAmount: "0",
        diffPaidByHolder: "0",
        holderCumulativeBonus: "0",
        holderJoiningYear: null,
        holderBasicPremium: "0",
        payments: [],
        members: [
          {
            name: member.name,
            relationship: member.relationship,
            dob: member.dob,
            gender: member.gender,
            sumInsured: "200000",
            cumulativeBonus: "0",
            dateOfJoining: null,
            memberPhone: null,
            addOnsAmount: "0",
            basicPremium: "0",
            ageAtEntry: member.ageAtEntry,
          },
        ],
      },
    ],
  };
}

const listPayload = {
  items: [
    {
      id: E2E_POLICY_ID,
      periodYearText: "2025-26",
      insuredParty: {
        svkkPublicId: E2E_SVKK_ID,
        name: "E2E Holder",
        customerId: "CUST-E2E-AGE25",
      },
      years: [{ yearLabel: "2025-26" }],
      referenceNo: "OTHER2025JUN9999",
    },
  ],
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Mock list + detail (+ auto-id) so Carry Forward can run against live UI
 * with controlled member ages (no dependency on a real SVKK ID).
 */
export async function mockAge25CarryForwardApis(
  page: Page,
  member: MemberFixture = {
    name: "Ravi Kumar",
    relationship: "son",
    dob: "2001-06-15",
    gender: "M",
    ageAtEntry: 24,
  },
) {
  const detail = buildTurning25PolicyDetail(member);

  await page.route("**/policies**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") {
      await route.continue();
      return;
    }
    const url = new URL(req.url());
    const path = url.pathname.replace(/\/$/, "");

    if (path.endsWith(`/policies/${E2E_POLICY_ID}`)) {
      await json(route, detail);
      return;
    }
    if (path.includes("/policies/next-reference-no")) {
      await json(route, { referenceNo: "OTHER2026JUN1001" });
      return;
    }
    if (path.includes("/policies/next-svkk-id")) {
      await json(route, { svkkPublicId: E2E_SVKK_ID });
      return;
    }
    if (path.endsWith("/policies") && url.searchParams.has("search")) {
      await json(route, listPayload);
      return;
    }
    await route.continue();
  });
}
