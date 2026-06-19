import nodemailer from "nodemailer";
import type { Env } from "../../config/env.js";
import type { AppLogger } from "../../utils/logger.js";
import {
  writeEmailActivityLog,
  type EmailActivityContext,
} from "./email-activity-log.service.js";

export type { EmailActivityContext };

let transporter: nodemailer.Transporter | null = null;

function getTransporter(env: Env): nodemailer.Transporter | null {
  if (!env.SMTP_HOST?.trim() || !env.SMTP_FROM?.trim()) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      auth:
        env.SMTP_USER?.trim() && env.SMTP_PASS?.trim()
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }
  return transporter;
}

export function isEmailConfigured(env: Env): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_FROM?.trim());
}

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendEmail(
  env: Env,
  log: AppLogger,
  input: {
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
    activity?: EmailActivityContext;
  },
): Promise<boolean> {
  const to = input.to.trim();
  const activity = input.activity;

  if (!to) {
    log.warn("sendEmail skipped: empty recipient");
    if (activity) {
      await writeEmailActivityLog({
        context: activity,
        to: "",
        subject: input.subject,
        action: "EMAIL_SKIPPED",
        reason: "empty_recipient",
      });
    }
    return false;
  }
  const tx = getTransporter(env);
  if (!tx) {
    log.warn({ to }, "sendEmail skipped: SMTP not configured");
    if (activity) {
      await writeEmailActivityLog({
        context: activity,
        to,
        subject: input.subject,
        action: "EMAIL_SKIPPED",
        reason: "smtp_not_configured",
      });
    }
    return false;
  }
  try {
    await tx.sendMail({
      from: env.SMTP_FROM!,
      to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType ?? "application/octet-stream",
      })),
    });
    if (activity) {
      await writeEmailActivityLog({
        context: activity,
        to,
        subject: input.subject,
        action: "EMAIL_SENT",
      });
    }
    return true;
  } catch (err) {
    log.error({ err, to }, "sendEmail failed");
    if (activity) {
      await writeEmailActivityLog({
        context: activity,
        to,
        subject: input.subject,
        action: "EMAIL_FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    return false;
  }
}
