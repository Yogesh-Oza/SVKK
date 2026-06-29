/**
 * Idempotent RBAC data migrations:
 * - mis:read / mis:scope_* → split MIS permissions
 * - policy:commission → roles with policy:update
 *
 * Run on production after deploy: npm run rbac:migrate-v2
 */
import "dotenv/config";
import { migrateRbacV2Permissions } from "../src/lib/migrate-rbac-v2-permissions.js";
import { upsertPermissionCatalog } from "../src/lib/permission-seed.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  await upsertPermissionCatalog(prisma);
  await migrateRbacV2Permissions(prisma);
  console.log("RBAC permission migrations complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
