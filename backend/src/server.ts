import "dotenv/config";

import { loadEnv } from "./config/env.js";
import { createRootLogger } from "./utils/logger.js";
import { createApp } from "./app.js";
import {
  assertDatabaseSchemaReady,
  isMissingTableError,
} from "./lib/database-ready.js";
import { assertCatalogMatchesDatabase } from "./lib/permission-catalog-integrity.js";
import { seedDefaultEmailTemplatesIfMissing } from "./services/email/email-template.service.js";
import { startRenewalReminderScheduler } from "./services/notification/renewal-reminder.job.js";

const env = loadEnv();
const log = createRootLogger(env);

async function start() {
  try {
    await assertDatabaseSchemaReady();
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
    log.warn({ err: e }, "Permission catalog drift (non-production)");
  }

  try {
    await seedDefaultEmailTemplatesIfMissing();
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
