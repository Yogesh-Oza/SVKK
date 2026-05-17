export type EmailTemplateId =
  | "policy_created"
  | "policy_number_updated"
  | "renewal_60"
  | "renewal_30"
  | "renewal_8"
  | "renewal_2";

export type EmailTemplateDefinition = {
  id: EmailTemplateId;
  label: string;
  description: string;
  subjectKey: string;
  htmlKey: string;
  defaultSubject: string;
  defaultHtml: string;
  variables: string[];
};

const wrap = (body: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
body{font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0b1728;margin:0;padding:24px;background:#f4f7fb}
.card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e3ee;border-radius:12px;padding:24px}
h1{font-size:18px;margin:0 0 12px}
.muted{color:#66798f;font-size:13px}
.btn{display:inline-block;margin-top:16px;padding:10px 18px;background:#174ea6;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px}
</style></head><body><div class="card">${body}<p class="muted">SVKK MediClaim</p></div></body></html>`;

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateDefinition[] = [
  {
    id: "policy_created",
    label: "Policy generated",
    description: "Sent when a new policy is created in the system.",
    subjectKey: "email_tpl_policy_created_subject",
    htmlKey: "email_tpl_policy_created_html",
    defaultSubject: "Your SVKK policy {{referenceNo}} has been registered",
    defaultHtml: wrap(
      `<h1>Policy registered</h1>
<p>Dear {{holderName}},</p>
<p>Your policy has been generated successfully.</p>
<p><strong>SVKK ID:</strong> {{svkkPublicId}}<br/>
<strong>Reference:</strong> {{referenceNo}}<br/>
<strong>Village:</strong> {{village}}</p>
<a class="btn" href="{{policyUrl}}">View policy</a>`,
    ),
    variables: ["holderName", "svkkPublicId", "referenceNo", "policyNo", "village", "policyUrl"],
  },
  {
    id: "policy_number_updated",
    label: "Policy number & document",
    description: "Sent when policy number or document link is updated.",
    subjectKey: "email_tpl_policy_number_updated_subject",
    htmlKey: "email_tpl_policy_number_updated_html",
    defaultSubject: "Policy {{policyNo}} — document available",
    defaultHtml: wrap(
      `<h1>Policy details updated</h1>
<p>Dear {{holderName}},</p>
<p>Your policy record has been updated.</p>
<p><strong>Policy No:</strong> {{policyNo}}<br/>
<strong>SVKK ID:</strong> {{svkkPublicId}}</p>
<a class="btn" href="{{documentUrl}}">Open policy document</a>`,
    ),
    variables: ["holderName", "policyNo", "svkkPublicId", "referenceNo", "documentUrl", "policyUrl"],
  },
  {
    id: "renewal_60",
    label: "Renewal — 2 months before",
    description: "Reminder 60 days before policy end date.",
    subjectKey: "email_tpl_renewal_60_subject",
    htmlKey: "email_tpl_renewal_60_html",
    defaultSubject: "Renewal reminder: policy ends on {{policyEndDate}}",
    defaultHtml: wrap(
      `<h1>Renewal in about 2 months</h1>
<p>Dear {{holderName}},</p>
<p>Your policy <strong>{{policyNo}}</strong> ({{yearLabel}}) is due for renewal on <strong>{{policyEndDate}}</strong>.</p>
<a class="btn" href="{{policyUrl}}">View policy</a>`,
    ),
    variables: ["holderName", "policyNo", "yearLabel", "policyEndDate", "policyUrl", "village"],
  },
  {
    id: "renewal_30",
    label: "Renewal — 1 month before",
    description: "Reminder 30 days before policy end date.",
    subjectKey: "email_tpl_renewal_30_subject",
    htmlKey: "email_tpl_renewal_30_html",
    defaultSubject: "Renewal reminder: 1 month until {{policyEndDate}}",
    defaultHtml: wrap(
      `<h1>Renewal in about 1 month</h1>
<p>Dear {{holderName}},</p>
<p>Your policy <strong>{{policyNo}}</strong> ends on <strong>{{policyEndDate}}</strong>. Please plan renewal with SVKK.</p>
<a class="btn" href="{{policyUrl}}">View policy</a>`,
    ),
    variables: ["holderName", "policyNo", "yearLabel", "policyEndDate", "policyUrl", "village"],
  },
  {
    id: "renewal_8",
    label: "Renewal — 8 days before",
    description: "Reminder 8 days before policy end date.",
    subjectKey: "email_tpl_renewal_8_subject",
    htmlKey: "email_tpl_renewal_8_html",
    defaultSubject: "Urgent: policy renewal in 8 days ({{policyEndDate}})",
    defaultHtml: wrap(
      `<h1>Renewal in 8 days</h1>
<p>Dear {{holderName}},</p>
<p>Your policy <strong>{{policyNo}}</strong> expires on <strong>{{policyEndDate}}</strong>.</p>
<a class="btn" href="{{policyUrl}}">View policy</a>`,
    ),
    variables: ["holderName", "policyNo", "yearLabel", "policyEndDate", "policyUrl", "village"],
  },
  {
    id: "renewal_2",
    label: "Renewal — 2 days before",
    description: "Reminder 2 days before policy end date.",
    subjectKey: "email_tpl_renewal_2_subject",
    htmlKey: "email_tpl_renewal_2_html",
    defaultSubject: "Final reminder: policy ends {{policyEndDate}}",
    defaultHtml: wrap(
      `<h1>Renewal in 2 days</h1>
<p>Dear {{holderName}},</p>
<p>This is a final reminder that policy <strong>{{policyNo}}</strong> ends on <strong>{{policyEndDate}}</strong>.</p>
<a class="btn" href="{{policyUrl}}">View policy</a>`,
    ),
    variables: ["holderName", "policyNo", "yearLabel", "policyEndDate", "policyUrl", "village"],
  },
];

export const RENEWAL_OFFSET_DAYS = [60, 30, 8, 2] as const;

export function renewalTemplateIdForOffset(days: number): EmailTemplateId | null {
  if (days === 60) return "renewal_60";
  if (days === 30) return "renewal_30";
  if (days === 8) return "renewal_8";
  if (days === 2) return "renewal_2";
  return null;
}

export function getTemplateDefinition(id: EmailTemplateId): EmailTemplateDefinition {
  const t = EMAIL_TEMPLATE_CATALOG.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown template ${id}`);
  return t;
}
