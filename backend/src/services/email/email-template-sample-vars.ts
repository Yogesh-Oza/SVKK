import { policyDocumentLinkHtml } from "../notification/policy-url.js";

const SAMPLE_DOCUMENT_URL = "https://1drv.ms/example-policy-document";

const SAMPLE_RECEIPT_FIELDS_HTML = `<div class="receipt-box"><table>
<tr><td>Receipt No.</td><td>RCP-2025-004821</td></tr>
<tr><td>Date</td><td>18/05/2026</td></tr>
<tr><td>SVKK ID</td><td>RTYMAY0033</td></tr>
<tr><td>Customer ID</td><td>ME13336904</td></tr>
<tr><td>Policy Holder Name</td><td>Rajesh Kumar</td></tr>
<tr><td>Policy No.</td><td>PO-889912</td></tr>
<tr><td>Amount Received</td><td>38,188</td></tr>
<tr><td>Mode of Payment</td><td>CASH</td></tr>
</table></div>`;

/** Sample values for admin preview and send-test emails (not real policy data). */
export const EMAIL_TEMPLATE_SAMPLE_VARS: Record<string, string> = {
  holderName: "Rajesh Kumar",
  svkkPublicId: "SVKK-2024-00142",
  referenceNo: "REF-78421",
  policyNo: "POL-889912",
  village: "Wakad",
  yearLabel: "2025-26",
  policyEndDate: "31/03/2026",
  policyStartDate: "01/04/2025",
  dueDate: "31/03/2026",
  policyUrl: SAMPLE_DOCUMENT_URL,
  documentUrl: SAMPLE_DOCUMENT_URL,
  policyDocumentLink: policyDocumentLinkHtml(SAMPLE_DOCUMENT_URL),
  receiptFields: SAMPLE_RECEIPT_FIELDS_HTML,
  chequeStatus: "DISHONOURED",
  dishonourReason: "Insufficient funds",
};
