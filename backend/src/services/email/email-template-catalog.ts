import { wrapEmailBody } from "./email-layout.js";

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

const wrap = (body: string) => wrapEmailBody(body);

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
{{policyDocumentLink}}`,
    ),
    variables: [
      "holderName",
      "svkkPublicId",
      "referenceNo",
      "policyNo",
      "village",
      "policyUrl",
      "policyDocumentLink",
    ],
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
      `<h1>Renewal in about 2 months</h1>
<p>Dear {{holderName}},</p>
<p>Your policy <strong>{{policyNo}}</strong> ({{yearLabel}}) is due for renewal on <strong>{{policyEndDate}}</strong>.</p>
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
      `<h1>Renewal in about 1 month</h1>
<p>Dear {{holderName}},</p>
<p>Your policy <strong>{{policyNo}}</strong> ends on <strong>{{policyEndDate}}</strong>. Please plan renewal with SVKK.</p>
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
      `<h1>Renewal in 8 days</h1>
<p>Dear {{holderName}},</p>
<p>Your policy <strong>{{policyNo}}</strong> expires on <strong>{{policyEndDate}}</strong>.</p>
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
      `<h1>Renewal in 2 days</h1>
<p>Dear {{holderName}},</p>
<p>This is a final reminder that policy <strong>{{policyNo}}</strong> ends on <strong>{{policyEndDate}}</strong>.</p>
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
