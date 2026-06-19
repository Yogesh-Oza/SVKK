import { z } from "zod";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { prisma } from "../../lib/prisma.js";
import type { AppLogger } from "../../utils/logger.js";
import { downloadOneDriveFileById } from "../one-drive.service.js";
import { writeEmailActivityLog } from "./email-activity-log.service.js";
import { extractEmailBody, wrapEmailBodyForTemplate } from "./email-layout.js";
import { isEmailConfigured, sendEmail } from "./email.service.js";
import { EMAIL_TEMPLATE_SAMPLE_VARS } from "./email-template-sample-vars.js";
import { templateVarsFromPolicy, type PolicyBundle } from "./policy-template-vars.js";

export const CATEGORY_FORM_TEMPLATE_ID = "category_form";

export const CATEGORY_FORM_SUBJECT_KEY = "category_form_subject";
export const CATEGORY_FORM_HTML_KEY = "category_form_html";
export const CATEGORY_FORM_PDF_FILE_ID_KEY = "category_form_pdf_file_id";
export const CATEGORY_FORM_PDF_FILE_NAME_KEY = "category_form_pdf_file_name";
export const CATEGORY_FORM_PDF_WEB_URL_KEY = "category_form_pdf_web_url";

export const CATEGORY_FORM_VARIABLES = [
  "holderName",
  "policyNo",
  "svkkPublicId",
  "referenceNo",
  "policyDocumentLink",
  "village",
  "yearLabel",
] as const;

const DEFAULT_SUBJECT = "Category form — Policy {{policyNo}}";
const DEFAULT_BODY_INNER = `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>Please find attached the category form for your Mediclaim policy.</p>
<div class="policy-block">
<p><strong>Policy No:</strong> {{policyNo}}<br/>
<strong>SVKK ID:</strong> {{svkkPublicId}}</p>
</div>
<p>Kindly complete the attached form and return it to our office at your earliest convenience.</p>`;

const DEFAULT_HTML = wrapEmailBodyForTemplate(CATEGORY_FORM_TEMPLATE_ID, DEFAULT_BODY_INNER);

export type CategoryFormPdfMeta = {
  fileId: string | null;
  fileName: string | null;
  webUrl: string | null;
};

export type CategoryFormAdminView = {
  label: string;
  description: string;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  variables: string[];
  pdf: CategoryFormPdfMeta;
};

export type CategoryFormPreviewResult = {
  policyCount: number;
  emailableCount: number;
  skippedCount: number;
};

export type CategoryFormSendResult = {
  sent: number;
  skipped: number;
  failed: number;
};

function renderPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function isEmailableHolderEmail(email: string | null | undefined): boolean {
  const trimmed = email?.trim();
  if (!trimmed || !trimmed.includes("@")) return false;
  if (trimmed.toLowerCase().endsWith("@import.svkk.local")) return false;
  return z.string().email().safeParse(trimmed).success;
}

export function renderCategoryFormDraft(
  subject: string,
  body: string,
  vars: Record<string, string> = EMAIL_TEMPLATE_SAMPLE_VARS,
): { subject: string; html: string } {
  const html = wrapEmailBodyForTemplate(CATEGORY_FORM_TEMPLATE_ID, body.trim());
  return {
    subject: renderPlaceholders(subject.trim(), vars),
    html: renderPlaceholders(html, vars),
  };
}

async function loadAppSettingMap(keys: string[]): Promise<Map<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  return new Map(rows.map((r) => [r.key, r.value]));
}

function pdfMetaFromMap(map: Map<string, string>): CategoryFormPdfMeta {
  return {
    fileId: map.get(CATEGORY_FORM_PDF_FILE_ID_KEY)?.trim() || null,
    fileName: map.get(CATEGORY_FORM_PDF_FILE_NAME_KEY)?.trim() || null,
    webUrl: map.get(CATEGORY_FORM_PDF_WEB_URL_KEY)?.trim() || null,
  };
}

export async function getCategoryFormForAdmin(): Promise<CategoryFormAdminView> {
  const keys = [
    CATEGORY_FORM_SUBJECT_KEY,
    CATEGORY_FORM_HTML_KEY,
    CATEGORY_FORM_PDF_FILE_ID_KEY,
    CATEGORY_FORM_PDF_FILE_NAME_KEY,
    CATEGORY_FORM_PDF_WEB_URL_KEY,
  ];
  const map = await loadAppSettingMap(keys);
  const stored = map.get(CATEGORY_FORM_HTML_KEY)?.trim() || DEFAULT_HTML;
  return {
    label: "Category form",
    description:
      "Email sent to policy holders in selected categories with the category form PDF attached.",
    subject: map.get(CATEGORY_FORM_SUBJECT_KEY)?.trim() || DEFAULT_SUBJECT,
    body: extractEmailBody(stored),
    defaultSubject: DEFAULT_SUBJECT,
    defaultBody: extractEmailBody(DEFAULT_HTML),
    variables: [...CATEGORY_FORM_VARIABLES],
    pdf: pdfMetaFromMap(map),
  };
}

