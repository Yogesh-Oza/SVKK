import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { AppError } from "../../errors/app-error.js";

const MEDCLAIM = "medclaim";

/**
 * Serves whitelisted static files (paths from `MEDCLAIM_PDF_PATH` env or local `static/medclaim.pdf`).
 */
export function createFilesRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get(
    `/${MEDCLAIM}.pdf`,
    requirePermission("mis:read"),
    async (req, res, next) => {
      try {
        const fromEnv = env.MEDCLAIM_PDF_PATH
          ? path.resolve(env.MEDCLAIM_PDF_PATH)
          : path.join(process.cwd(), "static", "medclaim.pdf");
        if (!fromEnv || !fs.existsSync(fromEnv)) {
          throw new AppError("NOT_FOUND", "Medclaim PDF not available on server", 404);
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${MEDCLAIM}.pdf"`);
        return fs.createReadStream(fromEnv).pipe(res);
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
