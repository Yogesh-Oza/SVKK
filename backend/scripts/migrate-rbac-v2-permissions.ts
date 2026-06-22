/**
 * Idempotent migration: mis:read / mis:scope_* → split MIS + Future permissions.
 * Run: npm run rbac:migrate-v2
 */
import "dotenv/config";
import { migrateRbacV2Permissions } from "../src/lib/migrate-rbac-v2-permissions.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  await migrateRbacV2Permissions(prisma);
  console.log("RBAC v2 permission migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
