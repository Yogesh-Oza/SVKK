import "dotenv/config";

import { loadEnv } from "./config/env.js";
import { createRootLogger } from "./utils/logger.js";
import { createApp } from "./app.js";
import { assertClaimSchemaReady } from "./lib/claim-schema-ready.js";
import {
  assertDatabaseSchemaReady,
  isMissingTableError,
} from "./lib/database-ready.js";
import { assertCatalogMatchesDatabase } from "./lib/permission-catalog-integrity.js";
import { upsertPermissionCatalog } from "./lib/permission-seed.js";
import { migrateRbacV2Permissions } from "./lib/migrate-rbac-v2-permissions.js";
import { prisma } from "./lib/prisma.js";
import { seedDefaultEmailTemplatesIfMissing } from "./services/email/email-template.service.js";
import { seedDefaultCategoryFormIfMissing } from "./services/email/category-form.service.js";
import { startRenewalReminderScheduler } from "./services/notification/renewal-reminder.job.js";

const env = loadEnv();
const log = createRootLogger(env);

async function start() {
  try {
    await assertDatabaseSchemaReady();
    await assertClaimSchemaReady();
  } catch (e) {
    log.fatal({ err: e }, "Database not initialized");
    process.exit(1);
  }

  try {
    await assertCatalogMatchesDatabase();
  } catch (e) {
    if (isMissingTableError(e)) {
      log.fatal({ err: e }, "Database not initialized");
      process.exit(1);
    }
    if (env.NODE_ENV === "production") {
      log.fatal({ err: e }, "Permission catalog integrity check failed");
      process.exit(1);
    }
    log.warn({ err: e }, "Permission catalog drift — syncing catalog (non-production)");
    await upsertPermissionCatalog(prisma);
    await migrateRbacV2Permissions(prisma);
    try {
      await assertCatalogMatchesDatabase();
      log.info("Permission catalog synced");
    } catch (syncErr) {
      log.warn({ err: syncErr }, "Permission catalog drift after sync");
    }
  }

  try {
    await seedDefaultEmailTemplatesIfMissing();
    await seedDefaultCategoryFormIfMissing();
  } catch (e) {
    if (isMissingTableError(e)) {
      log.fatal({ err: e }, "Database not initialized");
      process.exit(1);
    }
    throw e;
  }

  const app = createApp(env, log);
  app.listen(env.PORT, () => {
    log.info({ port: env.PORT }, "SVKK API listening");
    startRenewalReminderScheduler(env, log);
  });
}

void start();
