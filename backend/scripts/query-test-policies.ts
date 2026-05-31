import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ids = ["RTYJUNE0019", "RTYJUNE0017", "RTYJUNE0009"];
  const parties = await prisma.insuredParty.findMany({
    where: { svkkPublicId: { in: ids } },
    include: {
      policies: {
        where: { deletedAt: null },
        include: {
          policyType: true,
          years: { where: { deletedAt: null }, orderBy: { yearLabel: "desc" } },
        },
      },
    },
  });

  if (!parties.length) {
    console.log("No parties found for", ids.join(", "));
    return;
  }

  for (const p of parties) {
    console.log("---", p.svkkPublicId, p.name);
    for (const pol of p.policies) {
      console.log(
        " policyNo:",
        pol.policyNo,
        "type:",
        pol.policyType?.name,
        "village:",
        pol.village,
      );
      for (const y of pol.years) {
        console.log(
          "  year:",
          y.yearLabel,
          "start:",
          y.policyStart?.toISOString().slice(0, 10),
          "end:",
          y.policyEnd?.toISOString().slice(0, 10),
          "sumInsured:",
          y.sumInsured?.toString(),
        );
      }
    }
  }

  const claimCount = await prisma.claim.count();
  console.log("Total claims in DB:", claimCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
