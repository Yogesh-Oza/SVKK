import { writeActivityLog } from "../activity-log.service.js";

export type EmailActivityContext = {
  userId?: string | null;
  templateId?: string;
  source?: string;
  entityType: string;
  entityId: string;
  holderName?: string;
  policyNo?: string;
  referenceNo?: string;
  svkkPublicId?: string;
};

export type EmailActivityAction = "EMAIL_SENT" | "EMAIL_FAILED" | "EMAIL_SKIPPED";

export async function writeEmailActivityLog(input: {
  context: EmailActivityContext;
  to: string;
  subject: string;
  action: EmailActivityAction;
  reason?: string;
  errorMessage?: string;
}): Promise<void> {
  const { context: ctx, to, subject, action, reason, errorMessage } = input;
  try {
    await writeActivityLog({
      userId: ctx.userId,
      module: "email",
      action,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      afterData: {
        to: to.trim() || null,
        subject,
        templateId: ctx.templateId ?? null,
        source: ctx.source ?? null,
        holderName: ctx.holderName ?? null,
        policyNo: ctx.policyNo ?? null,
        referenceNo: ctx.referenceNo ?? null,
        svkkPublicId: ctx.svkkPublicId ?? null,
        reason: reason ?? null,
        errorMessage: errorMessage ?? null,
      },
    });
  } catch {
    // Never fail the caller when audit logging fails.
  }
}
