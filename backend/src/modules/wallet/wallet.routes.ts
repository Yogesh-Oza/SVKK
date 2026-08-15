import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { AppError } from "../../errors/app-error.js";
import {
  adjustWallet,
  getWalletSummary,
  manualDebit,
  restoreWalletFromBackup,
  clearWalletAllEntries,
  setOpeningBalance,
  topUpWallet,
} from "./wallet.service.js";
import { queryWalletTransactionsPaged } from "./wallet.list.js";
import {
  buildWalletBackupJson,
  buildWalletMisExportCsv,
  exportWalletTransactionsCsv,
  WALLET_MIS_DIMENSIONS,
  walletMisExportFilename,
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

const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.date().optional(),
);

const optionalText = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().max(500).optional(),
);

const openingBody = amountBody.extend({
  dateOfSubmission: optionalDate,
});

const topupBody = amountBody.extend({
  remark: z.string().max(500).optional(),
  dateOfSubmission: optionalDate,
});

const snapshotFields = {
  dateOfSubmission: optionalDate,
  month: optionalText,
  year: optionalText,
  holderName: z.string().max(200).optional(),
  village: z.string().max(200).optional(),
  group: z.string().max(64).optional(),
  policyType: z.string().max(120).optional(),
  cdAccountUsed: z.string().max(16).optional(),
  cdAmount: z.union([z.string(), z.number()]).optional(),
  remark: z.string().max(500).optional(),
};

const debitBody = z.object({
  category: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  particulars: z.string().max(500).optional(),
  reference: z.string().max(255).optional(),
  allowNegative: z.boolean().optional(),
  ...snapshotFields,
});

const adjustmentSnapshotsBody = z.object({
  dateOfSubmission: optionalDate,
  month: optionalText,
  year: optionalText,
  holderName: z.string().max(200).optional(),
  village: z.string().max(200).optional(),
  group: z.string().max(64).optional(),
  policyType: z.string().max(120).optional(),
  cdAccountUsed: z.string().max(16).optional(),
  cdAmount: z.union([z.string(), z.number()]).optional(),
  remark: z.string().max(500).optional(),
  policyId: z.string().max(64).optional(),
  policyNumber: z.string().max(120).optional(),
  particulars: z.string().max(500).optional(),
  reference: z.string().max(255).optional(),
});

const adjustmentBody = z.object({
  amount: z.union([z.string(), z.number()]),
  direction: z.enum(["CREDIT", "DEBIT"]),
  category: z.string().max(32).optional(),
  allowNegative: z.boolean().optional(),
  snapshots: adjustmentSnapshotsBody.optional(),
  ...snapshotFields,
});

const restoreBody = z.object({
  confirm: z.literal(true),
  backup: z.object({
    wallet_balance: z.unknown().optional(),
    wallet_last_updated: z.unknown().optional(),
    wallet_transactions: z.array(z.record(z.unknown())),
  }),
});

const clearBody = z.object({
  confirm: z.literal(true),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  categories: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  type: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return undefined;
      const t = v.trim().toUpperCase().replace(/-/g, "_");
      if (t === "TOPUP") return "TOP_UP";
      return t;
    })
    .pipe(
      z
        .enum(["OPENING", "TOP_UP", "DEBIT", "CREDIT", "ADJUSTMENT"])
        .optional(),
    ),
  village: z.string().optional(),
  villages: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  group: z.string().optional(),
  groups: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  month: z.string().optional(),
  months: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  year: z.string().optional(),
  years: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  policyTypes: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  areas: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  sumInsureds: z.preprocess(queryToStringArray, z.array(z.string()).optional()),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  policyId: z.string().optional(),
  page: z.coerce.number().min(1).optional(),
  pageSize: z.coerce.number().min(1).max(100).optional(),
});

