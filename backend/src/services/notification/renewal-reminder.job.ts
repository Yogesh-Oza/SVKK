import { NotificationType } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import type { AppLogger } from "../../utils/logger.js";
import { sendEmail, isEmailConfigured } from "../email/email.service.js";
import { renderEmailTemplate } from "../email/email-template.service.js";
import {
  RENEWAL_OFFSET_DAYS,
  renewalTemplateIdForOffset,
} from "../email/email-template-catalog.js";
import { buildPolicyPageUrl, formatDateDmy } from "./policy-url.js";

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export async function runRenewalReminderJob(env: Env, log: AppLogger): Promise<void> {
  const today = utcDayStart(new Date());

  for (const offsetDays of RENEWAL_OFFSET_DAYS) {
    const targetEnd = addUtcDays(today, offsetDays);
    const targetStart = new Date(targetEnd);
    const targetEndDay = new Date(
      Date.UTC(
        targetEnd.getUTCFullYear(),
        targetEnd.getUTCMonth(),
        targetEnd.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const templateId = renewalTemplateIdForOffset(offsetDays);
    if (!templateId) continue;

    const years = await prisma.policyYear.findMany({
      where: {
        deletedAt: null,
        policyEnd: { gte: targetStart, lte: targetEndDay },
        policy: { deletedAt: null },
        renewalReminderLogs: { none: { offsetDays } },
      },
      include: {
        policy: {
          include: {
            insuredParty: { select: { name: true, email: true, svkkPublicId: true } },
          },
        },
      },
    });

    for (const py of years) {
      const p = py.policy;
      const email = p.insuredParty.email?.trim();
      const policyUrl = buildPolicyPageUrl(env, p.id);
      const vars = {
        holderName: p.insuredParty.name,
        policyNo: p.policyNo ?? "—",
        yearLabel: py.yearLabel,
        policyEndDate: formatDateDmy(py.policyEnd),
        policyUrl,
        village: p.village ?? "—",
      };

      let emailSent = false;
      if (email) {
        const rendered = await renderEmailTemplate(templateId, vars);
        emailSent = await sendEmail(env, log, {
          to: email,
          subject: rendered.subject,
          html: rendered.html,
        });
      }

      await prisma.$transaction([
        prisma.renewalReminderLog.create({
          data: { policyYearId: py.id, offsetDays, emailTo: email ?? null },
        }),
        prisma.notification.create({
          data: {
            policyId: p.id,
            type: NotificationType.RENEWAL_REMINDER,
            title: `Renewal in ${offsetDays} days`,
            body: `${p.insuredParty.name} — ${py.yearLabel} ends ${vars.policyEndDate}`,
            linkUrl: policyUrl,
            emailTo: email ?? null,
            emailSent,
          },
        }),
      ]);
    }

    log.info({ offsetDays, count: years.length }, "renewal reminders processed");
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startRenewalReminderScheduler(env: Env, log: AppLogger): void {
  const run = () => {
    void runRenewalReminderJob(env, log).catch((err) => {
      log.error({ err }, "renewal reminder job failed");
    });
  };

  setTimeout(run, 60_000);
  setInterval(run, DAY_MS);
  log.info("renewal reminder scheduler started (daily)");
}
