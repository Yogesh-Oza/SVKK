import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const claims = await prisma.claim.findMany({
    orderBy: { claimNo: "asc" },
    select: {
      claimNo: true,
      svkkPublicId: true,
      status: true,
      claimAmount: true,
      approvedAmount: true,
      matchStatus: true,
      village: true,
      policy: { select: { policyNo: true } },
    },
  });
  console.table(
    claims.map((c) => ({
      claimNo: c.claimNo,
      svkk: c.svkkPublicId,
      policyNo: c.policy?.policyNo,
      status: c.status,
      amount: c.claimAmount?.toString(),
      approved: c.approvedAmount?.toString(),
      match: c.matchStatus,
      village: c.village,
    })),
  );
}

main().finally(() => prisma.$disconnect());
