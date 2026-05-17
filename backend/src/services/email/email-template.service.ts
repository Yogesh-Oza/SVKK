import { prisma } from "../../lib/prisma.js";
import {
  EMAIL_TEMPLATE_CATALOG,
  type EmailTemplateDefinition,
  type EmailTemplateId,
  getTemplateDefinition,
} from "./email-template-catalog.js";

export type RenderedEmail = { subject: string; html: string };

function renderPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export async function getEmailTemplateContent(
  templateId: EmailTemplateId,
): Promise<{ subject: string; html: string }> {
  const def = getTemplateDefinition(templateId);
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [def.subjectKey, def.htmlKey] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    subject: map.get(def.subjectKey)?.trim() || def.defaultSubject,
    html: map.get(def.htmlKey)?.trim() || def.defaultHtml,
  };
}

export async function renderEmailTemplate(
  templateId: EmailTemplateId,
  vars: Record<string, string>,
): Promise<RenderedEmail> {
  const { subject, html } = await getEmailTemplateContent(templateId);
  return {
    subject: renderPlaceholders(subject, vars),
    html: renderPlaceholders(html, vars),
  };
}

export async function listEmailTemplatesForAdmin(): Promise<
  Array<
    EmailTemplateDefinition & {
      subject: string;
      html: string;
    }
  >
> {
  const keys = EMAIL_TEMPLATE_CATALOG.flatMap((t) => [t.subjectKey, t.htmlKey]);
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return EMAIL_TEMPLATE_CATALOG.map((def) => ({
    ...def,
    subject: map.get(def.subjectKey)?.trim() || def.defaultSubject,
    html: map.get(def.htmlKey)?.trim() || def.defaultHtml,
  }));
}

export async function saveEmailTemplate(
  templateId: EmailTemplateId,
  subject: string,
  html: string,
): Promise<void> {
  const def = getTemplateDefinition(templateId);
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: def.subjectKey },
      update: { value: subject },
      create: { key: def.subjectKey, value: subject },
    }),
    prisma.appSetting.upsert({
      where: { key: def.htmlKey },
      update: { value: html },
      create: { key: def.htmlKey, value: html },
    }),
  ]);
}

export async function seedDefaultEmailTemplatesIfMissing(): Promise<void> {
  for (const def of EMAIL_TEMPLATE_CATALOG) {
    const existing = await prisma.appSetting.findMany({
      where: { key: { in: [def.subjectKey, def.htmlKey] } },
    });
    if (existing.length >= 2) continue;
    await saveEmailTemplate(def.id, def.defaultSubject, def.defaultHtml);
  }
}
