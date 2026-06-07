import type { Quote } from "@/lib/svkk/premium";

export type FutureSourceKey =
  | "uploaded_csv_policy_list"
  | "uploaded_csv_only"
  | "policy_list_only"
  | "linked_upload";

export type CsvRowObject = Record<string, string>;

export type FuturePremiumResult = {
  source: string;
  svkkId: string;
  customerId: string;
  policyNo: string;
  holder: string;
  policy: string;
  memberCount: number;
  si: number;
  start: string;
  end: string;
  calcYear: number;
  calcDate: string;
  quote: Quote;
  status: "Ready" | "Issue";
  details?: CsvRowObject;
};

export type FutureMisGroup = {
  policies: number;
  members: number;
  basic: number;
  gross: number;
  disc: number;
  net: number;
};

export type FutureMisSnapshot = {
  policies: number;
  members: number;
  basic: number;
  gross: number;
  disc: number;
  net: number;
  byType: Record<string, FutureMisGroup>;
  bySI: Record<string, FutureMisGroup>;
};
