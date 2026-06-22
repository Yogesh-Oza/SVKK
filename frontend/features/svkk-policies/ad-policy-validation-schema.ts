import { dateParse } from "@/lib/svkk/form-date";
import * as yup from "yup";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const optionalDecimalString = yup
  .string()
  .trim()
  .optional()
  .test("decimal", "Enter a valid amount", (v) => !v || !Number.isNaN(Number(v.replace(/,/g, ""))));

const optionalPastDateString = yup
  .string()
  .trim()
  .optional()
  .test("valid-date", "Enter a valid date (DD-MM-YYYY)", (v) => {
    if (!v) return true;
    return dateParse(v) !== null;
  })
  .test("past-date", "Date cannot be in the future", (v) => {
    if (!v) return true;
    const d = dateParse(v);
    if (!d) return true;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return d.getTime() <= today.getTime();
  });

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
  policyHolder: yup.string().trim().required("Holder name is required"),
  adProduct: yup.string().trim().required("Select policy type"),
  customerId: yup.string().trim().optional(),
  panNo: yup
    .string()
    .trim()
    .transform((v) => (v ? v.toUpperCase() : v))
    .test("pan", "Invalid PAN format", (v) => !v || PAN_RE.test(v)),
  aadhaarNo: yup
    .string()
    .trim()
    .optional()
    .test("aadhaar", "Aadhaar must be 12 digits", (v) => !v || /^\d{12}$/.test(v)),
  dob: yup.string().optional(),
  area: yup.string().trim().required("Area is required"),
  village: yup.string().trim().required("Village is required"),
  person: yup
    .string()
    .trim()
    .required("Number of persons is required")
    .test("min1", "At least 1 person", (v) => Number(v) >= 1),
  cat: yup.string().trim().required("Select category"),
  sumInsured: yup.string().required("Select sum insured"),
  vkkPremium: yup.string().optional(),
  coPremium: yup.string().optional(),
  paymentMode: yup
    .string()
    .transform((v) => v || undefined)
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
  nomineeDateOfBirth: optionalPastDateString,

  policyBankHolderName: yup.string().trim().max(200).optional(),
  policyBankAccountNo: yup.string().trim().max(34).optional(),
  policyBankIfsc: yup.string().trim().max(20).optional(),
  policyBankBranch: yup.string().trim().max(200).optional(),
  policyBankName: yup.string().trim().max(200).optional(),

  address: yup.string().trim().optional(),
  addressTwo: yup.string().trim().optional(),
  addressThree: yup.string().trim().optional(),
  addressFour: yup.string().trim().optional(),

  city: yup.string().trim().optional(),
  pincode: yup.string().trim().optional(),

  mobileFirst: yup
    .string()
    .optional()
    .test("digits", "Enter a valid mobile number (10+ digits)", (v) =>
      !v ? true : Boolean(v.replace(/\D/g, "").length >= 10),
    ),
  mobileSecond: yup.string().optional(),
  whatsappNo: yup
    .string()
    .required("WhatsApp no. is required")
    .test("digits", "Enter a valid WhatsApp number (10+ digits)", (v) =>
      Boolean(v && v.replace(/\D/g, "").length >= 10),
    ),
  email: yup.string().trim().email("Enter a valid email").required("Email ID is required"),

  refNo: yup.string().trim().optional(),
  year: yup.string().trim().required("Year is required"),
  month: yup.string().trim().required("Select month"),
  policyGroup: yup.string().trim().optional(),
  policyGrouping: yup.string().trim().optional(),
  generalRemark: yup.string().trim().optional(),
  policyChangeRemark: yup.string().trim().optional(),
  categoryChangeRemark: yup.string().trim().optional(),

  members: yup
    .array()
    .of(memberRowSchema)
    .test("members", "Members are invalid", (arr) => !arr || arr.length >= 0)
    .required(),

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
  loanRepayment: optionalDecimalString.when("loanStatus", {
    is: "YES",
    then: (s) => s.required("Repayment is required when loan is taken"),
    otherwise: (s) => s.optional(),
  }),
  loanPendingAmount: optionalDecimalString.when("loanStatus", {
    is: "YES",
    then: (s) => s.required("Pending amount is required when loan is taken"),
    otherwise: (s) => s.optional(),
  }),
  previousPolicyNo: yup.string().optional(),
  previousEndDate: yup.string().optional(),
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
  url2: yup.string().optional(),
});

export type AdPolicyFormValidated = yup.InferType<typeof adPolicyValidationSchema>;
