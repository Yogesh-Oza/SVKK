/**
 * Legacy-style “computer generated receipt” for browser print (no server PDF).
 * Accepts the JSON shape returned by `GET /policies/:id` (or a compatible subset).
 */

export type PolicyDetailForReceipt = {
  policyNo: string | null;
  referenceNo: string | null;
  adProductVariant?: string | null;
  area: string | null;
  village: string | null;
  personsInsuredCount: number | null;
  remarks: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
  insuredParty: {
    name: string;
    svkkPublicId: string;
    customerId: string | null;
    pan: string | null;
  };
  policyType: { name: string };
  category: { key: string; name: string } | null;
  years: Array<{
    yearLabel?: string | null;
    sumInsured: string | number | { toString(): string } | null;
    vkkPremium: string | number | { toString(): string } | null;
    bankName: string | null;
    payments?: Array<{
      cheque: {
        number: string;
        bankName: string;
        chequeDate?: string | null;
        status?: string | null;
        reason?: string | null;
      } | null;
      transactionMode?: string | null;
      transactionDetail?: string | null;
      transactionDate?: string | null;
    }>;
  }>;
};

function dStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

function policyTypeLabel(p: PolicyDetailForReceipt): string {
  if (p.adProductVariant) {
    return p.adProductVariant.replace(/_/g, " ");
  }
  return p.policyType?.name ?? "—";
}

function chequeInfo(y: PolicyDetailForReceipt["years"][0]): { no: string; bank: string } {
  for (const pay of y.payments ?? []) {
    if (pay.cheque) {
      return { no: pay.cheque.number, bank: pay.cheque.bankName };
    }
  }
  return { no: "—", bank: dStr(y.bankName) || "—" };
}

const RECEIPT_HEADER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA1AAAACbCAIAAADjvu2MAAAQAElEQVR4AeydB3hURReG7256ryQhnRZ66L13AQEp0lSKNH9EmkhREKWDgAiISm8ioCC99yIEAoSeBBLSe0jv7f+SCTc327IJKbvJ4TkOc2fOnJl570q+nNm9K86hP0SACBABIkAEiAARIAKVmoCYoz9EgAgQASJABDhCQASIQGUmQIKvMt9d2hsRIAJEgAgQASJABECABB8gkClHgLyIABEgAkSACBAB9SRAgk897xutmggQASJABIhARRGgedWQAAk+NbxptGQiQASIABEgAkSACBSHAAm+4tAiXyJABJQjQF5EgAgQASKgUgRI8KnU7aDFEAEiQASIABEgAkSg9AlUlOAr/Z1QRCJABIgAESACRIAIEAGZBEjwycRCjUSACBABIlA+BGgWIkAEyoMACb7yoExzEAEiQASIABEgAkSgAgmQ4KtA+DS1cgTIiwgQASJABIgAEXg/AiT43o8fjSYCRIAIEAEiQATKhwDN8h4ESPC9BzwaSgSIABEgAkSACBABdSAgDgyPIyMCRIAIVA4CtAsiQASIABGQSUDsYG1CRgSIABEgAkSACBABIlCJCVS1I111yLrSGokAESACRIAIEAEiUKoESPCVKk4KRgSIABEgAupBgFZJBKoWARJ8Vet+026JABEgAkSACBCBKkiABF8VvOm0ZeUIkBcRIAJEgAgQgcpCgARfZbmTtA8iQASIABEgAkSgLAhUipgk+CrFbaRNEAEiQASIABEgAkRAPgESfPLZUA8RIAJEQDkC5EUEiAARUHECJPhU/AbR8ogAESACRIAIEAEi8L4ESPC9L0HlxpMXESACRIAIEAEiQAQqjAAJvgpDTxMTASJABIhA1SNAOyYCFUOABF/FcKdZiQARIAJEgAgQASJQbgRI8JUbapqICChHgLyIABEgAkSACJQ2ARJ8pU2U4hEBIkAEiAARIAJE4P0JlGoEEnylipOCEQEiQASIABEgAkRA9QiQ4FO9e0IrIgJEgAgoR4C8iAARIAJKEiDBpyQociMCRIAIEAEiQASIgLoSIMGnrndOuXWTFxEgAkSACBABIkAEOBJ89CIgAkSACBABIlDpCdAGqzoBEnxV/RVA+ycCRIAIEAEiQAQqPQESfJX+FtMGiYByBMiLCBABIkAEKi8B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";