function queryToStringArray(v: unknown): string[] | undefined {
  if (v == null || v === "") return undefined;
  if (Array.isArray(v)) {
    const out = v.flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter(Boolean);
    return out.length ? out : undefined;
  }
  const s = String(v).trim();
  if (!s) return undefined;
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

const misExportQuerySchema = z.object({
  dimension: z.enum(WALLET_MIS_DIMENSIONS).optional().default("category"),
});

function mapSnapshots(body: {
  dateOfSubmission?: Date;
  month?: string;
  year?: string;
  holderName?: string;
  village?: string;
  group?: string;
  policyType?: string;
  cdAccountUsed?: string;
  cdAmount?: string | number;
  remark?: string;
  particulars?: string;
  reference?: string;
  policyId?: string;
  policyNumber?: string;
}) {
  return {
    dateOfSubmission: body.dateOfSubmission ?? null,
    monthText: body.month,
    yearText: body.year,
    holderName: body.holderName,
    village: body.village,
    groupName: body.group,
    policyTypeName: body.policyType,
    cdAccountUsed: body.cdAccountUsed,
    cdAmount: body.cdAmount != null ? String(body.cdAmount) : null,
    remark: body.remark,
    particulars: body.particulars ?? body.remark,
    reference: body.reference,
    policyId: body.policyId,
    policyNumber: body.policyNumber,
  };
}

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
      const body = openingBody.parse(req.body);
      const data = await setOpeningBalance(body.amount, req.userId, body.dateOfSubmission);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/topup", requirePermission("wallet:topup"), async (req, res, next) => {
    try {
      const body = topupBody.parse(req.body);
      const data = await topUpWallet(body.amount, body.remark, req.userId, body.dateOfSubmission);
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
        particulars: body.remark ?? body.particulars,
        reference: body.reference,
        allowNegative: body.allowNegative,
        userId: req.userId,
        dateOfSubmission: body.dateOfSubmission ?? null,
        monthText: body.month,
        yearText: body.year,
        holderName: body.holderName,
        village: body.village,
        groupName: body.group,
        policyTypeName: body.policyType,
        cdAccountUsed: body.cdAccountUsed,
        cdAmount: body.cdAmount,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/adjustment", requirePermission("wallet:debit"), async (req, res, next) => {
    try {
      const body = adjustmentBody.parse(req.body);
      const nested = body.snapshots ?? {};
      const data = await adjustWallet({
        amount: body.amount,
        direction: body.direction,
        remark: body.remark ?? nested.remark,
        category: body.category,
        allowNegative: body.allowNegative,
        userId: req.userId,
        snapshots: mapSnapshots({
          dateOfSubmission: nested.dateOfSubmission ?? body.dateOfSubmission,
          month: nested.month ?? body.month,
          year: nested.year ?? body.year,
          holderName: nested.holderName ?? body.holderName,
          village: nested.village ?? body.village,
          group: nested.group ?? body.group,
          policyType: nested.policyType ?? body.policyType,
          cdAccountUsed: nested.cdAccountUsed ?? body.cdAccountUsed,
          cdAmount: nested.cdAmount ?? body.cdAmount,
          remark: nested.remark ?? body.remark,
          particulars: nested.particulars,
          reference: nested.reference,
          policyId: nested.policyId,
          policyNumber: nested.policyNumber,
        }),
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/restore", requirePermission("wallet:clear"), async (req, res, next) => {
    try {
      const body = restoreBody.parse(req.body);
      const data = await restoreWalletFromBackup(body.confirm, body.backup, req.userId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  });

  r.post("/clear", requirePermission("wallet:clear"), async (req, res, next) => {
    try {
      const body = clearBody.parse(req.body);
      const data = await clearWalletAllEntries(body.confirm);
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

  r.get("/mis/export.csv", requirePermission("wallet:export"), async (req, res, next) => {
    try {
      const { dimension } = misExportQuerySchema.parse(req.query);
      const csv = await buildWalletMisExportCsv(dimension);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${walletMisExportFilename(dimension)}"`,
      );
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
