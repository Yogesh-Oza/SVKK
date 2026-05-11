import express from "express";
import cors from "cors";
import type { Env } from "./config/env.js";
import type { AppLogger } from "./utils/logger.js";
import { traceIdMiddleware } from "./middlewares/trace-id.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { authCookieParser, createAuthRouter } from "./modules/auth/auth.routes.js";
import { createPolicyRouter } from "./modules/policy/policy.routes.js";
import { createCalculationRouter } from "./modules/calculation/calculation.routes.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { createUploadRouter } from "./modules/upload/upload.routes.js";
import { createLogsRouter } from "./modules/logs/logs.routes.js";
import { createMisRouter } from "./modules/mis/mis.routes.js";
import { createClaimRouter } from "./modules/claim/claim.routes.js";
import { createReceiptRouter } from "./modules/receipt/receipt.routes.js";
import { createUsersRouter } from "./modules/users/users.routes.js";
import { createFilesRouter } from "./modules/files/files.routes.js";
import { createCategoryRouter } from "./modules/category/category.routes.js";
import { createDropdownsRouter } from "./modules/dropdowns/dropdowns.routes.js";
import { globalApiRateLimit } from "./middlewares/rate-limit.js";

export function createApp(env: Env, rootLog: AppLogger) {
  const app = express();

  app.disable("x-powered-by");
  const corsOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
      credentials: true,
    }),
  );
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const v1 = express.Router();
  v1.use(traceIdMiddleware(rootLog));
  v1.use(authCookieParser);
  v1.use(express.json({ limit: env.JSON_LIMIT ?? "2mb" }));
  v1.use(globalApiRateLimit);

  v1.use("/auth", createAuthRouter(env));
  v1.use("/files", createFilesRouter(env));
  v1.use("/categories", createCategoryRouter(env));
  v1.use("/dropdowns", createDropdownsRouter(env));
  v1.use("/policies", createPolicyRouter(env));
  v1.use("/calculation", createCalculationRouter(env));
  v1.use("/admin", createAdminRouter(env));
  v1.use("/upload", createUploadRouter(env));
  v1.use("/logs", createLogsRouter(env));
  v1.use("/mis", createMisRouter(env));
  v1.use("/claims", createClaimRouter(env));
  v1.use("/receipts", createReceiptRouter(env));
  v1.use("/users", createUsersRouter(env));

  v1.use(errorHandler);

  app.use("/api/v1", v1);

  return app;
}
