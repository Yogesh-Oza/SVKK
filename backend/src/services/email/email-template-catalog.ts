import { wrapMediclaimEmailBody } from "./email-layout.js";
import { MEDICLAIM_EMAIL_TEMPLATES } from "./email-template-mediclaim.js";

export type EmailTemplateId =
  | "policy_number_updated"
  | "renewal_60"
  | "renewal_30"
  | "renewal_8"
  | "renewal_2"
  | "mediclaim_renewal_ack"
  | "mediclaim_new_policy_ack"
  | "mediclaim_dishonoured"
  | "mediclaim_premium_reminder"
  | "mediclaim_cheque_honoured";

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

const wrap = (body: string) => wrapMediclaimEmailBody(body);

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateDefinition[] = [
  {
    id: "policy_number_updated",
    label: "Policy number & document",
    description: "Sent when policy number or document link is updated.",
    subjectKey: "email_tpl_policy_number_updated_subject",
    htmlKey: "email_tpl_policy_number_updated_html",
    defaultSubject: "Policy {{policyNo}} — document available",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>This is to inform you that your Mediclaim policy record has been updated.</p>
<div class="policy-block">
<p><strong>Policy No:</strong> {{policyNo}}<br/>
<strong>SVKK ID:</strong> {{svkkPublicId}}</p>
</div>
{{policyDocumentLink}}`,
    ),
    variables: [
      "holderName",
      "policyNo",
      "svkkPublicId",
      "referenceNo",
      "documentUrl",
      "policyUrl",
      "policyDocumentLink",
    ],
  },
  {
    id: "renewal_60",
    label: "Renewal — 2 months before",
    description: "Reminder 60 days before policy end date.",
    subjectKey: "email_tpl_renewal_60_subject",
    htmlKey: "email_tpl_renewal_60_html",
    defaultSubject: "Renewal reminder: policy ends on {{policyEndDate}}",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>Greetings from <strong>SHREE VAGAD KALA KENDRA</strong>.</p>
<p>Your Mediclaim policy <strong>{{policyNo}}</strong> ({{yearLabel}}) is due for renewal on <strong>{{policyEndDate}}</strong>. We recommend planning renewal in advance to ensure uninterrupted coverage.</p>
{{policyDocumentLink}}`,
    ),
    variables: [
      "holderName",
      "policyNo",
      "yearLabel",
      "policyEndDate",
      "policyUrl",
      "policyDocumentLink",
      "village",
    ],
  },
  {
    id: "renewal_30",
    label: "Renewal — 1 month before",
    description: "Reminder 30 days before policy end date.",
    subjectKey: "email_tpl_renewal_30_subject",
    htmlKey: "email_tpl_renewal_30_html",
    defaultSubject: "Renewal reminder: 1 month until {{policyEndDate}}",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>Greetings from <strong>SHREE VAGAD KALA KENDRA</strong>.</p>
<p>Your Mediclaim policy <strong>{{policyNo}}</strong> ends on <strong>{{policyEndDate}}</strong>. Please plan renewal with us at the earliest convenience.</p>
{{policyDocumentLink}}`,
    ),
    variables: [
      "holderName",
      "policyNo",
      "yearLabel",
      "policyEndDate",
      "policyUrl",
      "policyDocumentLink",
      "village",
    ],
  },
  {
    id: "renewal_8",
    label: "Renewal — 8 days before",
    description: "Reminder 8 days before policy end date.",
    subjectKey: "email_tpl_renewal_8_subject",
    htmlKey: "email_tpl_renewal_8_html",
    defaultSubject: "Urgent: policy renewal in 8 days ({{policyEndDate}})",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p><strong>Urgent renewal reminder:</strong> Your Mediclaim policy <strong>{{policyNo}}</strong> expires on <strong>{{policyEndDate}}</strong> (8 days remaining).</p>
{{policyDocumentLink}}`,
    ),
    variables: [
      "holderName",
      "policyNo",
      "yearLabel",
      "policyEndDate",
      "policyUrl",
      "policyDocumentLink",
      "village",
    ],
  },
  {
    id: "renewal_2",
    label: "Renewal — 2 days before",
    description: "Reminder 2 days before policy end date.",
    subjectKey: "email_tpl_renewal_2_subject",
    htmlKey: "email_tpl_renewal_2_html",
    defaultSubject: "Final reminder: policy ends {{policyEndDate}}",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p><strong>Final reminder:</strong> Your Mediclaim policy <strong>{{policyNo}}</strong> ends on <strong>{{policyEndDate}}</strong> (2 days remaining). Please contact us immediately if renewal is pending.</p>
{{policyDocumentLink}}`,
    ),
    variables: [
      "holderName",
      "policyNo",
      "yearLabel",
      "policyEndDate",
      "policyUrl",
      "policyDocumentLink",
      "village",
    ],
  },
  ...MEDICLAIM_EMAIL_TEMPLATES,
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
