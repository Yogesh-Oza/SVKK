/** Mirrors backend email-layout.ts for live preview in admin. */

export const EMAIL_LAYOUT_FOOTER = `<p class="muted">SVKK MediClaim</p>`;

export function wrapEmailBody(body: string): string {
  const inner = body.trim();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
body{font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0b1728;margin:0;padding:24px;background:#f4f7fb}
.card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e3ee;border-radius:12px;padding:24px}
h1{font-size:18px;margin:0 0 12px}
.muted{color:#66798f;font-size:13px}
.btn{display:inline-block;margin-top:16px;padding:10px 18px;background:#174ea6;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px}
</style></head><body><div class="card">${inner}${EMAIL_LAYOUT_FOOTER}</div></body></html>`;
}

export function renderPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/** Sample values for admin preview (not sent to holders). */
export const EMAIL_TEMPLATE_SAMPLE_VARS: Record<string, string> = {
  holderName: "Rajesh Kumar",
  svkkPublicId: "SVKK-2024-00142",
  referenceNo: "REF-78421",
  policyNo: "POL-889912",
  village: "Wakad",
  yearLabel: "2025-26",
  policyEndDate: "31/03/2026",
  policyUrl: "https://1drv.ms/example-policy-document",
  documentUrl: "https://1drv.ms/example-policy-document",
  policyDocumentLink:
    '<a class="btn" href="https://1drv.ms/example-policy-document">Open policy document</a>',
};

export function buildPreviewHtml(body: string, subject: string): { subject: string; html: string } {
  const vars = EMAIL_TEMPLATE_SAMPLE_VARS;
  return {
    subject: renderPlaceholders(subject, vars),
    html: renderPlaceholders(wrapEmailBody(body), vars),
  };
}
