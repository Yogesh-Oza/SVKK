import { NotificationType } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import type { AppLogger } from "../../utils/logger.js";
import { sendEmail, isEmailConfigured } from "../email/email.service.js";
import { renderEmailTemplate } from "../email/email-template.service.js";
import type { EmailTemplateId } from "../email/email-template-catalog.js";
import { buildReceiptFieldsHtml } from "../email/email-receipt-fields.js";
import {
  formatDateDmy,
  policyDocumentLinkHtml,
  resolveNotificationLinks,
} from "./policy-url.js";

type PolicyBundle = {
  id: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  policyUrl: string | null;
  policyUrl2: string | null;
  createdById: string | null;
  insuredParty: { name: string; email: string | null; svkkPublicId: string };
  years: { yearLabel: string; policyEnd: Date | null }[];
};

async function loadPolicyBundle(policyId: string): Promise<PolicyBundle | null> {
  return prisma.policy.findFirst({
    where: { id: policyId, deletedAt: null },
    select: {
      id: true,
      policyNo: true,
      referenceNo: true,
      village: true,
      policyUrl: true,
      policyUrl2: true,
      createdById: true,
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

async function receiptFieldsHtmlForPolicy(policyId: string, holderName: string): Promise<string> {
  const receipt = await prisma.receipt.findFirst({
    where: { policyId },
    orderBy: { createdAt: "desc" },
    select: {
      receiptNo: true,
      policyDate: true,
      amount: true,
      paymentMode: true,
    },
  });
  if (!receipt) return "";

  const policy = await prisma.policy.findFirst({
    where: { id: policyId },
    select: {
      policyNo: true,
      village: true,
      area: true,
      contactPhone: true,
      insuredParty: {
        select: {
          svkkPublicId: true,
          customerId: true,
          email: true,
          pan: true,
          aadhaarNo: true,
        },
      },
      category: { select: { name: true } },
      policyType: { select: { name: true } },
      personsInsuredCount: true,
    },
  });

  const ip = policy?.insuredParty;
  return buildReceiptFieldsHtml({
    receiptNo: receipt.receiptNo,
    receiptDate: formatDateDmy(receipt.policyDate),
    svkkId: ip?.svkkPublicId ?? "",
    customerId: ip?.customerId ?? "",
    policyHolderName: holderName,
    policyNo: policy?.policyNo ?? "",
    area: policy?.area ?? "",
    phoneNo: policy?.contactPhone ?? "",
    emailId: ip?.email ?? "",
    village: policy?.village ?? "",
    personCount: policy?.personsInsuredCount != null ? String(policy.personsInsuredCount) : "",
    category: policy?.category?.name ?? "",
    policyType: policy?.policyType?.name ?? "",
    premiumAmount: String(receipt.amount),
    amountReceived: String(receipt.amount),
    paymentMode: receipt.paymentMode ?? "",
  });
}

function templateVarsFromPolicy(env: Env, p: PolicyBundle, yearLabel?: string, policyEnd?: Date | null) {
  const links = resolveNotificationLinks(env, p);
  const documentUrl = links.policyDocumentUrl;
  return {
    holderName: p.insuredParty.name,
    svkkPublicId: p.insuredParty.svkkPublicId,
    referenceNo: p.referenceNo ?? "—",
    policyNo: p.policyNo ?? "—",
    village: p.village ?? "—",
    yearLabel: yearLabel ?? p.years[0]?.yearLabel ?? "—",
    policyEndDate: formatDateDmy(policyEnd ?? p.years[0]?.policyEnd),
    /** Policy URL field from the policy form (OneDrive / shared link) — not the SVKK app URL */
    policyUrl: documentUrl,
    documentUrl,
    policyDocumentLink: policyDocumentLinkHtml(documentUrl || null),
    appPolicyUrl: links.appPolicyUrl,
  };
}

async function createStaffNotification(input: {
  policyId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string;
  actorUserId?: string | null;
  emailTo?: string | null;
  emailSent?: boolean;
}) {
  await prisma.notification.create({
    data: {
      policyId: input.policyId,
      type: input.type,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl,
      userId: null,
      emailTo: input.emailTo ?? null,
      emailSent: input.emailSent ?? false,
    },
  });
}

async function emailHolderIfPossible(
  env: Env,
  log: AppLogger,
  templateId: EmailTemplateId,
  to: string | null | undefined,
  vars: Record<string, string>,
): Promise<boolean> {
  if (!to?.trim()) return false;
  const rendered = await renderEmailTemplate(templateId, vars);
  return sendEmail(env, log, { to: to.trim(), subject: rendered.subject, html: rendered.html });
}

export async function notifyPolicyCreated(
  env: Env,
  log: AppLogger,
  input: { policyId: string; actorUserId: string },
): Promise<void> {
  const p = await loadPolicyBundle(input.policyId);
  if (!p) return;

  const receiptFields = await receiptFieldsHtmlForPolicy(p.id, p.insuredParty.name);
  const vars = { ...templateVarsFromPolicy(env, p), receiptFields };
  const { staffLinkUrl } = resolveNotificationLinks(env, p);
  const emailSent = await emailHolderIfPossible(
    env,
    log,
    "mediclaim_new_policy_ack",
    p.insuredParty.email,
    vars,
  );

  await createStaffNotification({
    policyId: p.id,
    type: NotificationType.POLICY_CREATED,
    title: "Policy created",
    body: `${p.insuredParty.name} — ${p.referenceNo ?? p.insuredParty.svkkPublicId}${
      emailSent ? " (email sent)" : isEmailConfigured(env) ? "" : " (email not configured)"
    }`,
    linkUrl: staffLinkUrl,
    actorUserId: input.actorUserId,
    emailTo: p.insuredParty.email,
    emailSent,
  });
}

export async function notifyPolicyNumberOrDocumentUpdated(
  env: Env,
  log: AppLogger,
  input: {
    policyId: string;
    actorUserId: string;
    policyNoChanged: boolean;
    documentUrlChanged: boolean;
  },
): Promise<void> {
  if (!input.policyNoChanged && !input.documentUrlChanged) return;

  const p = await loadPolicyBundle(input.policyId);
  if (!p) return;

  const vars = templateVarsFromPolicy(env, p);
  const { staffLinkUrl } = resolveNotificationLinks(env, p);
  const emailSent = await emailHolderIfPossible(
    env,
    log,
    "policy_number_updated",
    p.insuredParty.email,
    vars,
  );

  const parts: string[] = [];
  if (input.policyNoChanged) parts.push(`Policy No: ${p.policyNo ?? "—"}`);
  if (input.documentUrlChanged) parts.push("Document link updated");

  await createStaffNotification({
    policyId: p.id,
    type: NotificationType.POLICY_NUMBER_UPDATED,
    title: "Policy number / document updated",
    body: `${p.insuredParty.name} — ${parts.join("; ")}`,
    linkUrl: staffLinkUrl,
    actorUserId: input.actorUserId,
    emailTo: p.insuredParty.email,
    emailSent,
  });
}
