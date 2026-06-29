import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { uploadBufferToOneDrive } from "../../services/one-drive.service.js";
import {
  clearCategoryFormPdf,
  getCategoryFormForAdmin,
  previewCategoryFormRecipients,
  saveCategoryForm,
  saveCategoryFormPdf,
  sendCategoryFormTest,
  sendCategoryFormToCategories,
} from "../../services/email/category-form.service.js";

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
});

export function createCategoryFormRouter(env: Env) {
  const r = Router();

  r.get("/", requireAuth(env), requirePermission("admin:settings"), async (_req, res, next) => {
    try {
      const config = await getCategoryFormForAdmin();
      res.json(config);
    } catch (e) {
      next(e);
    }
  });

  r.put("/", requireAuth(env), requirePermission("admin:settings"), async (req, res, next) => {
    try {
      const body = z
        .object({
          subject: z.string().min(1).max(500),
          body: z.string().min(1).max(50_000),
        })
        .parse(req.body);
      await saveCategoryForm(body.subject, body.body);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post(
    "/pdf",
    requireAuth(env),
    requirePermission("admin:settings"),
    uploadPdf.single("file"),
    async (req, res, next) => {
      try {
        if (!req.file?.buffer) {
          throw new AppError("FILE_REQUIRED", "PDF file required", 400);
        }
        const mime = (req.file.mimetype || "").toLowerCase();
        if (mime !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
          throw new AppError("INVALID_FILE", "Only PDF files are allowed", 400);
        }
        const { fileId, webViewLink } = await uploadBufferToOneDrive(env, {
          buffer: req.file.buffer,
          mimeType: "application/pdf",
          fileName: req.file.originalname || "category-form.pdf",
        });
        const fileName = (req.file.originalname || "category-form.pdf").slice(0, 200);
        await saveCategoryFormPdf({ fileId, fileName, webUrl: webViewLink });
        res.json({ ok: true, fileId, fileName, webUrl: webViewLink });
      } catch (e) {
        next(e);
      }
    },
  );

  r.delete("/pdf", requireAuth(env), requirePermission("admin:settings"), async (_req, res, next) => {
    try {
      await clearCategoryFormPdf();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post("/preview", requireAuth(env), requirePermission("admin:settings"), async (req, res, next) => {
    try {
      const body = z
        .object({
          categoryIds: z.array(z.string().min(1)).min(1),
        })
        .parse(req.body);
      const result = await previewCategoryFormRecipients(body.categoryIds);
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  r.post("/send-test", requireAuth(env), requirePermission("admin:settings"), async (req, res, next) => {
    try {
      const body = z
        .object({
          to: z.string().email().max(320),
          subject: z.string().min(1).max(500),
          body: z.string().min(1).max(50_000),
        })
        .parse(req.body);
      await sendCategoryFormTest(env, req.log, {
        to: body.to,
        subject: body.subject,
        body: body.body,
        userId: req.userId,
      });
      res.json({ ok: true, to: body.to });
    } catch (e) {
      next(e);
    }
  });

  r.post("/send", requireAuth(env), requirePermission("admin:settings"), async (req, res, next) => {
    try {
      const body = z
        .object({
          categoryIds: z.array(z.string().min(1)).min(1),
          subject: z.string().min(1).max(500),
          body: z.string().min(1).max(50_000),
        })
        .parse(req.body);
      const result = await sendCategoryFormToCategories(env, req.log, {
        categoryIds: body.categoryIds,
        subject: body.subject,
        body: body.body,
        userId: req.userId,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
