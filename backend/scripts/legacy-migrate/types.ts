import type { RowDataPacket } from "mysql2";

export type LogStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export type ErrorType =
  | "VALIDATION_ERROR"
  | "MAPPING_ERROR"
  | "DB_ERROR"
  | "SKIPPED_REASON"
  | null;

export interface MigrationLogLine {
  migrationRunId?: string;
  refNo: string;
  status: LogStatus;
  errorType: ErrorType;
  reason: string | null;
  warnings: string[];
  migrationVersion: string;
  ts: string;
  rawData?: Record<string, unknown>;
}

export interface LegacyPolicyRow extends RowDataPacket {
  policy_no: string | null;
  policy_type: string | null;
  customer_id: string | null;
  svvk_id: string | null;
  policy_holder: string | null;
  pan_no: string | null;
  company: string | null;
  tpa: string | null;
  policy_start_date: Date | string | null;
  policy_expiry_date: Date | string | null;
  village: string | null;
  cat: string | null;
  dob: Date | string | null;
  age: string | null;
  relation: string | null;
  person: string | null;
  sum_insured: string | null;
  comulative_bonus: string | null;
  joining_year: string | null;
  basic_premium_ps: string | null;
  policy_cheque_no: string | null;
  bank: string | null;
  account_no: string | null;
  branch: string | null;
  name_as_per_cheque: string | null;
  ifsc: string | null;
  not_over: string | null;
  cheque_date: Date | string | null;
  cheque_status: string | null;
  reason_dishonoured: string | null;
  vkk_premium: string | null;
  co_premium: string | null;
  gross_premium: string | null;
  commission: string | null;
  two_lakh_f: string | null;
  policy_holder_premium: string | null;
  Gaam_mahajan_vkk_refund: string | null;
  excess_short_amt: string | null;
  diff_amt_paid_policy_holder: string | null;
  loan_status: string | null;
  loan_amt: string | null;
  nominee_name: string | null;
  nominee_relation: string | null;
  address: string | null;
  address_two: string | null;
  address_three: string | null;
  address_four: string | null;
  area: string | null;
  city: string | null;
  pincode: string | null;
  mobile_first: string | null;
  mobile_second: string | null;
  email: string | null;
  refund_cheque_amt: string | null;
  cheque_no: string | null;
  refund_cheque_date: Date | string | null;
  cd_account_status: string | null;
  cd_amount: string | null;
  not_courier: string | null;
  courier_date: Date | string | null;
  courier_address: string | null;
  remark: string | null;
  ref_no: string;
  year: string | null;
  month: string | null;
  policy_grouping: string | null;
  url: string | null;
}

export interface LegacyMemberRow extends RowDataPacket {
  m_id: number;
  name: string | null;
  relation: string | null;
  dob: Date | string | null;
  age: string | null;
  date_of_joining: Date | string | null;
  sum_insured: string | null;
  comulative_bonus: string | null;
  ph_no: string | null;
  basic_premium: string | null;
  ref_no: string | null;
}

export interface DryRunMetrics {
  totalPolicyRows: number;
  wouldSucceed: number;
  wouldSkip: number;
  wouldFail: number;
  missingMobile: number;
  unknownPolicyType: number;
  missingChart: number;
  missingRefNo: number;
  /** Rows in legacy `member` with ref_no not present in policy_table */
  orphanMemberRowsInLegacy: number;
  memberDobSentinelCount: number;
  validationErrors: number;
  unmatchedCreated: number;
  paymentsCreated: number;
  chequesCreated: number;
  receiptsCreated: number;
  duplicateWarnings: number;
}
