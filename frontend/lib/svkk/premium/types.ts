export type DiscountType = "count" | "daughter" | "different";

export interface DiscountConfig {
  type: DiscountType;
  /** "yes" => holder/member differ for `different` mode */
  different?: "yes" | "no";
  holder?: number | string;
  member?: number | string;
  daughter?: number | string;
  byCount?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>>;
}

export interface ChartBand {
  label: string;
  min: number;
  max: number;
  /** Premium keyed by SI value as string for JSON-safe storage. */
  premiums: Record<string, number>;
}

export type ChartData = ChartBand[] | { holder: ChartBand[]; member: ChartBand[] };

export interface PolicyDef {
  label: string;
  description: string;
  /** "same" => single chart array; "different" => holder+member arrays */
  mode: "same" | "different";
  discount: DiscountConfig;
}

export type PolicyKey = string;

export type MemberInput = {
  name: string;
  /** Free-form date string: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY */
  dob: string;
  relationship: string;
  gender: "" | "male" | "female";
  addOnRider: number;
};

export type QuoteRowOk = {
  name: string;
  dob: string;
  relationship: string;
  gender: string;
  addOnRider: number;
  role: "holder" | "member";
  age: number;
  band: string;
  basic: number;
  rider: number;
  gross: number;
  pct: number;
  disc: number;
  net: number;
  error?: undefined;
};

export type QuoteRowErr = {
  name: string;
  dob: string;
  relationship: string;
  gender: string;
  addOnRider: number;
  role: "holder" | "member";
  age: number | null;
  band?: string;
  basic?: number;
  rider?: number;
  gross?: number;
  pct?: number;
  disc?: number;
  net?: number;
  error: string;
};

export type QuoteRow = QuoteRowOk | QuoteRowErr;

export interface Quote {
  rows: QuoteRow[];
  basic: number;
  rider: number;
  gross: number;
  disc: number;
  net: number;
}

export interface PremiumState {
  defs: Record<PolicyKey, PolicyDef>;
  charts: Record<PolicyKey, ChartData>;
}
