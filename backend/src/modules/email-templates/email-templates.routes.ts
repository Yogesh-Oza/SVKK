import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { EMAIL_TEMPLATE_CATALOG, type EmailTemplateId } from "../../services/email/email-template-catalog.js";
import {
  listEmailTemplatesForAdmin,
  saveEmailTemplate,
} from "../../services/email/email-template.service.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";

const templateIdSchema = z.enum(
  EMAIL_TEMPLATE_CATALOG.map((t) => t.id) as [EmailTemplateId, ...EmailTemplateId[]],
);

export function createEmailTemplatesRouter(env: Env) {
  const r = Router();

  r.get("/", requireAuth(env), requirePermission("admin:settings"), async (_req, res, next) => {
    try {
      const templates = await listEmailTemplatesForAdmin();
      res.json({ templates });
    } catch (e) {
      next(e);
    }
  });

  r.put(
    "/:templateId",
    requireAuth(env),
    requirePermission("admin:settings"),
    async (req, res, next) => {
      try {
        const templateId = templateIdSchema.parse(req.params.templateId);
        const body = z
          .object({
            subject: z.string().min(1).max(500),
            body: z.string().min(1).max(50_000),
          })
          .parse(req.body);
        await saveEmailTemplate(templateId, body.subject, body.body);
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
