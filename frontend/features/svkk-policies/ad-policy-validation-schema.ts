import * as yup from "yup";
import { AD_PRODUCT_OPTIONS } from "./ad-product-variant";

const adProductValues = AD_PRODUCT_OPTIONS.map((o) => o.value) as unknown as [string, ...string[]];

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function parseNum(s: string | undefined): number | undefined {
  if (s == null) {
    return undefined;
  }
  const t = s.replace(/,/g, "").trim();
  if (!t) {
    return undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function requiredAmount(message: string) {
  return yup
    .string()
    .required(message)
    .test("amount", "Enter a valid amount", (v) => parseNum(v) != null && (parseNum(v) as number) >= 0);
}

function requiredPositiveSum(message: string) {
  return yup
    .string()
    .required(message)
    .test("sum", "Enter a valid sum insured", (v) => {
      const n = parseNum(v);
      return n != null && n > 0;
    });
}

const memberRowSchema = yup.object({
  name: yup.string().default(""),
  relationship: yup.string().default(""),
  dob: yup.string().default(""),
  age: yup.string().default(""),
  dateOfJoining: yup.string().default(""),
  sumInsured: yup.string().default(""),
  cumulativeBonus: yup.string().default(""),
  phNo: yup.string().default(""),
  basicPremium: yup.string().default(""),
  gender: yup.string().default("M"),
});

/** Validation for Add AD policy (mandatory fields per business rules). */
export const adPolicyValidationSchema = yup.object({
  svkkPublicId: yup.string().trim().required("SVKK ID is required"),
  policyHolder: yup.string().trim().min(1, "Policy holder name is required"),
  adProduct: yup.string().oneOf(adProductValues, "Select policy type").required("Policy type is required"),
  customerId: yup.string().trim().required("Customer ID is required"),
  panNo: yup
    .string()
    .trim()
    .required("PAN is required")
    .transform((v) => (v ? v.toUpperCase() : v))
    .matches(PAN_RE, "Invalid PAN format"),
  dob: yup.string().required("Date of birth is required"),
  area: yup.string().trim().min(1, "Area is required"),
  village: yup.string().trim().min(1, "Village is required"),
  person: yup.string().trim().min(1, "No. of persons insured is required"),
  cat: yup.string().trim().min(1, "Category is required"),
  sumInsured: requiredPositiveSum("Sum insured is required"),
  vkkPremium: requiredAmount("SVKK / VKK premium is required"),
  coPremium: requiredAmount("Net premium is required"),
  paymentMode: yup
    .string()
    .oneOf(["ONLINE", "CHEQUE", "CASH"], "Mode of payment is required")
    .required("Mode of payment is required"),

  onlineTransactionRef: yup.string().when("paymentMode", {
    is: "ONLINE",
    then: (s) => s.trim().required("Online transaction / UTR reference is required"),
    otherwise: (s) => s.notRequired(),
  }),

  policyChequeNo: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("Policy cheque no is required"),
    otherwise: (s) => s.notRequired(),
  }),
  bank: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("Bank name is required"),
    otherwise: (s) => s.notRequired(),
  }),
  accountNo: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("Account no is required"),
    otherwise: (s) => s.notRequired(),
  }),
  branch: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("Branch is required"),
    otherwise: (s) => s.notRequired(),
  }),
  nameAsPerCheque: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("Name as per cheque is required"),
    otherwise: (s) => s.notRequired(),
  }),
  ifsc: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("IFSC is required"),
    otherwise: (s) => s.notRequired(),
  }),
  notOver: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.trim().required("Not over is required"),
    otherwise: (s) => s.notRequired(),
  }),
  chequeDate: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) => s.required("Cheque date is required"),
    otherwise: (s) => s.notRequired(),
  }),
  chequeStatus: yup.string().when("paymentMode", {
    is: "CHEQUE",
    then: (s) =>
      s
        .oneOf(["CLEARED", "DISHONOURED"], "Select cheque status")
        .required("Cheque status is required"),
    otherwise: (s) => s.notRequired(),
  }),
  reasonDishonoured: yup
    .string()
    .test("reason-dish", "Reason for dishonoured is required", function (v) {
      const p = this.parent as { paymentMode?: string; chequeStatus?: string };
      if (p.paymentMode !== "CHEQUE" || p.chequeStatus !== "DISHONOURED") {
        return true;
      }
      return Boolean(v && v.trim());
    }),

  nomineeName: yup.string().trim().min(1, "Nominee name is required"),
  nomineeRelation: yup.string().trim().min(1, "Nominee relation is required"),

  address: yup.string().trim().min(1, "Address is required"),
  addressTwo: yup.string().trim().min(1, "Address two is required"),
  addressThree: yup.string().trim().min(1, "Address three is required"),
  addressFour: yup.string().trim().min(1, "Address four is required"),

  city: yup.string().trim().min(1, "City is required"),
  pincode: yup.string().trim().min(1, "Pin code is required"),

  mobileFirst: yup
    .string()
    .required("Primary mobile is required")
    .test("digits", "Enter a valid primary mobile (10+ digits)", (v) =>
      Boolean(v && v.replace(/\D/g, "").length >= 10),
    ),
  mobileSecond: yup
    .string()
    .required("Secondary mobile is required")
    .test("digits", "Enter a valid secondary mobile (10+ digits)", (v) =>
      Boolean(v && v.replace(/\D/g, "").length >= 10),
    ),
  whatsappNo: yup
    .string()
    .required("WhatsApp no. is required")
    .test("digits", "Enter a valid WhatsApp number (10+ digits)", (v) =>
      Boolean(v && v.replace(/\D/g, "").length >= 10),
    ),

  refNo: yup.string().trim().min(1, "Reference no is required"),
  year: yup.string().trim().min(1, "Year is required"),
  month: yup.string().trim().min(1, "Month is required"),
  policyGrouping: yup.string().trim().min(1, "Policy grouping is required").required("Policy grouping is required"),
  remark: yup.string().trim().min(1, "Remark is required"),

  members: yup
    .array()
    .of(memberRowSchema)
    .test("members", "Add at least one member with name and date of birth", (arr) => {
      if (!arr?.length) {
        return false;
      }
      return arr.some((m) => m?.name?.trim() && m?.dob);
    })
    .required(),

  // Optional / not validated (still in form)
  policyNo: yup.string().optional(),
  company: yup.string().optional(),
  tpa: yup.string().optional(),
  policyStart: yup.string().optional(),
  policyEnd: yup.string().optional(),
  age: yup.string().optional(),
  relation: yup.string().optional(),
  holderGender: yup.string().optional(),
  comulativeBonus: yup.string().optional(),
  joiningYear: yup.string().optional(),
  basicPremiumPs: yup.string().optional(),
  grossPremium: yup.string().optional(),
  commission: yup.string().optional(),
  twoLakhF: yup.string().optional(),
  policyHolderPremium: yup.string().optional(),
  gaamMahajan: yup.string().optional(),
  excessShort: yup.string().optional(),
  diffAmt: yup.string().optional(),
  loanStatus: yup.string().optional(),
  loanNo: yup.string().optional(),
  loanAmt: yup.string().optional(),
  email: yup.string().optional(),
  refundChequeAmt: yup.string().optional(),
  refundChequeNo: yup.string().optional(),
  refundChequeDate: yup.string().optional(),
  cdAccountStatus: yup.string().optional(),
  cdAmount: yup.string().optional(),
  notCourier: yup.string().optional(),
  courierDate: yup.string().optional(),
  courierAddress: yup.string().optional(),
  url: yup.string().optional(),
});

export type AdPolicyFormValidated = yup.InferType<typeof adPolicyValidationSchema>;
