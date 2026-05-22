/** HTML table for receipt details injected into mediclaim acknowledgement emails. */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
  return `<tr><td>${esc(label)}</td><td>${esc(value || "—")}</td></tr>`;
}

export type ReceiptFieldInput = {
  receiptNo?: string;
  receiptDate?: string;
  svkkId?: string;
  customerId?: string;
  policyHolderName?: string;
  policyNo?: string;
  previousPolicyNo?: string;
  area?: string;
  phoneNo?: string;
  emailId?: string;
  village?: string;
  personCount?: string;
  category?: string;
  policyType?: string;
  sumInsured?: string;
  premiumAmount?: string;
  notOver?: string;
  bankCharges?: string;
  nameAsPerCheque?: string;
  otherCharges?: string;
  amountReceived?: string;
  paymentMode?: string;
  bankName?: string;
  transactionNo?: string;
  transactionDate?: string;
  panNo?: string;
  aadhaarNo?: string;
  remark?: string;
  generalRemark?: string;
};

export function buildReceiptFieldsHtml(fields: ReceiptFieldInput): string {
  const rows = [
    row("Receipt No.", fields.receiptNo ?? ""),
    row("Date", fields.receiptDate ?? ""),
    row("SVKK ID", fields.svkkId ?? ""),
    row("Customer ID", fields.customerId ?? ""),
    row("Policy No.", fields.policyNo ?? ""),
    row("Previous Policy No.", fields.previousPolicyNo ?? ""),
    row("Policy Holder Name", fields.policyHolderName ?? ""),
    row("Area", fields.area ?? ""),
    row("Phone No.", fields.phoneNo ?? ""),
    row("Email ID", fields.emailId ?? ""),
    row("Village", fields.village ?? ""),
    row("No. of Person", fields.personCount ?? ""),
    row("Category", fields.category ?? ""),
    row("Policy Type", fields.policyType ?? ""),
    row("Sum Insured", fields.sumInsured ?? ""),
    row("Premium Amount", fields.premiumAmount ?? ""),
    row("Not Over", fields.notOver ?? ""),
    row("Bank Charges", fields.bankCharges ?? ""),
    row("Name as per Cheque", fields.nameAsPerCheque ?? ""),
    row("Other Charges", fields.otherCharges ?? ""),
    row("Amount Received", fields.amountReceived ?? ""),
    row("Mode of Payment", fields.paymentMode ?? ""),
    row("Bank Name", fields.bankName ?? ""),
    row("Transaction No.", fields.transactionNo ?? ""),
    row("Transaction Date", fields.transactionDate ?? ""),
    row("PAN No.", fields.panNo ?? ""),
    row("Aadhaar No.", fields.aadhaarNo ?? ""),
    row("Remark", fields.remark ?? ""),
    row("General Remark", fields.generalRemark ?? ""),
  ];
  return `<div class="receipt-box"><table>${rows.join("")}</table></div>`;
}

export const SAMPLE_RECEIPT_FIELDS_HTML = buildReceiptFieldsHtml({
  receiptNo: "RCP-2025-004821",
  receiptDate: "18/05/2026",
  svkkId: "RTYMAY0033",
  customerId: "ME13336904",
  policyHolderName: "Rushabh Ramesh Gala",
  policyNo: "PO-14010061252800000558",
  area: "Borivali-West",
  phoneNo: "+91 98205 32458",
  emailId: "holder@example.com",
  village: "Adhoi",
  personCount: "4",
  category: "D",
  policyType: "Family Floater",
  sumInsured: "5,00,000",
  premiumAmount: "38,188",
  notOver: "—",
  bankCharges: "0",
  nameAsPerCheque: "—",
  otherCharges: "0",
  amountReceived: "38,188",
  paymentMode: "CASH",
  bankName: "—",
  transactionNo: "—",
  transactionDate: "18/05/2026",
  panNo: "CQLPG5551K",
  aadhaarNo: "—",
  remark: "—",
  generalRemark: "—",
});
