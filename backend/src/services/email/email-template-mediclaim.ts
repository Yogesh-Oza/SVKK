import { wrapMediclaimEmailBody } from "./email-layout.js";
import type { EmailTemplateDefinition } from "./email-template-catalog.js";

const wrap = (body: string) => wrapMediclaimEmailBody(body);

const MEDICLAIM_SIG_VARS = [
  "holderName",
  "receiptFields",
  "policyNo",
  "policyStartDate",
  "policyEndDate",
  "dueDate",
  "policyUrl",
  "policyDocumentLink",
  "chequeStatus",
  "dishonourReason",
];

export const MEDICLAIM_EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
  {
    id: "mediclaim_renewal_ack",
    label: "Mediclaim — policy renewal / carry forward acknowledgement",
    description:
      "Acknowledgement when renewal or carry-forward premium is received (cheque subject to realisation).",
    subjectKey: "email_tpl_mediclaim_renewal_ack_subject",
    htmlKey: "email_tpl_mediclaim_renewal_ack_html",
    defaultSubject: "Acknowledgement of Mediclaim Policy Renewal - Subject To Realisation",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>This is to inform you that we have received the premium for your Mediclaim Policy.</p>
<p class="note-str">Please note that the receipt of the payment by Cheque is Subject To Realisation.</p>
{{receiptFields}}`,
    ),
    variables: MEDICLAIM_SIG_VARS,
  },
  {
    id: "mediclaim_new_policy_ack",
    label: "Mediclaim — new policy acknowledgement",
    description: "Acknowledgement when premium is received for a new mediclaim policy.",
    subjectKey: "email_tpl_mediclaim_new_policy_ack_subject",
    htmlKey: "email_tpl_mediclaim_new_policy_ack_html",
    defaultSubject: "Acknowledgement of Mediclaim Policy - Subject To Realisation",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>This is to inform you that we have received the premium for your Mediclaim Policy.</p>
<p class="note-str">Please note that the receipt of the payment by Cheque is Subject To Realisation.</p>
{{receiptFields}}`,
    ),
    variables: MEDICLAIM_SIG_VARS,
  },
  {
    id: "mediclaim_dishonoured",
    label: "Mediclaim — premium payment dishonoured",
    description: "Notifies the policyholder that a cheque payment was dishonoured.",
    subjectKey: "email_tpl_mediclaim_dishonoured_subject",
    htmlKey: "email_tpl_mediclaim_dishonoured_html",
    defaultSubject: "Mediclaim Policy Premium Payment Dishonoured",
    defaultHtml: wrap(
      `<p>Dear Sir / Madam,</p>
<p>This is to inform you that your Mediclaim insurance policy details have been updated in our records.</p>
<div class="alert-box alert-warning">
<strong>Cheque Status:</strong> Your policy premium payment has been <strong>DISHONOURED</strong>.
</div>
<p>You are requested to kindly take note of the above information for your records.</p>
<p>Since your policy premium payment has been dishonoured, please contact us immediately for the same.</p>
<p>We appreciate your cooperation and thank you for your continued association with us.</p>
<p><em>Policy: {{policyNo}}</em></p>`,
    ),
    variables: ["policyNo", "holderName", "chequeStatus", "dishonourReason"],
  },
  {
    id: "mediclaim_premium_reminder",
    label: "Mediclaim — premium reminder (~60 days)",
    description: "Gentle reminder that premium is due in approximately 60 days.",
    subjectKey: "email_tpl_mediclaim_premium_reminder_subject",
    htmlKey: "email_tpl_mediclaim_premium_reminder_html",
    defaultSubject: "Reminder: Upcoming Premium Due for Your Insurance Policy",
    defaultHtml: wrap(
      `<p>Dear Valued Policyholder <strong>{{holderName}}</strong>,</p>
<p>Greetings from <strong>SHREE VAGAD KALA KENDRA</strong>.</p>
<p>This is a gentle reminder that the premium payment for your insurance policy is due in approximately <strong>60 days</strong>. We recommend planning the payment in advance to ensure uninterrupted coverage and to avoid any last-minute inconvenience.</p>
<div class="policy-block">
<p class="label">Policy details</p>
<p><strong>Policy Number:</strong> {{policyNo}}</p>
<p><strong>Premium Due Date:</strong> {{dueDate}}</p>
</div>
<p>Please feel free to reach out to us if you require any clarification regarding the premium, payment modes, or policy benefits. We will be happy to assist you.</p>
<p>Thank you for your continued trust and association.</p>`,
    ),
    variables: ["holderName", "policyNo", "dueDate", "policyEndDate", "policyDocumentLink"],
  },
  {
    id: "mediclaim_cheque_honoured",
    label: "Mediclaim — cheque honoured / cleared",
    description: "Confirms cheque clearance and shares updated policy details.",
    subjectKey: "email_tpl_mediclaim_cheque_honoured_subject",
    htmlKey: "email_tpl_mediclaim_cheque_honoured_html",
    defaultSubject: "Mediclaim Insurance Policy Update - Cheque Honoured",
    defaultHtml: wrap(
      `<p>Dear Sir / Madam,</p>
<p>This is to inform you that your Mediclaim insurance policy details have been updated in our records.</p>
<div class="alert-box alert-success">
<strong>Cheque Status:</strong> Your policy premium payment has been <strong>HONOURED / CLEARED</strong>.
</div>
<p><strong>YOUR NEW POLICY DETAILS ARE AS FOLLOWS:</strong></p>
<div class="policy-block">
<p><span class="label">Policy No.</span><br/>{{policyNo}}</p>
<p><span class="label">Policy Start Date</span><br/>{{policyStartDate}}</p>
<p><span class="label">Policy End Date</span><br/>{{policyEndDate}}</p>
<p><span class="label">Policy URL</span><br/>{{policyDocumentLink}}</p>
</div>
<p>Kindly update the above information for your reference. In case you require further clarification, please contact us at the earliest.</p>
<p>We appreciate your cooperation and thank you for your continued association with us.</p>`,
    ),
    variables: [
      "holderName",
      "policyNo",
      "policyStartDate",
      "policyEndDate",
      "policyUrl",
      "policyDocumentLink",
    ],
  },
];
