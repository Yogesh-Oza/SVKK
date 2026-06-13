import { describe, expect, it } from "vitest";
import { SAMPLE_CHARTS, SAMPLE_DEFS } from "../../lib/svkk/premium/sample-data";
import type { AdPolicyFormValues } from "./ad-policy-form-values";
import {
  canEnableLiveAutoCalc,
  isAgeAnchorPath,
  isCalcTriggerPath,
  parseInrForCalc,
  parseStoredAge,
  quoteFromStoredFormValues,
  resolveQuoteRowAge,
  resolveQuoteSumInsured,
  shouldApplyChartBasicToField,
  shouldClearBasicOnChartError,
  shouldUnlockAutoCalc,
} from "./ad-policy-auto-calc";

const createCtx = { isEdit: false, fetchedForUpdate: false };
const editCtx = { isEdit: true, fetchedForUpdate: false };
const fetchedCtx = { isEdit: false, fetchedForUpdate: true };

function minimalFormValues(overrides: Partial<AdPolicyFormValues>): AdPolicyFormValues {
  return {
    policyNo: "",
    adProduct: "",
    customerId: "",
    svkkPublicId: "",
    policyHolder: "",
    holderGender: "",
    panNo: "",
    aadhaarNo: "",
    company: "",
    tpa: "",
    previousPolicyNo: "",
    previousEndDate: "",
    policyGroup: "",
    policyStart: "",
    policyEnd: "",
    village: "",
    cat: "",
    dob: "",
    age: "",
    relation: "",
    holderJoiningDate: "",
    holderAddOns: "",
    person: "1",
    sumInsured: "",
    comulativeBonus: "",
    joiningYear: "",
    basicPremiumPs: "",
    members: [],
    paymentMode: "CHEQUE",
    onlineTransactionRef: "",
    policyChequeNo: "",
    bank: "",
    accountNo: "",
    branch: "",
    nameAsPerCheque: "",
    ifsc: "",
    notOver: "",
    chequeDate: "",
    chequeStatus: "",
    reasonDishonoured: "",
    paymentTransactions: [],
    vkkPremium: "",
    coPremium: "",
    grossPremium: "",
    taxPercent: "",
    taxAmount: "",
    svkkPremiumCalc: "",
    netPremiumCalc: "",
    vkkCommission: "",
    contribution: "",
    differenceAmountPaidByHolder: "",
    commission: "",
    twoLakhF: "",
    policyHolderPremium: "",
    gaamMahajan: "",
    excessShort: "",
    diffAmt: "",
    loanStatus: "",
    loanNo: "",
    loanAmt: "",
    nomineeName: "",
    nomineeRelation: "",
    nomineePhoneNumber: "",
    address: "",
    addressTwo: "",
    addressThree: "",
    addressFour: "",
    area: "",
    city: "",
    pincode: "",
    mobileFirst: "",
    mobileSecond: "",
    whatsappNo: "",
    email: "",
    refundChequeAmt: "",
    refundChequeNo: "",
    refundChequeDate: "",
    cdAccountStatus: "",
    cdAmount: "",
    notCourier: "",
    courierDate: "",
    courierCompany: "",
    podNumber: "",
    courierAddress: "",
    generalRemark: "",
    policyChangeRemark: "",
    policyRemark: "",
    refNo: "",
    year: "",
    month: "",
    policyGrouping: "",
    urls: [],
    url2: "",
    ...overrides,
  };
}

const premiumState = { defs: SAMPLE_DEFS, charts: SAMPLE_CHARTS };

describe("isAgeAnchorPath", () => {
  it("matches holder and member age anchor fields", () => {
    expect(isAgeAnchorPath("dob")).toBe(true);
    expect(isAgeAnchorPath("age")).toBe(true);
    expect(isAgeAnchorPath("policyEnd")).toBe(true);
    expect(isAgeAnchorPath("previousEndDate")).toBe(true);
    expect(isAgeAnchorPath("members[0].dob")).toBe(true);
    expect(isAgeAnchorPath("members[1].age")).toBe(true);
  });

  it("does not match unrelated fields", () => {
    expect(isAgeAnchorPath("customerId")).toBe(false);
    expect(isAgeAnchorPath("basicPremiumPs")).toBe(false);
  });
});

