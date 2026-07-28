import type { Quote } from "@/lib/svkk/premium";

export type FutureSourceKey =
  | "uploaded_csv_policy_list"
  | "uploaded_csv_only"
  | "policy_list_only"
  | "linked_upload";

export type CsvRowObject = Record<string, string>;

export type FutureCalculationContext = {
  yearOffset: number;
  futureYearLabel: string;
  calculationDate: string;
  calculationYear: number;
  currentStartDate: string;
  currentEndDate: string;
  futureStartDate: string;
  futureEndDate: string;
  currentPolicyYear: string;
  futurePolicyYear: string;
};

export type FutureScenarioContext = {
  futureSi: number;
  futurePolicyType: string;
  discountMode: "existing" | "chart" | "custom";
  customDiscountPct: number;
  appliedDiscountPct: number;
};

export type MemberDelta = {
  key: string;
  name: string;
  role: string;
  relationship: string;
  gender: string;
  dob: string;
  currentAge: number | null;
  futureAge: number | null;
  currentBand: string;
  futureBand: string;
  currentBasic: number;
  futureBasic: number;
  currentGross: number;
  futureGross: number;
  currentDisc: number;
  futureDisc: number;
  currentNet: number;
  futureNet: number;
  deltaNet: number;
  deltaPct: number;
  nearBandChange: boolean;
  bandChanged: boolean;
  issue?: string;
};

export type ChangeReasonCode =
  | "Age Increased"
  | "Age Band Changed"
  | "SI Changed"
  | "Discount Changed"
  | "Product Changed"
  | "Rate Chart Updated";

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
  currentQuote: Quote;
  quote: Quote;
  context: FutureCalculationContext;
  scenario: FutureScenarioContext;
  currentSi: number;
  futureSi: number;
  currentPolicy: string;
  futurePolicy: string;
  currentPremium: number;
  futurePremium: number;
  premiumDiff: number;
  premiumIncreasePct: number;
  memberTimeline: MemberDelta[];
  reasons: ChangeReasonCode[];
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
