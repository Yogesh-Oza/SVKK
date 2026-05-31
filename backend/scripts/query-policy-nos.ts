import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const nos = ["ME19502547", "PO21743646", "7H3700140"];
  for (const no of nos) {
    const pol = await prisma.policy.findFirst({
      where: { policyNo: { contains: no }, deletedAt: null },
      include: { insuredParty: true, policyType: true, years: { where: { deletedAt: null } } },
    });
    console.log(no, pol ? `${pol.insuredParty.svkkPublicId} ${pol.policyNo}` : "NOT FOUND");
  }
}

main().finally(() => prisma.$disconnect());
