import nodemailer from "nodemailer";
import type { Env } from "../../config/env.js";
import type { AppLogger } from "../../utils/logger.js";

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

export async function sendEmail(
  env: Env,
  log: AppLogger,
  input: { to: string; subject: string; html: string },
): Promise<boolean> {
  const to = input.to.trim();
  if (!to) {
    log.warn("sendEmail skipped: empty recipient");
    return false;
  }
  const tx = getTransporter(env);
  if (!tx) {
    log.warn({ to }, "sendEmail skipped: SMTP not configured");
    return false;
  }
  try {
    await tx.sendMail({
      from: env.SMTP_FROM!,
      to,
      subject: input.subject,
      html: input.html,
    });
    return true;
  } catch (err) {
    log.error({ err, to }, "sendEmail failed");
    return false;
  }
}
