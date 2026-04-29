import { Router } from "express";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { CounterType, type Prisma } from "@prisma/client";
import { allocateCounter, formatReceiptNo } from "../../services/counter.service.js";
import { AppError } from "../../errors/app-error.js";
import { assertPolicyReadable, loadMisScope } from "../../services/mis-scope.service.js";

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

      const scope = await loadMisScope(req.userId!, req.userRole!);
      const policy = await prisma.policy.findUnique({
        where: { id: String(req.params.policyId) },
        include: {
          insuredParty: true,
          policyType: true,
          category: true,
          years: {
            ...(body.policyYearId ? { where: { id: body.policyYearId } } : {}),
            ...(!body.policyYearId ? { take: 1 } : {}),
            orderBy: { yearLabel: "desc" },
            include: {
              payments: {
                where: { deletedAt: null },
                include: { cheque: true },
              },
            },
          },
        },
      });
      if (!policy) throw new AppError("NOT_FOUND", "Policy not found", 404);
      assertPolicyReadable(policy, req.userId!, req.userRole!, scope);

      const year = policy.years[0];
      const policyDate = year?.policyEnd ?? year?.policyStart ?? new Date();
      const period = String(policyDate.getFullYear());

      const { receiptNo, pdfPath } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const seq = await allocateCounter(CounterType.RECEIPT, period, tx);
        const no = formatReceiptNo(period, seq);
        const pdfBytes = await buildReceiptPdf({
          receiptNo: no,
          referenceNo: policy.referenceNo ?? "",
          policyNo: policy.policyNo ?? "",
          policyHolderName: policy.insuredParty?.name ?? "",
          svkkId: policy.insuredParty?.svkkPublicId ?? "",
          policyType: policy.adProductVariant?.replaceAll("_", "-") || policy.policyType?.name || "",
          customerId: policy.insuredParty?.customerId ?? "",
          panNo: policy.insuredParty?.pan ?? "",
          area: policy.area ?? "",
          village: policy.village ?? "",
          personCount: policy.personsInsuredCount,
          category: policy.category?.key ?? policy.category?.name ?? "",
          sumInsured: year?.sumInsured,
          premium: body.amount,
          bankName: year?.payments?.find((p) => p.cheque)?.cheque?.bankName ?? year?.bankName ?? "",
          chequeNo: year?.payments?.find((p) => p.cheque)?.cheque?.number ?? "",
          remark: policy.remarks ?? "",
          date: policyDate,
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
  referenceNo: string;
  policyNo: string;
  policyHolderName: string;
  svkkId: string;
  policyType: string;
  customerId: string;
  panNo: string;
  area: string;
  village: string;
  personCount: number | null;
  category: string;
  sumInsured: unknown;
  premium: number;
  bankName: string;
  chequeNo: string;
  remark: string;
  date: Date;
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.28, 0.2, 0.14);
  const margin = 32;
  let y = 810;

  const logoBytes = await readLogoPng();
  if (logoBytes) {
    const img = await doc.embedPng(logoBytes);
    const w = 120;
    const h = (img.height / img.width) * w;
    page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
    y -= h + 20;
  }

  const dateStr = formatDmy(input.date);
  page.drawText("Receipt no:", { x: margin, y, size: 11, font: fontBold, color: ink });
  page.drawText(input.receiptNo || "—", { x: margin + 62, y, size: 11, font: fontBold, color: ink });
  page.drawText(`Date:  ${dateStr}`, { x: 315, y, size: 11, font: fontBold, color: ink });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: 565, y }, thickness: 0.8, color: rgb(0.4, 0.4, 0.4) });
  y -= 24;

  const rows: Array<[string, string]> = [
    ["Receipt No:", input.referenceNo || input.receiptNo || "—"],
    ["SVKK ID:", input.svkkId || "—"],
    ["Policy Holder:", input.policyHolderName || "—"],
    ["Policy Type:", input.policyType || "—"],
    ["Customer ID:", input.customerId || "—"],
    ["Pan No:", input.panNo || "—"],
    ["Area:", input.area || "—"],
    ["Village:", input.village || "—"],
    ["Policy No:", input.policyNo || "—"],
    ["Person:", input.personCount != null ? String(input.personCount) : "—"],
    ["Category:", input.category || "—"],
    ["Sum Insured:", safeToText(input.sumInsured) || "—"],
    ["Cheque No:", input.chequeNo ? `CH- ${input.chequeNo}` : "—"],
    ["Premium:", safeToText(input.premium) || "—"],
    ["Bank Name:", input.bankName || "—"],
    ["Remark:", input.remark || ""],
  ];

  for (const [k, v] of rows) {
    page.drawText(k, { x: margin, y, size: 10.5, font: fontBold, color: ink });
    page.drawText(v, { x: 130, y, size: 10.5, font, color: ink, maxWidth: 420 });
    y -= 28;
  }

  y += 10;
  page.drawLine({ start: { x: margin, y }, end: { x: 565, y }, thickness: 0.8, color: rgb(0.4, 0.4, 0.4) });
  y -= 24;
  const footer = "This is a Computer-Generated Receipt and does not require a Physical Signature or Seal.";
  page.drawText(footer, { x: margin, y, size: 10, font, color: ink });
  return doc.save();
}

function safeToText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "toString" in (v as object)) {
    return (v as { toString(): string }).toString();
  }
  return "";
}

function formatDmy(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

async function readLogoPng(): Promise<Uint8Array | null> {
  const candidates = [
    resolve(process.cwd(), "src", "assets", "svkk_logo.png"),
    resolve(process.cwd(), "..", "frontend", "public", "svkk_logo.png"),
    resolve(process.cwd(), "public", "svkk_logo.png"),
  ];
  for (const p of candidates) {
    try {
      await access(p);
      return await readFile(p);
    } catch {
      continue;
    }
  }
  return null;
}