export async function saveCategoryForm(subject: string, body: string): Promise<void> {
  const html = wrapEmailBodyForTemplate(CATEGORY_FORM_TEMPLATE_ID, body);
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: CATEGORY_FORM_SUBJECT_KEY },
      update: { value: subject },
      create: { key: CATEGORY_FORM_SUBJECT_KEY, value: subject },
    }),
    prisma.appSetting.upsert({
      where: { key: CATEGORY_FORM_HTML_KEY },
      update: { value: html },
      create: { key: CATEGORY_FORM_HTML_KEY, value: html },
    }),
  ]);
}

export async function saveCategoryFormPdf(meta: {
  fileId: string;
  fileName: string;
  webUrl: string;
}): Promise<void> {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: CATEGORY_FORM_PDF_FILE_ID_KEY },
      update: { value: meta.fileId },
      create: { key: CATEGORY_FORM_PDF_FILE_ID_KEY, value: meta.fileId },
    }),
    prisma.appSetting.upsert({
      where: { key: CATEGORY_FORM_PDF_FILE_NAME_KEY },
      update: { value: meta.fileName },
      create: { key: CATEGORY_FORM_PDF_FILE_NAME_KEY, value: meta.fileName },
    }),
    prisma.appSetting.upsert({
      where: { key: CATEGORY_FORM_PDF_WEB_URL_KEY },
      update: { value: meta.webUrl },
      create: { key: CATEGORY_FORM_PDF_WEB_URL_KEY, value: meta.webUrl },
    }),
  ]);
}

export async function clearCategoryFormPdf(): Promise<void> {
  const keys = [
    CATEGORY_FORM_PDF_FILE_ID_KEY,
    CATEGORY_FORM_PDF_FILE_NAME_KEY,
    CATEGORY_FORM_PDF_WEB_URL_KEY,
  ];
  await prisma.appSetting.deleteMany({ where: { key: { in: keys } } });
}

export async function seedDefaultCategoryFormIfMissing(): Promise<void> {
  const existing = await prisma.appSetting.findMany({
    where: { key: { in: [CATEGORY_FORM_SUBJECT_KEY, CATEGORY_FORM_HTML_KEY] } },
  });
  if (existing.length >= 2) return;
  await saveCategoryForm(DEFAULT_SUBJECT, extractEmailBody(DEFAULT_HTML));
}

type CategoryPolicyRow = PolicyBundle;

async function loadPoliciesForCategories(categoryIds: string[]): Promise<CategoryPolicyRow[]> {
  return prisma.policy.findMany({
    where: { deletedAt: null, categoryId: { in: categoryIds } },
    select: {
      id: true,
      policyNo: true,
      referenceNo: true,
      village: true,
      policyUrl: true,
      policyUrl2: true,
      insuredParty: { select: { name: true, email: true, svkkPublicId: true } },
      years: {
        where: { deletedAt: null },
        orderBy: { yearLabel: "desc" },
        take: 1,
        select: { yearLabel: true, policyEnd: true },
      },
    },
  });
}

