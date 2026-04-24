import { ChartMode } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import type {
  PremiumBand,
  PremiumCalculationInput,
  PremiumLineResult,
  PremiumMatrixJson,
  PremiumResult,
} from "./premium.types.js";

export function completedAge(dob: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function findBand(matrix: PremiumMatrixJson, age: number): PremiumBand {
  const b = matrix.bands.find((x) => age >= x.minAge && age <= x.maxAge);
  if (!b) {
    throw new AppError("AGE_OUT_OF_BAND", "Age outside chart bands", 400);
  }
  return b;
}

function siColumnIndex(matrix: PremiumMatrixJson, sumInsured: number): number {
  const idx = matrix.siColumns.findIndex((si) => si === sumInsured);
  if (idx < 0) {
    throw new AppError("SI_NOT_IN_CHART", "Sum insured not available in chart", 400);
  }
  return idx;
}

function matrixPremium(matrix: PremiumMatrixJson, age: number, sumInsured: number): number {
  const bandIdx = matrix.bands.findIndex((x) => age >= x.minAge && age <= x.maxAge);
  if (bandIdx < 0) {
    throw new AppError("AGE_OUT_OF_BAND", "Age outside chart bands", 400);
  }
  const col = siColumnIndex(matrix, sumInsured);
  const row = matrix.matrix[bandIdx];
  if (!row || row[col] == null) {
    throw new AppError("CHART_CELL_MISSING", "Premium cell missing for band/SI", 400);
  }
  return Number(row[col]);
}

function pickHolderIndex(members: { relationship: string; age: number }[]): number {
  const indexed = members.map((m, i) => ({ i, ...m }));
  const byAge = [...indexed].sort((a, b) => b.age - a.age);
  for (const x of byAge) {
    if (!/^daughter$/i.test(x.relationship.trim())) {
      return x.i;
    }
  }
  return byAge[0]?.i ?? 0;
}

function lineDiscountPercent(
  relationship: string,
  matrix: PremiumMatrixJson,
): number {
  if (/^daughter$/i.test(relationship.trim()) && matrix.daughterDiscountPercent != null) {
    return matrix.daughterDiscountPercent;
  }
  return 0;
}

/**
 * Compute member-wise premiums using holder vs member charts when `chartMode` is HOLDER_MEMBER.
 */
export function calculatePremium(input: PremiumCalculationInput): PremiumResult {
  if (!input.members.length) {
    throw new AppError("MEMBERS_REQUIRED", "At least one member required", 400);
  }

  const ages = input.members.map((m) => ({
    ...m,
    age: completedAge(m.dob, input.policyEnd),
  }));

  for (const m of ages) {
    if (m.age < 0) {
      throw new AppError("INVALID_DOB", "DOB cannot be after policy end date", 400);
    }
  }

  const holderIdx = pickHolderIndex(ages);
  const lines: PremiumLineResult[] = [];

  for (let i = 0; i < ages.length; i++) {
    const m = ages[i]!;
    const useHolderChart =
      input.chartMode === ChartMode.SINGLE || i === holderIdx;
    const chart =
      input.chartMode === ChartMode.SINGLE
        ? input.holderChart
        : useHolderChart
          ? input.holderChart
          : input.memberChart ?? input.holderChart;

    const band = findBand(chart, m.age);
    const basic = matrixPremium(chart, m.age, input.sumInsured);
    const rider = Number(m.riderAmount ?? 0);
    const gross = basic + rider;
    const discountPercent = lineDiscountPercent(m.relationship, chart);
    const discount = Math.round((gross * discountPercent) / 100);
    const net = gross - discount;

    lines.push({
      name: m.name,
      role: i === holderIdx ? "holder" : "member",
      relationship: m.relationship,
      gender: m.gender,
      age: m.age,
      band: band.label,
      basic,
      rider,
      gross,
      discountPercent,
      discount,
      net,
    });
  }

  const basicPremium = lines.reduce((s, l) => s + l.basic, 0);
  const riderTotal = lines.reduce((s, l) => s + l.rider, 0);
  const grossPremium = lines.reduce((s, l) => s + l.gross, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const netPremium = lines.reduce((s, l) => s + l.net, 0);

  return {
    lines,
    basicPremium,
    riderTotal,
    grossPremium,
    discountTotal,
    netPremium,
  };
}
