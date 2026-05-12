import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";

export function createSettingsRouter(env: Env) {
  const r = Router();

  r.get("/", async (_req, res, next) => {
    try {
      const rows = await prisma.appSetting.findMany();
      const map: Record<string, string> = {};
      for (const row of rows) map[row.key] = row.value;
      res.json(map);
    } catch (e) {
      next(e);
    }
  });

  r.put("/:key", requireAuth(env), requirePermission("admin:settings"), async (req, res, next) => {
    try {
      const key = z.string().min(1).max(100).parse(req.params.key);
      const { value } = z.object({ value: z.string().min(1) }).parse(req.body);
      const row = await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
      res.json(row);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
