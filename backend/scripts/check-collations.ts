import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<
    { TABLE_NAME: string; COLUMN_NAME: string; COLLATION_NAME: string | null }[]
  >`
    SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('claim', 'policy', 'category', 'policytype', 'policyyear')
      AND (
        (TABLE_NAME = 'policy' AND COLUMN_NAME IN ('policyTypeId', 'categoryId', 'village'))
        OR (TABLE_NAME = 'policytype' AND COLUMN_NAME IN ('id', 'key', 'name'))
        OR (TABLE_NAME = 'category' AND COLUMN_NAME IN ('id', 'key'))
        OR (TABLE_NAME = 'claim' AND COLUMN_NAME IN ('policyId', 'policyTypeText'))
      )
    ORDER BY TABLE_NAME, COLUMN_NAME
  `;
  console.table(rows);
}

main().finally(() => prisma.$disconnect());
