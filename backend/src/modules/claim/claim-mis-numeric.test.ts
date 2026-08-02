/**
 * Manual MIS numerical verification against isCashlessLodgeType + denial rules
 * (mirrors claim.summary / claim-mis category matrix partitioning).
 */
import { describe, expect, it } from "vitest";
import { isCashlessLodgeType } from "./claim.summary.js";

type MiniClaim = {
  category: string;
  claimAmount: number;
  approvedAmount: number;
  deductionAmount: number;
  actualLodgeType: string | null;
  claimType: string | null;
  statusText: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
};

function isDenied(c: MiniClaim): boolean {
  if (c.status === "REJECTED") return true;
  const s = c.statusText.toLowerCase();
  return ["denied", "reject", "repudiat", "close"].some((k) => s.includes(k));
}

function summarize(claims: MiniClaim[]) {
  let totalLodge = 0;
  let totalSettled = 0;
  let totalDeduction = 0;
  let cashless = 0;
  let reimbursement = 0;
  let cashDenied = 0;
  let remDenied = 0;
  const byCat: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };

  for (const c of claims) {
    totalLodge += c.claimAmount;
    totalSettled += c.approvedAmount;
    totalDeduction += c.deductionAmount;
    const cash = isCashlessLodgeType(c.actualLodgeType, c.claimType);
    const denied = isDenied(c);
    if (cash && !denied) cashless++;
    else if (!cash && !denied) reimbursement++;
    else if (cash && denied) cashDenied++;
    else remDenied++;
    if (c.category in byCat) byCat[c.category]!++;
  }

  return {
    totalClaims: claims.length,
    totalLodge,
    totalSettled,
    totalDeduction,
    cashless,
    reimbursement,
    cashDenied,
    remDenied,
    byCat,
  };
}

describe("Claim MIS numerical verification (known dataset)", () => {
  const dataset: MiniClaim[] = [
    {
      category: "A",
      claimAmount: 10000,
      approvedAmount: 8000,
      deductionAmount: 2000,
      actualLodgeType: "Cashless",
      claimType: "Cashless",
      statusText: "Paid",
      status: "APPROVED",
    },
    {
      category: "A",
      claimAmount: 5000,
      approvedAmount: 0,
      deductionAmount: 0,
      actualLodgeType: "Cashless",
      claimType: "Cashless",
      statusText: "Denied",
      status: "REJECTED",
    },
    {
      category: "B",
      claimAmount: 20000,
      approvedAmount: 15000,
      deductionAmount: 5000,
      actualLodgeType: "Non Cash Less",
      claimType: "Reimbursement",
      statusText: "Settled",
      status: "APPROVED",
    },
    {
      category: "C",
      claimAmount: 7000,
      approvedAmount: 0,
      deductionAmount: 0,
      actualLodgeType: null,
      claimType: "Reimbursement",
      statusText: "Closed",
      status: "REJECTED",
    },
    {
      category: "D",
      claimAmount: 3000,
      approvedAmount: 3000,
      deductionAmount: 0,
      actualLodgeType: "Cash Less",
      claimType: null,
      statusText: "Paid",
      status: "APPROVED",
    },
  ];

  it("matches hand-calculated summary cards", () => {
    const s = summarize(dataset);
    // Hand calc: 5 claims; lodge 10000+5000+20000+7000+3000=45000; settled 8000+0+15000+0+3000=26000; ded 7000
    // Cashless non-denied: A paid + D paid = 2
    // Reim non-denied: B settled = 1
    // Cash denied: A denied = 1
    // Reim denied: C closed = 1
    expect(s).toEqual({
      totalClaims: 5,
      totalLodge: 45000,
      totalSettled: 26000,
      totalDeduction: 7000,
      cashless: 2,
      reimbursement: 1,
      cashDenied: 1,
      remDenied: 1,
      byCat: { A: 2, B: 1, C: 1, D: 1 },
    });
    expect(s.cashless + s.reimbursement + s.cashDenied + s.remDenied).toBe(s.totalClaims);
    expect(s.byCat.A! + s.byCat.B! + s.byCat.C! + s.byCat.D!).toBe(s.totalClaims);
  });
});
