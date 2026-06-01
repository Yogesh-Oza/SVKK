import { describe, expect, it } from "vitest";
import { SAMPLE_CHARTS, SAMPLE_DEFS } from "../../lib/svkk/premium/sample-data";
import type { AdPolicyFormValues } from "./ad-policy-form-values";
import {
  canEnableLiveAutoCalc,
  isCalcTriggerPath,
  parseInrForCalc,
  quoteFromStoredFormValues,
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
