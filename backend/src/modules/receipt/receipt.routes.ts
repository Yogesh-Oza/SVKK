import { Router } from "express";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { createReceiptOnPolicyCreate, resolveReceiptAmount } from "../../services/receipt.service.js";
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

      const scope = await loadMisScope(req.userId!, req.permissions!, "policy");
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
      assertPolicyReadable(policy, req.userId!, req.permissions!, scope);

      const year = policy.years[0];
      if (!year) {
        throw new AppError("BAD_REQUEST", "Policy has no year row for receipt", 400);
      }

      const existingReceipt = await prisma.receipt.findFirst({
        where: { policyId: policy.id },
        orderBy: { createdAt: "asc" },
      });
      if (existingReceipt) {
        throw new AppError(
          "CONFLICT",
          "Receipt was already issued when this policy was created",
          409,
        );
      }

      const issuedAt = policy.createdAt;

      const { receiptNo, pdfPath } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const pay0 = year?.payments?.[0];
        const amount =
          body.amount ||
          resolveReceiptAmount({
            vkkPremium: year.vkkPremium != null ? Number(year.vkkPremium) : null,
            amountReceived: year.amountReceived != null ? Number(year.amountReceived) : null,
            expectedNetPremium:
              year.expectedNetPremium != null ? Number(year.expectedNetPremium) : null,
          });
        const rec = await createReceiptOnPolicyCreate(tx, {
          policyId: policy.id,
          policyYearId: year.id,
          amount,
          paymentMode: body.paymentMode ?? pay0?.method ?? null,
          issuedAt,
        });
        const no = rec.receiptNo;
        const pdfBytes = await buildReceiptPdf({
          receiptNo: no,
          referenceNo: policy.referenceNo ?? "",
          policyNo: policy.policyNo ?? "",
          previousPolicyNo: policy.previousPolicyNo ?? "",
          policyHolderName: policy.insuredParty?.name ?? "",
          svkkId: policy.insuredParty?.svkkPublicId ?? "",
          policyType: policy.adProductVariant?.replaceAll("_", "-") || policy.policyType?.name || "",
          customerId: policy.insuredParty?.customerId ?? "",
          panNo: policy.insuredParty?.pan ?? "",
          aadhaarNo: policy.insuredParty?.aadhaarNo ?? "",
          phoneNo: policy.insuredParty?.mobile ?? "",
          emailId: policy.insuredParty?.email ?? "",
          area: policy.area ?? "",
          village: policy.village ?? "",
          personCount: policy.personsInsuredCount,
          category: policy.category?.key ?? policy.category?.name ?? "",
          sumInsured: year?.sumInsured,
          premium: body.amount,
          notOver: pay0?.notOver ?? "",
          bankCharges: pay0?.returnCharges != null ? Number(pay0.returnCharges) : null,
          nameAsPerCheque: pay0?.nameAsPerCheque ?? "",
          otherCharges: pay0?.otherCharges != null ? Number(pay0.otherCharges) : null,
          amountReceived: year?.amountReceived != null ? Number(year.amountReceived) : null,
          paymentMode: pay0?.method ?? "",
          bankName: pay0?.bankName ?? year?.bankName ?? "",
          transactionNo: pay0?.transactionNumber ?? "",
          transactionDate: pay0?.transactionDate ?? null,
          chequeNo: year?.payments?.find((p) => p.cheque)?.cheque?.number ?? "",
          remark: policy.remarks ?? "",
          generalRemark: policy.remarks ?? "",
          date: rec.policyDate ?? issuedAt,
        });
        await mkdir(env.UPLOAD_DIR, { recursive: true });
        const filename = `receipt-${no}.pdf`;
        const path = join(env.UPLOAD_DIR, filename);
        await writeFile(path, pdfBytes);

        await tx.receipt.update({
          where: { id: rec.id },
          data: { s3Key: path },
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
  previousPolicyNo: string;
  policyHolderName: string;
  svkkId: string;
  policyType: string;
  customerId: string;
  panNo: string;
  aadhaarNo: string;
  phoneNo: string;
  emailId: string;
  area: string;
  village: string;
  personCount: number | null;
  category: string;
  sumInsured: unknown;
  premium: number;
  notOver: string;
  bankCharges: number | null;
  nameAsPerCheque: string;
  otherCharges: number | null;
  amountReceived: number | null;
  paymentMode: string;
  bankName: string;
  transactionNo: string;
  transactionDate: Date | null;
  chequeNo: string;
  remark: string;
  generalRemark: string;
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

  const fmtAmt = (v: number | null) => v != null ? String(v) : "—";

  const rows: Array<[string, string]> = [
    ["Receipt No.", input.receiptNo || "—"],
    ["Date", dateStr],
    ["SVKK ID", input.svkkId || "—"],
    ["Customer ID", input.customerId || "—"],
    ["Policy No.", input.policyNo || "—"],
    ["Previous Policy No.", input.previousPolicyNo || "—"],
    ["Policy Holder Name", input.policyHolderName || "—"],
    ["Area", input.area || "—"],
    ["Phone No.", input.phoneNo || "—"],
    ["Email ID", input.emailId || "—"],
    ["Village", input.village || "—"],
    ["No. of Person", input.personCount != null ? String(input.personCount) : "—"],
    ["Category", input.category || "—"],
    ["Policy Type", input.policyType || "—"],
    ["Sum Insured", safeToText(input.sumInsured) || "—"],
    ["Premium Amount", safeToText(input.premium) || "—"],
    ["Not Over", input.notOver || "—"],
    ["Bank Charges", fmtAmt(input.bankCharges)],
    ["Name as per Cheque", input.nameAsPerCheque || "—"],
    ["Other Charges", fmtAmt(input.otherCharges)],
    ["Amount Received", fmtAmt(input.amountReceived)],
    ["Mode of Payment", input.paymentMode || "—"],
    ["Bank Name", input.bankName || "—"],
    ["Transaction No.", input.transactionNo || "—"],
    ["Transaction Date", input.transactionDate ? formatDmy(input.transactionDate) : "—"],
    ["PAN No.", input.panNo || "—"],
    ["Aadhaar No.", input.aadhaarNo || "—"],
    ["Remark", input.remark || "—"],
    ["General Remark", input.generalRemark || "—"],
  ];

  for (const [k, v] of rows) {
    page.drawText(k, { x: margin, y, size: 10.5, font: fontBold, color: ink });
    page.drawText(v, { x: 150, y, size: 10.5, font, color: ink, maxWidth: 400 });
    y -= 22;
    if (y < 60) {
      const newPage = doc.addPage([595, 842]);
      y = 810;
      void newPage;
    }
  }

  y += 6;
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
