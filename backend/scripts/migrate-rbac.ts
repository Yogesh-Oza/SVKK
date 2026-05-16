/**
 * One-time migration from UserRole enum + legacy RolePermission to dynamic RBAC.
 * Run: npx tsx scripts/migrate-rbac.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Dropping legacy RolePermission table if present...");
  await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS `RolePermission`");

  const userCols = await prisma.$queryRawUnsafe<{ Field: string }[]>(
    "SHOW COLUMNS FROM `User` LIKE 'roleId'",
  );
  if (userCols.length === 0) {
    console.log("Adding User.roleId column...");
    await prisma.$executeRawUnsafe(
      "ALTER TABLE `User` ADD COLUMN `roleId` VARCHAR(191) NULL",
    );
  }

  console.log("Run: npx prisma db push");
  console.log("Then: npx prisma db seed");
  console.log("Then remove User.role column if still present (second db push).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
