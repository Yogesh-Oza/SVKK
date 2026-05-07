import * as yup from "yup";
import { AD_PRODUCT_OPTIONS } from "./ad-product-variant";

const adProductValues = AD_PRODUCT_OPTIONS.map((o) => o.value) as unknown as [string, ...string[]];

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

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
  svkkPublicId: yup.string().trim().optional(),
  policyHolder: yup.string().trim().optional(),
  adProduct: yup.string().oneOf(adProductValues, "Select policy type").optional(),
  customerId: yup.string().trim().optional(),
  panNo: yup
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : v))
    .matches(PAN_RE, "Invalid PAN format"),
  dob: yup.string().optional(),
  area: yup.string().trim().optional(),
  village: yup.string().trim().optional(),
  person: yup.string().trim().optional(),
  cat: yup.string().trim().optional(),
  sumInsured: yup.string().optional(),
  vkkPremium: yup.string().optional(),
  coPremium: yup.string().optional(),
  paymentMode: yup
    .string()
    .oneOf(["ONLINE", "CHEQUE", "CASH"], "Invalid mode of payment")
    .optional(),
  onlineTransactionRef: yup.string().optional(),
  policyChequeNo: yup.string().optional(),
  bank: yup.string().optional(),
  accountNo: yup.string().optional(),
  branch: yup.string().optional(),
  nameAsPerCheque: yup.string().optional(),
  ifsc: yup.string().optional(),
  notOver: yup.string().optional(),
  chequeDate: yup.string().optional(),
  chequeStatus: yup.string().optional(),
  reasonDishonoured: yup.string().optional(),

  nomineeName: yup.string().trim().optional(),
  nomineeRelation: yup.string().trim().optional(),
  nomineePhoneNumber: yup.string().trim().optional(),

  address: yup.string().trim().optional(),
  addressTwo: yup.string().trim().optional(),
  addressThree: yup.string().trim().optional(),
  addressFour: yup.string().trim().optional(),

  city: yup.string().trim().optional(),
  pincode: yup.string().trim().optional(),

  mobileFirst: yup.string().optional(),
  mobileSecond: yup.string().optional(),
  whatsappNo: yup
    .string()
    .required("WhatsApp no. is required")
    .test("digits", "Enter a valid WhatsApp number (10+ digits)", (v) =>
      Boolean(v && v.replace(/\D/g, "").length >= 10),
    ),
  email: yup.string().trim().email("Enter a valid email").required("Email ID is required"),

  refNo: yup.string().trim().optional(),
  year: yup.string().trim().optional(),
  month: yup.string().trim().optional(),
  policyGrouping: yup.string().trim().optional(),
  generalRemark: yup.string().trim().optional(),
  policyChangeRemark: yup.string().trim().optional(),

  members: yup
    .array()
    .of(memberRowSchema)
    .test("members", "Members are invalid", (arr) => !arr || arr.length >= 0)
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
  previousPolicyNo: yup.string().optional(),
  previousEndDate: yup.string().optional(),
  policyGroup: yup.string().optional(),
  holderJoiningDate: yup.string().optional(),
  holderAddOns: yup.string().optional(),
  courierCompany: yup.string().optional(),
  podNumber: yup.string().optional(),
  paymentTransactions: yup.array().optional(),
  taxPercent: yup.string().optional(),
  taxAmount: yup.string().optional(),
  svkkPremiumCalc: yup.string().optional(),
  netPremiumCalc: yup.string().optional(),
  vkkCommission: yup.string().optional(),
  contribution: yup.string().optional(),
  differenceAmountPaidByHolder: yup.string().optional(),
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