export async function previewCategoryFormRecipients(
  categoryIds: string[],
): Promise<CategoryFormPreviewResult> {
  const uniqueIds = [...new Set(categoryIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    return { policyCount: 0, emailableCount: 0, skippedCount: 0 };
  }
  const policies = await loadPoliciesForCategories(uniqueIds);
  let emailableCount = 0;
  for (const p of policies) {
    if (isEmailableHolderEmail(p.insuredParty.email)) emailableCount += 1;
  }
  return {
    policyCount: policies.length,
    emailableCount,
    skippedCount: policies.length - emailableCount,
  };
}

async function resolvePdfAttachment(
  env: Env,
  pdf: CategoryFormPdfMeta,
): Promise<{ filename: string; content: Buffer; contentType: string }> {
  if (!pdf.fileId) {
    throw new AppError("PDF_REQUIRED", "Upload a category form PDF before sending.", 400);
  }
  const { buffer, mimeType } = await downloadOneDriveFileById(env, pdf.fileId);
  const filename = pdf.fileName?.trim() || "category-form.pdf";
  return {
    filename: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`,
    content: buffer,
    contentType: mimeType.includes("pdf") ? mimeType : "application/pdf",
  };
}

async function sendCategoryFormEmail(
  env: Env,
  log: AppLogger,
  input: {
    to: string;
    subject: string;
    html: string;
    attachment: { filename: string; content: Buffer; contentType: string };
    userId?: string | null;
    policyId?: string;
    source: string;
    vars: Record<string, string>;
  },
): Promise<boolean> {
  return sendEmail(env, log, {
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: [
      {
        filename: input.attachment.filename,
        content: input.attachment.content,
        contentType: input.attachment.contentType,
      },
    ],
    activity: {
      userId: input.userId,
      templateId: CATEGORY_FORM_TEMPLATE_ID,
      source: input.source,
      entityType: input.policyId ? "Policy" : "CategoryForm",
      entityId: input.policyId ?? CATEGORY_FORM_TEMPLATE_ID,
      holderName: input.vars.holderName,
      policyNo: input.vars.policyNo,
      referenceNo: input.vars.referenceNo,
      svkkPublicId: input.vars.svkkPublicId,
    },
  });
}

export async function sendCategoryFormTest(
  env: Env,
  log: AppLogger,
  input: { to: string; subject: string; body: string; userId?: string | null },
): Promise<void> {
  const config = await getCategoryFormForAdmin();
  const rendered = renderCategoryFormDraft(input.subject, input.body);
  const testSubject = `[SVKK Test] ${rendered.subject}`;

  if (!isEmailConfigured(env)) {
    await writeEmailActivityLog({
      context: {
        userId: input.userId,
        templateId: CATEGORY_FORM_TEMPLATE_ID,
        source: "category_form_test",
        entityType: "CategoryForm",
        entityId: CATEGORY_FORM_TEMPLATE_ID,
      },
      to: input.to,
      subject: testSubject,
      action: "EMAIL_SKIPPED",
      reason: "smtp_not_configured",
    });
    throw new AppError(
      "SMTP_NOT_CONFIGURED",
      "SMTP is not configured. Set SMTP_HOST and SMTP_FROM in backend/.env and restart the server.",
      503,
    );
  }

  const attachment = config.pdf.fileId
    ? await resolvePdfAttachment(env, config.pdf)
    : null;

  const sent = await sendEmail(env, log, {
    to: input.to,
    subject: testSubject,
    html: rendered.html,
    attachments: attachment
      ? [
          {
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          },
        ]
      : undefined,
    activity: {
      userId: input.userId,
      templateId: CATEGORY_FORM_TEMPLATE_ID,
      source: "category_form_test",
      entityType: "CategoryForm",
      entityId: CATEGORY_FORM_TEMPLATE_ID,
    },
  });

  if (!sent) {
    throw new AppError("EMAIL_SEND_FAILED", "Failed to send test email. Check SMTP settings and server logs.", 502);
  }
}

export async function sendCategoryFormToCategories(
  env: Env,
  log: AppLogger,
  input: {
    categoryIds: string[];
    subject: string;
    body: string;
    userId?: string | null;
  },
): Promise<CategoryFormSendResult> {
  const uniqueIds = [...new Set(input.categoryIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) {
    throw new AppError("VALIDATION", "Select at least one category.", 400);
  }

  if (!isEmailConfigured(env)) {
    throw new AppError(
      "SMTP_NOT_CONFIGURED",
      "SMTP is not configured. Set SMTP_HOST and SMTP_FROM in backend/.env and restart the server.",
      503,
    );
  }

  const config = await getCategoryFormForAdmin();
  const attachment = await resolvePdfAttachment(env, config.pdf);
  const policies = await loadPoliciesForCategories(uniqueIds);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const policy of policies) {
    const to = policy.insuredParty.email;
    if (!isEmailableHolderEmail(to)) {
      skipped += 1;
      const rendered = renderCategoryFormDraft(input.subject, input.body, templateVarsFromPolicy(env, policy));
      await writeEmailActivityLog({
        context: {
          userId: input.userId,
          templateId: CATEGORY_FORM_TEMPLATE_ID,
          source: "category_form_send",
          entityType: "Policy",
          entityId: policy.id,
          holderName: policy.insuredParty.name,
          policyNo: policy.policyNo ?? "—",
          referenceNo: policy.referenceNo ?? "—",
          svkkPublicId: policy.insuredParty.svkkPublicId,
        },
        to: to?.trim() ?? "",
        subject: rendered.subject,
        action: "EMAIL_SKIPPED",
        reason: "no_recipient",
      });
      continue;
    }

    const vars = templateVarsFromPolicy(env, policy);
    const rendered = renderCategoryFormDraft(input.subject, input.body, vars);
    const ok = await sendCategoryFormEmail(env, log, {
      to: to!.trim(),
      subject: rendered.subject,
      html: rendered.html,
      attachment,
      userId: input.userId,
      policyId: policy.id,
      source: "category_form_send",
      vars,
    });
    if (ok) sent += 1;
    else failed += 1;
  }

  return { sent, skipped, failed };
}