function amountToWordsIndian(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Zero Rupees Only";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const toTwo = (n: number) => {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${tens[t]}${o ? ` ${ones[o]}` : ""}`;
  };
  const toThree = (n: number) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (!h) return toTwo(r);
    return `${ones[h]} Hundred${r ? ` ${toTwo(r)}` : ""}`;
  };
  const n = Math.floor(value);
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${toTwo(crore)} Crore`);
  if (lakh) parts.push(`${toTwo(lakh)} Lakh`);
  if (thousand) parts.push(`${toTwo(thousand)} Thousand`);
  if (hundred) parts.push(toThree(hundred));
  return `${parts.join(" ").trim()} Rupees Only`;
}

export function buildReceiptDocumentHtml(
  p: PolicyDetailForReceipt,
  options?: { issuedDate?: Date },
): string {
  const y0 = p.years[0];
  const dateStr = (options?.issuedDate ?? new Date()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const ref = p.referenceNo ?? "—";
  const sumInsured = y0 ? dStr(y0.sumInsured) : "—";
  const premium = y0 ? dStr(y0.vkkPremium) : "—";
  const { no: chNo, bank: chBank } = y0 ? chequeInfo(y0) : { no: "—", bank: "—" };
  const pay0 = y0?.payments?.find((pp) => pp.cheque || pp.transactionMode || pp.transactionDetail) ?? null;
  const yearLabel = y0?.yearLabel ?? p.periodYearText ?? "—";
  const paymentMode = pay0?.transactionMode ?? (pay0?.cheque ? "CHQ" : "—");
  const transactionDetail = pay0?.transactionDetail ?? chNo;
  const transactionDate = pay0?.transactionDate ?? pay0?.cheque?.chequeDate ?? "—";
  const paymentStatus = pay0?.cheque?.status ?? "Cleared";
  const cat = p.category?.key ?? p.category?.name ?? "—";
  const premiumNum = Number(String(premium).replace(/[^\d.-]/g, "")) || 0;
  const amountInWords = amountToWordsIndian(premiumNum);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${ref}</title>
  <style>
    :root { --line:#cbd5e1; --muted:#475569; --text:#0f172a; --bg:#ffffff; --page:#f3f4f6; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--page); color: var(--text); margin: 0; padding: 0; }
    .modal { max-width: 1180px; margin: 0 auto; background: var(--bg); border-radius: 14px; overflow: hidden; border: 1px solid #d1d5db; }
    .modal-h { border-bottom: 1px solid #d1d5db; display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; }
    .modal-title { font-size: 28px; font-weight: 900; letter-spacing: .06em; }
    .btns { display: flex; gap: 8px; }
    .btn { border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; border-radius: 12px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    .btn.primary { background: #0f172a; color: #fff; border-color: #0f172a; }
    .modal-b { padding: 14px 22px 20px; }
    .receipt-badge { display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:8px 20px;font-size:40px;font-weight:900;letter-spacing:.18em; }
    .table-wrap { margin-top: 14px; border:1px solid #cbd5e1; border-radius:16px; overflow:hidden; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:22px; }
    td { border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; padding:10px 14px; vertical-align:top; }
    tr:first-child td { border-top:0; }
    td:nth-child(2), td:nth-child(4) { border-right:0; }
    .k { font-weight:800; color:#334155; width:23%; }
    .v { color:#0f172a; width:27%; word-break:break-word; }
    .member-card { border:1px solid #cbd5e1; border-radius:16px; background:#f8fafc; padding:12px 16px; }
    .sign-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:24px; font-size:24px; }
    .sign-line { border-top:2px solid #cbd5e1; padding-top:10px; font-weight:800; color:#475569; }
    @media print {
      body { background:#fff; }
      .no-print { display:none !important; }
      .modal { border:0; border-radius:0; max-width:none; }
    }
  </style>
</head>
<body>
  <div class="modal">
    <div class="modal-h no-print">
      <div class="modal-title">Receipt Preview</div>
      <div class="btns">
        <button class="btn primary" onclick="window.print()">Print</button>
      </div>
    </div>
    <div class="modal-b">
      <div style="border-bottom:2px solid #e5e7eb;padding-bottom:14px"><img src="${RECEIPT_HEADER_IMAGE}" alt="Receipt Header" style="width:100%;height:auto;display:block" onerror="this.style.display='none'"></div>
      <div style="text-align:center;margin-top:18px"><div class="receipt-badge">RECEIPT</div></div>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr><td class="k">Receipt No.</td><td class="v">${ref}</td><td class="k">Village</td><td class="v">${p.village ?? "—"}</td></tr>
            <tr><td class="k">Date</td><td class="v">${dateStr}</td><td class="k">Area</td><td class="v">${p.area ?? "—"}</td></tr>
            <tr><td class="k">SVKK ID</td><td class="v">${p.insuredParty.svkkPublicId}</td><td class="k">Year</td><td class="v">${yearLabel}</td></tr>
            <tr><td class="k">Customer ID</td><td class="v">${p.insuredParty.customerId ?? "—"}</td><td class="k">Premium Amount</td><td class="v">₹ ${premium}</td></tr>
            <tr><td class="k">Reference No.</td><td class="v">${ref}</td><td class="k">Amount Received</td><td class="v">₹ ${premium}</td></tr>
            <tr><td class="k">Policy No.</td><td class="v">${p.policyNo ?? "—"}</td><td class="k">Date of Payment / CHQ Date</td><td class="v">${transactionDate}</td></tr>
            <tr><td class="k">Policy Holder Name</td><td class="v">${p.insuredParty.name}</td><td class="k">Mode of Payment</td><td class="v">${paymentMode}</td></tr>
            <tr><td class="k">Policy Type</td><td class="v">${policyTypeLabel(p)}</td><td class="k">Transaction Detail</td><td class="v">${transactionDetail || "—"}</td></tr>
            <tr><td class="k">Category</td><td class="v">${cat}</td><td class="k">Transaction Date</td><td class="v">${transactionDate}</td></tr>
            <tr><td class="k">Sum Insured</td><td class="v">₹ ${sumInsured}</td><td class="k">Status</td><td class="v">${paymentStatus}</td></tr>
            <tr><td class="k">No. of Persons</td><td class="v">${p.personsInsuredCount ?? "—"}</td><td class="k">Remark</td><td class="v">${(p.remarks ?? "").trim() || "—"}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="member-card" style="margin-top:14px"><div style="font-weight:800;color:#334155">Amount in Words</div><div style="margin-top:8px;font-weight:700">${amountInWords}</div></div>
      <div class="member-card" style="margin-top:14px">Received with thanks the above amount towards mediclaim premium.</div>
      <div class="sign-grid">
        <div><div class="sign-line">Receiver</div></div>
        <div><div class="sign-line">Authorized Signatory</div></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function openPolicyReceiptPrint(
  p: PolicyDetailForReceipt,
): Promise<boolean> {
  const html = buildReceiptDocumentHtml(p);
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