describe("parseStoredAge", () => {
  it("parses valid integer ages", () => {
    expect(parseStoredAge("49")).toBe(49);
    expect(parseStoredAge(" 50 ")).toBe(50);
  });

  it("returns null for empty or invalid values", () => {
    expect(parseStoredAge("")).toBeNull();
    expect(parseStoredAge("abc")).toBeNull();
  });
});

describe("resolveQuoteRowAge", () => {
  it("prefers stored age when useStoredAge is true", () => {
    expect(resolveQuoteRowAge("49", "12-09-1976", "31-12-2026", true)).toBe(49);
  });

  it("derives age from DOB when stored age is missing or live mode requested", () => {
    expect(resolveQuoteRowAge("", "12-09-1976", "31-12-2026", true)).toBe(50);
    expect(resolveQuoteRowAge("49", "12-09-1976", "31-12-2026", false)).toBe(50);
  });
});

describe("isCalcTriggerPath", () => {
  it("matches top-level calc fields", () => {
    expect(isCalcTriggerPath("sumInsured")).toBe(true);
    expect(isCalcTriggerPath("adProduct")).toBe(true);
    expect(isCalcTriggerPath("holderAddOns")).toBe(true);
  });

  it("matches nested member paths", () => {
    expect(isCalcTriggerPath("members[0].dob")).toBe(true);
    expect(isCalcTriggerPath("members[1].addOnsAmount")).toBe(true);
  });

  it("does not match non-calc fields", () => {
    expect(isCalcTriggerPath("customerId")).toBe(false);
    expect(isCalcTriggerPath("generalRemark")).toBe(false);
    expect(isCalcTriggerPath("vkkPremium")).toBe(false);
  });
});

describe("resolveQuoteSumInsured", () => {
  it("uses policy sum insured when set", () => {
    expect(resolveQuoteSumInsured("500000", [{ sumInsured: "1500000" }])).toBe(500000);
  });

  it("falls back to max member sum insured when policy field is empty", () => {
    expect(resolveQuoteSumInsured("", [{ sumInsured: "15,00,000" }, { sumInsured: "200000" }])).toBe(
      1500000,
    );
  });
});

describe("shouldClearBasicOnChartError", () => {
  it("clears stale basics when chart errors and field is not manual", () => {
    expect(shouldClearBasicOnChartError("21293", true, false)).toBe(true);
    expect(shouldClearBasicOnChartError("", true, false)).toBe(false);
    expect(shouldClearBasicOnChartError("21293", true, true)).toBe(false);
  });
});

describe("shouldApplyChartBasicToField", () => {
  it("fills empty fields from chart", () => {
    expect(shouldApplyChartBasicToField("", 5993, false)).toBe(true);
    expect(shouldApplyChartBasicToField("0", 5993, false)).toBe(true);
  });

  it("overwrites stale values when chart basic changes", () => {
    expect(shouldApplyChartBasicToField("16889", 5993, false)).toBe(true);
    expect(shouldApplyChartBasicToField("5,993", 5993, false)).toBe(false);
  });

  it("skips when user marked premium manual", () => {
    expect(shouldApplyChartBasicToField("16889", 5993, true)).toBe(false);
  });
});

describe("canEnableLiveAutoCalc", () => {
  it("allows live calc on create and carry-forward context", () => {
    expect(canEnableLiveAutoCalc(createCtx)).toBe(true);
  });

  it("blocks live calc on edit or fetch-for-update", () => {
    expect(canEnableLiveAutoCalc(editCtx)).toBe(false);
    expect(canEnableLiveAutoCalc(fetchedCtx)).toBe(false);
  });
});

