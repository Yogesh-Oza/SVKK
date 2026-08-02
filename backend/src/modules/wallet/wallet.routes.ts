import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { AppError } from "../../errors/app-error.js";
import {
  clearWallet,
  getWalletSummary,
  manualDebit,
  setOpeningBalance,
  topUpWallet,
} from "./wallet.service.js";
import { queryWalletTransactionsPaged } from "./wallet.list.js";
import {
  buildWalletBackupJson,
  buildWalletMisExportCsv,
  exportWalletTransactionsCsv,
} from "./wallet.export.js";
import { buildWalletSampleCsv, walletSampleFilename } from "./wallet-csv-format.js";
import { importWalletUsageCsv } from "./wallet-csv-import.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "application/octet-stream" ||
      file.mimetype === "text/plain";
    if (!ok) {
      cb(new AppError("VALIDATION_ERROR", "Only CSV files are accepted.", 400));
      return;
    }
    cb(null, true);
  },
});

const amountBody = z.object({
  amount: z.union([z.string(), z.number()]),
});

const topupBody = amountBody.extend({
  remark: z.string().max(500).optional(),
});

const debitBody = z.object({
  category: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  particulars: z.string().max(500).optional(),
  reference: z.string().max(255).optional(),
  allowNegative: z.boolean().optional(),
});

const clearBody = z.object({
  confirm: z.literal(true),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).optional(),
});

export function createWalletRouter(_env: Env) {
  const r = Router();
  r.use(requireAuth(_env));

  r.get("/", requirePermission("wallet:read"), async (_req, res, next) => {
    try {
      const summary = await getWalletSummary();
      res.json({ success: true, data: summary });
    } catch (e) {
      next(e);
    }
  });

  r.get("/transactions", requirePermission("wallet:read"), async (req, res, next) => {
    try {
      const q = listQuerySchema.parse(req.query);
      const data = await queryWalletTransactionsPaged(q);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/opening", requirePermission("wallet:opening"), async (req, res, next) => {
    try {
      const body = amountBody.parse(req.body);
      const data = await setOpeningBalance(body.amount, req.userId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/topup", requirePermission("wallet:topup"), async (req, res, next) => {
    try {
      const body = topupBody.parse(req.body);
      const data = await topUpWallet(body.amount, body.remark, req.userId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/debit", requirePermission("wallet:debit"), async (req, res, next) => {
    try {
      const body = debitBody.parse(req.body);
      const data = await manualDebit({
        category: body.category,
        amount: body.amount,
        particulars: body.particulars,
        reference: body.reference,
        allowNegative: body.allowNegative,
        userId: req.userId,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/clear", requirePermission("wallet:clear"), async (req, res, next) => {
    try {
      const body = clearBody.parse(req.body);
      const data = await clearWallet(body.confirm, req.userId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post(
    "/import-csv",
    requirePermission("wallet:import"),
    (req, res, next) => {
      upload.single("file")(req, res, (err) => {
        if (err) {
          if (err instanceof AppError) return next(err);
          if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return next(new AppError("VALIDATION_ERROR", "File too large (max 10MB).", 400));
          }
          return next(err);
        }
        next();
      });
    },
    async (req, res, next) => {
      try {
        const file = req.file;
        if (!file?.buffer?.length) {
          throw new AppError("FILE_REQUIRED", "Please select a CSV file.", 400);
        }
        const data = await importWalletUsageCsv(file.buffer, req.userId);
        res.json({ success: true, data });
      } catch (e) {
        next(e);
      }
    },
  );

  r.get("/export-sample.csv", requirePermission("wallet:import"), async (_req, res, next) => {
    try {
      const csv = buildWalletSampleCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${walletSampleFilename()}"`);
      res.send(csv);
    } catch (e) {
      next(e);
    }
  });

  r.get("/transactions/export.csv", requirePermission("wallet:export"), async (req, res, next) => {
    try {
      const q = listQuerySchema.parse(req.query);
      const { csv, truncated } = await exportWalletTransactionsCsv(q);
      if (truncated) res.setHeader("X-Export-Truncated", "true");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="wallet_transactions.csv"`,
      );
      res.send(csv);
    } catch (e) {
      next(e);
    }
  });

  r.get("/mis/export.csv", requirePermission("wallet:export"), async (_req, res, next) => {
    try {
      const csv = await buildWalletMisExportCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="wallet_category_mis.csv"`);
      res.send(csv);
    } catch (e) {
      next(e);
    }
  });

  r.get("/backup.json", requirePermission("wallet:export"), async (_req, res, next) => {
    try {
      const data = await buildWalletBackupJson();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="puja_cd_account_wallet_backup.json"`,
      );
      res.send(JSON.stringify(data, null, 2));
    } catch (e) {
      next(e);
    }
  });

  return r;
}
