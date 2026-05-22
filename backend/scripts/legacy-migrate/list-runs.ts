import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const runs = await p.migrationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { id: true, status: true, mode: true, startedAt: true, legacyDbName: true },
  });
  const migratedPolicies = await p.policy.count({ where: { migratedRunId: { not: null } } });
  console.log(JSON.stringify({ migratedPolicies, runs }, null, 2));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
