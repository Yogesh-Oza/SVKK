import { ClaimStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export type ClaimSummaryResult = {
  totalClaims: number;
  paidOrSettledCount: number;
  underProcessCount: number;
  cashlessCount: number;
  reimbursementCount: number;
  cashDeniedCount: number;
  remDeniedCount: number;
  sumLodgeAmount: number;
  sumPaidAmount: number;
  sumDeductionAmount: number;
};

const deniedOr: Prisma.ClaimWhereInput[] = [
  { status: ClaimStatus.REJECTED },
  { statusText: { contains: "denied" } },
  { statusText: { contains: "Denied" } },
  { statusText: { contains: "reject" } },
  { statusText: { contains: "Reject" } },
  { statusText: { contains: "repudiat" } },
  { statusText: { contains: "close" } },
  { statusText: { contains: "Close" } },
];

const paidOr: Prisma.ClaimWhereInput[] = [
  { status: ClaimStatus.APPROVED },
  { statusText: { contains: "paid" } },
  { statusText: { contains: "Paid" } },
  { statusText: { contains: "settled" } },
  { statusText: { contains: "Settled" } },
];

const underProcessOr: Prisma.ClaimWhereInput[] = [
  { status: ClaimStatus.PENDING },
  { statusText: { contains: "process" } },
  { statusText: { contains: "Process" } },
  { statusText: { contains: "pending" } },
  { statusText: { contains: "Pending" } },
  { statusText: { contains: "under" } },
  { statusText: { contains: "Under" } },
];

const cashlessOr: Prisma.ClaimWhereInput[] = [
  { claimType: { contains: "cashless" } },
  { claimType: { contains: "Cashless" } },
  { claimType: { contains: "cash less" } },
  { claimType: { contains: "Cash less" } },
];

function andWhere(base: Prisma.ClaimWhereInput, extra: Prisma.ClaimWhereInput): Prisma.ClaimWhereInput {
  return { AND: [base, extra] };
}

function isDeniedWhere(): Prisma.ClaimWhereInput {
  return { OR: deniedOr };
}

function isPaidWhere(): Prisma.ClaimWhereInput {
  return { OR: paidOr };
}

function isUnderProcessWhere(): Prisma.ClaimWhereInput {
  return { OR: underProcessOr };
}

function isCashlessWhere(): Prisma.ClaimWhereInput {
  return { OR: cashlessOr };
}

function notDeniedWhere(): Prisma.ClaimWhereInput {
  return { NOT: isDeniedWhere() };
}

/** Aggregate claim stats for filtered set. */
export async function queryClaimSummary(where: Prisma.ClaimWhereInput): Promise<ClaimSummaryResult> {
  const [
    totalClaims,
    agg,
    paidOrSettledCount,
    underProcessCount,
    cashlessCount,
    reimbursementCount,
    cashDeniedCount,
    remDeniedCount,
  ] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.aggregate({
      where,
      _sum: { claimAmount: true, approvedAmount: true, deductionAmount: true },
    }),
    prisma.claim.count({ where: andWhere(where, isPaidWhere()) }),
    prisma.claim.count({
      where: andWhere(where, {
        AND: [isUnderProcessWhere(), { NOT: isPaidWhere() }, notDeniedWhere()],
      }),
    }),
    prisma.claim.count({ where: andWhere(where, { AND: [isCashlessWhere(), notDeniedWhere()] }) }),
    prisma.claim.count({
      where: andWhere(where, { AND: [{ NOT: isCashlessWhere() }, notDeniedWhere()] }),
    }),
    prisma.claim.count({ where: andWhere(where, { AND: [isCashlessWhere(), isDeniedWhere()] }) }),
    prisma.claim.count({
      where: andWhere(where, { AND: [{ NOT: isCashlessWhere() }, isDeniedWhere()] }),
    }),
  ]);

  return {
    totalClaims,
    paidOrSettledCount,
    underProcessCount,
    cashlessCount,
    reimbursementCount,
    cashDeniedCount,
    remDeniedCount,
    sumLodgeAmount: Number(agg._sum.claimAmount ?? 0),
    sumPaidAmount: Number(agg._sum.approvedAmount ?? 0),
    sumDeductionAmount: Number(agg._sum.deductionAmount ?? 0),
  };
}
