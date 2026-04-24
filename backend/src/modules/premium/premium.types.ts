import type { ChartMode } from "@prisma/client";

export interface PremiumBand {
  label: string;
  minAge: number;
  maxAge: number;
}

export interface PremiumMatrixJson {
  bands: PremiumBand[];
  siColumns: number[];
  matrix: number[][];
  /** Optional percent discount applied to gross for members with relationship daughter */
  daughterDiscountPercent?: number;
}

export interface PremiumMemberInput {
  name: string;
  dob: Date;
  relationship: string;
  gender: string;
  riderAmount?: number;
}

export interface PremiumCalculationInput {
  chartMode: ChartMode;
  holderChart: PremiumMatrixJson;
  memberChart: PremiumMatrixJson | null;
  policyEnd: Date;
  sumInsured: number;
  members: PremiumMemberInput[];
}

export interface PremiumLineResult {
  name: string;
  role: "holder" | "member";
  relationship: string;
  gender: string;
  age: number;
  band: string;
  basic: number;
  rider: number;
  gross: number;
  discountPercent: number;
  discount: number;
  net: number;
}

export interface PremiumResult {
  lines: PremiumLineResult[];
  basicPremium: number;
  riderTotal: number;
  grossPremium: number;
  discountTotal: number;
  netPremium: number;
}