describe("shouldUnlockAutoCalc", () => {
  it("returns false while hydrating", () => {
    expect(shouldUnlockAutoCalc("sumInsured", true, createCtx)).toBe(false);
  });

  it("returns true for calc fields on create when not hydrating", () => {
    expect(shouldUnlockAutoCalc("dob", false, createCtx)).toBe(true);
    expect(shouldUnlockAutoCalc("policyNo", false, createCtx)).toBe(false);
  });

  it("never unlocks on edit or fetch-for-update even for calc fields", () => {
    expect(shouldUnlockAutoCalc("dob", false, editCtx)).toBe(false);
    expect(shouldUnlockAutoCalc("sumInsured", false, fetchedCtx)).toBe(false);
    expect(shouldUnlockAutoCalc("members[0].dob", false, editCtx)).toBe(false);
  });
});

describe("parseInrForCalc", () => {
  it("parses comma-separated INR strings", () => {
    expect(parseInrForCalc("6,023")).toBe(6023);
    expect(parseInrForCalc("")).toBe(0);
  });
});

describe("quoteFromStoredFormValues", () => {
  it("aggregates stored holder premium without chart lookup for basic", () => {
    const values = minimalFormValues({
      adProduct: "family_floater",
      policyHolder: "Dhaval Girish Satra",
      dob: "08-01-1997",
      relation: "self",
      holderGender: "M",
      holderAddOns: "",
      person: "1",
      sumInsured: "500000",
      basicPremiumPs: "6023",
      members: [],
    });

    const quote = quoteFromStoredFormValues(values, premiumState, "04-06-2026");

    expect(quote.rows).toHaveLength(1);
    expect(quote.rows[0]?.error).toBeUndefined();
    expect(quote.rows[0]?.basic).toBe(6023);
    expect(quote.rows[0]?.rider).toBe(0);
    expect(quote.rows[0]?.gross).toBe(6023);
    expect(quote.basic).toBe(6023);
    expect(quote.net).toBe(6023);
  });

  it("uses stored ages from form on fetch/edit hydrate", () => {
    const values = minimalFormValues({
      adProduct: "family_floater",
      policyHolder: "Kishor Kherajbhai Furiya",
      dob: "12-09-1976",
      age: "49",
      relation: "self",
      holderGender: "M",
      basicPremiumPs: "20042",
      person: "1",
      sumInsured: "500000",
      members: [],
    });

    const stored = quoteFromStoredFormValues(values, premiumState, "31-12-2026", {
      useStoredAges: true,
    });
    const derived = quoteFromStoredFormValues(values, premiumState, "31-12-2026", {
      useStoredAges: false,
    });

    expect(stored.rows[0]?.age).toBe(49);
    expect(derived.rows[0]?.age).toBe(50);
  });

  it("uses stored member basic premiums when present", () => {
    const values = minimalFormValues({
      adProduct: "family_floater",
      policyHolder: "Holder",
      dob: "01-01-1980",
      relation: "self",
      holderGender: "M",
      basicPremiumPs: "3000",
      person: "2",
      sumInsured: "500000",
      members: [
        {
          name: "Spouse",
          dob: "01-01-1982",
          age: "44",
          relationship: "spouse",
          gender: "F",
          dateOfJoining: "",
          sumInsured: "",
          cumulativeBonus: "",
          phNo: "",
          addOnsAmount: "100",
          basicPremium: "2000",
        },
      ],
    });

    const quote = quoteFromStoredFormValues(values, premiumState, "01-01-2026");

    expect(quote.rows).toHaveLength(2);
    expect(quote.rows[0]?.basic).toBe(3000);
    expect(quote.rows[1]?.basic).toBe(2000);
    expect(quote.rows[1]?.rider).toBe(100);
    expect(quote.basic).toBe(5000);
  });
});
