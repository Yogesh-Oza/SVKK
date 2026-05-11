import { CounterType, type Prisma } from "@prisma/client";
import { allocateCounter } from "../../services/counter.service.js";

const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

function normalizeGrouping(grouping: string): string {
  return grouping.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "other";
}

function monthShort(value: string | Date): string {
  if (value instanceof Date) {
    return MONTH_SHORT[value.getMonth()] ?? "jan";
  }
  const idx = Number(value);
  if (Number.isFinite(idx) && idx >= 1 && idx <= 12) {
    return MONTH_SHORT[idx - 1] ?? "jan";
  }
  const parsed = new Date(`${value} 1, 2000`);
  if (!Number.isNaN(parsed.getTime())) {
    return MONTH_SHORT[parsed.getMonth()] ?? "jan";
  }
  return String(value).trim().slice(0, 3).toLowerCase() || "jan";
}

export async function generatePolicyPublicId(input: {
  policyGrouping: string;
  month: string | Date;
  tx: Prisma.TransactionClient;
}): Promise<string> {
  const group = normalizeGrouping(input.policyGrouping);
  const mon = monthShort(input.month);
  const period = `${group}-${mon}`;
  const seq = await allocateCounter(CounterType.SVKK_PUBLIC_ID, period, input.tx);
  return `${group}${mon}${String(seq).padStart(4, "0")}`;
}

export async function generateReferenceNo(input: {
  policyGrouping: string;
  year: string;
  month: string | Date;
  tx: Prisma.TransactionClient;
}): Promise<string> {
  const group = normalizeGrouping(input.policyGrouping);
  const yearPart = String(input.year).replace(/\D/g, "").slice(-4) || String(new Date().getFullYear());
  const mon = monthShort(input.month);
  const period = `${group}-${yearPart}-${mon}`;
  const counterEnum = CounterType as unknown as Record<string, string>;
  const refType = (counterEnum.POLICY_REFERENCE ?? counterEnum.REFERENCE_NO) as CounterType | undefined;
  if (!refType) {
    throw new Error("CounterType POLICY_REFERENCE is not available in Prisma client");
  }
  const seq = await allocateCounter(refType, period, input.tx);
  return `${group}${yearPart}${mon}${String(seq).padStart(4, "0")}`;
}

export function nextCarryForwardYear(yearText: string): string {
  const startYear = Number(String(yearText).replace(/\D/g, "").slice(0, 4));
  if (!Number.isFinite(startYear) || startYear < 1900) {
    return yearText;
  }
  return String(startYear + 1);
}

export function ageOnDate(dob: Date | null | undefined, expiry: Date | null | undefined): number | null {
  if (!dob || !expiry) {
    return null;
  }
  const ms = expiry.getTime() - dob.getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return null;
  }
  const years = ms / (365.2425 * 24 * 60 * 60 * 1000);
  return Math.floor(years);
}

export type PremiumInput = {
  grossPremium: number;
  taxPercent: number;
  netPremium: number;
  category: string;
  premiumOneOrTwoLakh: number;
  numberOfPersons?: number;
};

export type PremiumOutput = {
  taxAmount: number;
  svkkPremium: number;
  commission: number;
  vkkCommission: number;
  policyHolderPremium: number;
  contribution: number;
  excessShortAmount: number;
  differenceAmountPaidByHolder: number;
};

export function computePremiumDetails(input: PremiumInput): PremiumOutput {
  const gross = Number.isFinite(input.grossPremium) ? input.grossPremium : 0;
  const taxRate = Number.isFinite(input.taxPercent) ? input.taxPercent / 100 : 0;
  const net = Number.isFinite(input.netPremium) ? input.netPremium : 0;
  const basePremium = Number.isFinite(input.premiumOneOrTwoLakh) ? input.premiumOneOrTwoLakh : 0;
  const personsRaw = Number(input.numberOfPersons ?? 1);
  const persons = Number.isFinite(personsRaw) && personsRaw > 0 ? Math.floor(personsRaw) : 1;
  const normalizedCategory = String(input.category).trim().toUpperCase();

  const taxAmount = gross * taxRate;
  const svkkPremium = Math.round(gross + taxAmount);
  const commission = Math.round(gross * 0.15);
  const vkkCommission = commission * 0.5;

  let policyHolderPremium = net;
  if (normalizedCategory === "C") {
    policyHolderPremium = 3000 * persons;
  } else if (normalizedCategory === "B") {
    policyHolderPremium = basePremium * 0.5;
  } else if (normalizedCategory === "A" || normalizedCategory === "D") {
    policyHolderPremium = net;
  }
  policyHolderPremium = Math.round(policyHolderPremium);

  const contribution = basePremium - policyHolderPremium;
  const excessShortAmount = net - svkkPremium;
  const differenceAmountPaidByHolder = net - basePremium + policyHolderPremium;

  return {
    taxAmount,
    svkkPremium,
    commission,
    vkkCommission,
    policyHolderPremium,
    contribution,
    excessShortAmount,
    differenceAmountPaidByHolder,
  };
}
