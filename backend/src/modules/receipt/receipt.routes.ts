import { Router } from "express";
import { z } from "zod";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { CounterType, type Prisma } from "@prisma/client";
import { allocateCounter, formatReceiptNo } from "../../services/counter.service.js";
import { AppError } from "../../errors/app-error.js";

export function createReceiptRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.post("/policies/:policyId", requirePermission("receipt:create"), async (req, res, next) => {
    try {
      const body = z
        .object({
          policyYearId: z.string().optional().nullable(),
          amount: z.number().positive(),
          paymentMode: z.string().optional().nullable(),
        })
        .parse(req.body);

      const policy = await prisma.policy.findUnique({
        where: { id: String(req.params.policyId) },
        include: {
          years: {
            ...(body.policyYearId ? { where: { id: body.policyYearId } } : {}),
            ...(!body.policyYearId ? { take: 1 } : {}),
            orderBy: { yearLabel: "desc" },
          },
        },
      });
      if (!policy) throw new AppError("NOT_FOUND", "Policy not found", 404);

      const year = policy.years[0];
      const policyDate = year?.policyEnd ?? year?.policyStart ?? new Date();
      const period = String(policyDate.getFullYear());

      const { receiptNo, pdfPath } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const seq = await allocateCounter(CounterType.RECEIPT, period, tx);
        const no = formatReceiptNo(period, seq);
        const pdfBytes = await buildReceiptPdf({
          receiptNo: no,
          policyNo: policy.policyNo ?? policy.id,
          amount: body.amount,
          policyDate,
          paymentMode: body.paymentMode ?? "",
        });
        await mkdir(env.UPLOAD_DIR, { recursive: true });
        const filename = `receipt-${no}.pdf`;
        const path = join(env.UPLOAD_DIR, filename);
        await writeFile(path, pdfBytes);

        const rec = await tx.receipt.create({
          data: {
            policyId: policy.id,
            policyYearId: year?.id,
            receiptNo: no,
            amount: body.amount,
            paymentMode: body.paymentMode ?? undefined,
            s3Key: path,
            policyDate,
          },
        });
        return { receiptNo: rec.receiptNo, pdfPath: path };
      });

      res.status(201).json({ receiptNo, pdfPath });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

async function buildReceiptPdf(input: {
  receiptNo: string;
  policyNo: string;
  amount: number;
  policyDate: Date;
  paymentMode: string;
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "SVKK — Premium Receipt",
    `Receipt No: ${input.receiptNo}`,
    `Policy Ref: ${input.policyNo}`,
    `Policy date: ${input.policyDate.toISOString().slice(0, 10)}`,
    `Amount: INR ${input.amount.toFixed(2)}`,
    `Mode: ${input.paymentMode || "—"}`,
  ];
  let y = 270;
  for (const line of lines) {
    page.drawText(line, { x: 40, y, size: 11, font });
    y -= 18;
  }
  return doc.save();
}
