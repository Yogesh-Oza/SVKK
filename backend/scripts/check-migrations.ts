import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10
  `;
  console.log(rows.map((r) => r.migration_name));

  const cols = await prisma.$queryRaw<{ Field: string }[]>`SHOW COLUMNS FROM claim`;
  console.log("has matchStatus:", cols.some((c) => c.Field === "matchStatus"));
  console.log("has policyYearId:", cols.some((c) => c.Field === "policyYearId"));
}

main().finally(() => prisma.$disconnect());
