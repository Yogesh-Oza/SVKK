/**
 * Legacy-style “computer generated receipt” for browser print (no server PDF).
 * Accepts the JSON shape returned by `GET /policies/:id` (or a compatible subset).
 */

export type PolicyDetailForReceipt = {
  id?: string;
  /** Policy record creation time — used as receipt date when issued at create. */
  createdAt?: string | null;
  policyNo: string | null;
  previousPolicyNo?: string | null;
  referenceNo: string | null;
  adProductVariant?: string | null;
  area: string | null;
  village: string | null;
  personsInsuredCount: number | null;
  remarks: string | null;
  generalRemark?: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
  insuredParty: {
    name: string;
    svkkPublicId: string;
    customerId: string | null;
    pan: string | null;
    aadhaarNo?: string | null;
    mobile?: string | null;
    email?: string | null;
  };
  policyType: { name: string };
  category: { key: string; name: string } | null;
  years: Array<{
    yearLabel?: string | null;
    sumInsured: string | number | { toString(): string } | null;
    vkkPremium: string | number | { toString(): string } | null;
    amountReceived?: string | number | { toString(): string } | null;
    bankName: string | null;
    utrRef?: string | null;
    yearRemarks?: string | null;
    members?: unknown[];
    receipts?: Array<{ receiptNo: string; policyDate?: string | null; createdAt?: string | null }>;
    payments?: Array<{
      method?: string | null;
      amount?: string | number | { toString(): string } | null;
      createdAt?: string | null;
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
      nameAsPerCheque?: string | null;
      notOver?: string | null;
      returnCharges?: string | number | null;
      otherCharges?: string | number | null;
    }>;
  }>;
};

const AD_VARIANT_LABELS: Record<string, string> = {
  FAMILY_FLOATER: "Family Floater",
  INDIVIDUAL: "Individual",
  ASHA_KIRAN: "Asha Kiran",
};

function dStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rs(n: unknown): string {
  const num = Number(String(n).replace(/,/g, "").trim()) || 0;
  return new Intl.NumberFormat("en-IN").format(num);
}

function displayDate(raw: unknown): string {
  if (raw == null || raw === "") return "—";
  const s = String(raw);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }
  return s;
}

function policyTypeLabel(p: PolicyDetailForReceipt): string {
  if (p.adProductVariant && AD_VARIANT_LABELS[p.adProductVariant]) {
    return AD_VARIANT_LABELS[p.adProductVariant];
  }
  if (p.adProductVariant) {
    return p.adProductVariant.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function payMode(pay: NonNullable<PolicyDetailForReceipt["years"][0]["payments"]>[0] | null): string {
  if (!pay) return "—";
  const m = pay.transactionMode ?? pay.method;
  if (!m) return pay.cheque ? "CHQ" : "—";
  return String(m);
}

function pickPayment(y: PolicyDetailForReceipt["years"][0] | undefined) {
  if (!y?.payments?.length) return null;
  return (
    y.payments.find((pp) => pp.cheque || pp.method || pp.transactionMode || pp.transactionDetail) ??
    y.payments[0]
  );
}

function syntheticReceiptNo(policyId: string | undefined, yearLabel: string): string {
  const y = yearLabel.match(/^(\d{4})/)?.[1] ?? String(new Date().getFullYear());
  const base = (policyId ?? "x") + yearLabel;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (h * 31 + base.charCodeAt(i)) >>> 0;
  }
  const n = String(h % 100000).padStart(5, "0");
  return `RCP/${y}/${n}`;
}

function receiptNoFor(p: PolicyDetailForReceipt, y0: PolicyDetailForReceipt["years"][0] | undefined): string {
  const fromDb = y0?.receipts?.[0]?.receiptNo?.trim();
  if (fromDb) return fromDb;
  const yl = y0?.yearLabel ?? p.periodYearText ?? "";
  return syntheticReceiptNo(p.id, yl);
}

/** Frozen at policy creation — not transaction date or print time. */
function receiptIssuedDateRaw(
  p: PolicyDetailForReceipt,
  y0: PolicyDetailForReceipt["years"][0] | undefined,
  override?: Date,
): string | Date | null {
  if (override) return override;
  const rec = y0?.receipts?.[0];
  if (rec?.policyDate) return rec.policyDate;
  if (rec?.createdAt) return rec.createdAt;
  if (p.createdAt) return p.createdAt;
  return null;
}

function personsCount(p: PolicyDetailForReceipt, y0: PolicyDetailForReceipt["years"][0] | undefined): string {
  if (p.personsInsuredCount != null && p.personsInsuredCount >= 0) {
    return String(p.personsInsuredCount);
  }
  const m = y0?.members?.length ?? 0;
  return m > 0 ? String(m + 1) : "—";
}

function parseRemarksForReceipt(raw: string | null | undefined): { remark: string; generalRemark: string } {
  const text = (raw ?? "").trim();
  if (!text) return { remark: "—", generalRemark: "—" };
  const gMarker = "General Remark:";
  const pMarker = "Policy Change Remark:";
  const gIdx = text.indexOf(gMarker);
  const pIdx = text.indexOf(pMarker);
  if (gIdx === -1 && pIdx === -1) return { remark: text, generalRemark: text };
  let generalRemark = "";
  let policyChangeRemark = "";
  if (gIdx !== -1) {
    const gStart = gIdx + gMarker.length;
    const gEnd = pIdx !== -1 && pIdx > gStart ? pIdx : text.length;
    generalRemark = text.slice(gStart, gEnd).trim();
  }
  if (pIdx !== -1) {
    policyChangeRemark = text.slice(pIdx + pMarker.length).trim();
  }
  return { remark: policyChangeRemark || generalRemark || "—", generalRemark: generalRemark || "—" };
}

const DEFAULT_HEADER_IMAGE = "/Header_Receipt.png";
const DEFAULT_FOOTER_IMAGE = "/Footer_Receipt.png";

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
  options?: { issuedDate?: Date; embedded?: boolean; headerImageUrl?: string; footerImageUrl?: string },
): string {
  const y0 = p.years[0];
  const issuedRaw = receiptIssuedDateRaw(p, y0, options?.issuedDate);
  const dateStr = issuedRaw ? displayDate(issuedRaw) : "—";
  const receiptNo = receiptNoFor(p, y0);
  const sumInsured = y0 ? rs(y0.sumInsured) : "0";
  const vkk = y0 ? rs(y0.vkkPremium) : "0";
  const recvRaw = y0?.amountReceived != null && String(y0.amountReceived).trim() !== "" ? y0.amountReceived : y0?.vkkPremium;
  const recv = y0 ? rs(recvRaw) : "0";
  const { no: chNo } = y0 ? chequeInfo(y0) : { no: "—" };
  const pay0 = pickPayment(y0);
  const paymentMode = payMode(pay0);
  const transactionDetail =
    (pay0?.transactionDetail ?? "").trim() || chNo || (y0?.utrRef ?? "").trim() || "—";
  const txnDateStr = displayDate(pay0?.transactionDate ?? pay0?.createdAt);
  const cat = p.category?.key ?? p.category?.name ?? "—";
  const amountNum = Number(String(recvRaw).replace(/[^\d.-]/g, "")) || 0;
  const amountInWords = amountToWordsIndian(amountNum);

  const nameAsPerCheque = (pay0?.nameAsPerCheque ?? "").trim() || "—";
  const notOver = (pay0?.notOver ?? "").trim() || "—";
  const bankCharges = pay0?.returnCharges != null && String(pay0.returnCharges).trim() !== "" ? `₹ ${rs(pay0.returnCharges)}` : "—";
  const otherCharges = pay0?.otherCharges != null && String(pay0.otherCharges).trim() !== "" ? `₹ ${rs(pay0.otherCharges)}` : "—";
  const phoneNo = (p.insuredParty.mobile ?? "").trim() || "—";
  const emailId = (p.insuredParty.email ?? "").trim() || "—";
  const panNo = (p.insuredParty.pan ?? "").trim() || "—";
  const aadhaarNo = (p.insuredParty.aadhaarNo ?? "").trim() || "—";
  const parsedRemarks = parseRemarksForReceipt(p.remarks);
  const generalRemark = (p.generalRemark ?? "").trim() || parsedRemarks.generalRemark;
  const remark = parsedRemarks.remark;

  const rows: [string, string][] = [
    ["Receipt No.", receiptNo],
    ["Date", dateStr],
    ["SVKK ID", p.insuredParty.svkkPublicId],
    ["Customer ID", p.insuredParty.customerId ?? "—"],
    ["Policy Holder Name", p.insuredParty.name],
    ["Area", p.area ?? "—"],
    ["Phone No.", phoneNo],
    ["Email ID", emailId],
    ["Village", p.village ?? "—"],
    ["No. of Person", personsCount(p, y0)],
    ["Category", cat],
    ["Policy Type", policyTypeLabel(p)],
    ["Sum Insured", `₹ ${sumInsured}`],
    ["Premium Amount", `₹ ${vkk}`],
    ["Not Over", notOver],
    ["Bank Charges", bankCharges],
    ["Name as per Cheque", nameAsPerCheque],
    ["Other Charges", otherCharges],
    ["Amount Received", `₹ ${recv}`],
    ["Mode of Payment", paymentMode],
    ["Bank Name", pay0 ? (pay0.cheque?.bankName ?? y0?.bankName ?? "—") : "—"],
    ["Transaction No.", transactionDetail],
    ["Transaction Date", txnDateStr],
    ["PAN No.", panNo],
    ["Aadhaar No.", aadhaarNo],
    ["Remark", remark],
    ["General Remark", generalRemark],
  ];

  const half = Math.ceil(rows.length / 2);
  const left = rows.slice(0, half);
  const right = rows.slice(half);

  const colHtml = (slice: [string, string][]) =>
    slice
      .map(
        ([k, v], idx) =>
          `<div class="rrow"${idx === slice.length - 1 ? ' style="border-bottom:none"' : ""}><div>${escapeHtml(k)}</div><div>${escapeHtml(v || "—")}</div></div>`,
      )
      .join("");

  const embedded = options?.embedded === true;
  const bodyClass = embedded ? "receipt-root receipt-embedded" : "receipt-root";
  const headerImg = options?.headerImageUrl || DEFAULT_HEADER_IMAGE;
  const footerImg = options?.footerImageUrl || DEFAULT_FOOTER_IMAGE;

  const inner = `
    <div class="receipt-body receipt-a4-sheet">
      <header class="receipt-a4-header">
        <img src="${headerImg}" alt="Receipt Header" onerror="this.style.display='none'">
      </header>
      <main class="receipt-a4-main">
        <div class="receipt-title-wrap"><div class="receipt-title">RECEIPT</div></div>
        <div class="receipt-grid">
          <div class="rcol">${colHtml(left)}</div>
          <div class="rcol">${colHtml(right)}</div>
        </div>
        <div class="receipt-tail">
          <div class="member-card receipt-words"><div class="words-label">Amount in Words</div><div class="words-value">${escapeHtml(amountInWords)}</div></div>
          <div class="member-card receipt-thanks">Received with thanks the above amount towards mediclaim premium.</div>
          <div class="receipt-signatures">
            <div class="sig-block"><div class="sig-line">Authorized Signatory</div></div>
          </div>
        </div>
      </main>
      <footer class="receipt-a4-footer">
        <img src="${footerImg}" alt="Receipt Footer" onerror="this.style.display='none'">
      </footer>
    </div>`;

  const shell = embedded
    ? inner
    : `<div class="modal">
    <div class="modal-h no-print">
      <div style="font-size:20px;font-weight:800">Receipt Preview</div>
      <div class="btns">
        <button class="btn primary" type="button" onclick="window.print()">Print</button>
        <button class="btn" type="button" onclick="window.close()">Close</button>
      </div>
    </div>
    ${inner}
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(receiptNo)}</title>
  <style>
    :root {
      --line: #d1d5db;
      --text: #0f172a;
      --muted: #475569;
      --dark: #0f172a;
      --soft: #f8fafc;
      --a4-h: 277mm;
      --a4-w: 190mm;
      --header-h: 32mm;
      --footer-h: 26mm;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: ${embedded ? "#fff" : "#f3f4f6"}; color: var(--text); }
    .receipt-root {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      width: 100%;
    }
    .receipt-embedded { background: #fff; }
    .modal {
      width: min(100%, 210mm);
      margin: 0 auto;
      background: #fff;
      border-radius: 28px;
      box-shadow: 0 20px 40px rgba(0,0,0,.12);
      overflow: hidden;
      border: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .modal-h { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .btns { display: flex; flex-wrap: wrap; gap: 10px; }
    .btn { border: 1px solid var(--line); border-radius: 16px; padding: 11px 16px; background: #fff; font-size: 14px; font-weight: 800; cursor: pointer; }
    .btn.primary { background: var(--dark); color: #fff; border-color: var(--dark); }

    .receipt-a4-sheet,
    .receipt-body {
      width: var(--a4-w);
      max-width: var(--a4-w);
      margin-left: auto;
      margin-right: auto;
    }
    .receipt-a4-sheet {
      display: flex;
      flex-direction: column;
      height: var(--a4-h);
      min-height: var(--a4-h);
      max-height: var(--a4-h);
      overflow: hidden;
    }
    .receipt-a4-header {
      flex: 0 0 var(--header-h);
      height: var(--header-h);
      width: 100%;
      overflow: hidden;
    }
    .receipt-a4-footer {
      flex: 0 0 var(--footer-h);
      height: var(--footer-h);
      width: 100%;
      overflow: hidden;
    }
    .receipt-a4-header img,
    .receipt-a4-footer img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: fill;
      object-position: center center;
    }
    .receipt-a4-main {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      padding: 4px 10px 2px;
      overflow: hidden;
    }
    .receipt-a4-main > * {
      width: 100%;
      max-width: 100%;
    }
    .receipt-title-wrap { flex: 0 0 auto; text-align: center; margin: 4px 0 6px; }
    .receipt-title {
      display: inline-block;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 6px 18px;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: .18em;
    }

    .member-card { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 14px; background: var(--soft); }
    .receipt-words { margin-top: 8px; }
    .words-label { font-weight: 800; color: #334155; font-size: 12px; }
    .words-value { margin-top: 4px; font-weight: 700; font-size: 12px; line-height: 1.35; }
    .receipt-thanks { margin-top: 8px; font-size: 12px; }
    .receipt-grid {
      flex: 1 1 0;
      min-height: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
    }
    .rcol { display: flex; flex-direction: column; min-height: 0; }
    .rrow {
      flex: 1 1 0;
      display: grid;
      grid-template-columns: minmax(96px, 38%) minmax(0, 1fr);
      padding: 7px 10px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
      align-items: center;
      column-gap: 8px;
    }
    .rrow > div:first-child { font-weight: 800; color: #334155; }
    .rrow > div:last-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; hyphens: auto; }
    .rcol:first-child { border-right: 1px solid #e5e7eb; }
    .receipt-tail {
      flex: 0 0 auto;
      margin-top: auto;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .receipt-signatures { display: flex; justify-content: flex-end; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
    .sig-line { border-top: 2px solid #cbd5e1; padding-top: 8px; font-weight: 800; color: #475569; font-size: 12px; text-align: center; min-width: 180px; }

    @media (max-width: 700px) {
      .receipt-grid { grid-template-columns: 1fr; }
      .rcol:first-child { border-right: none; }
    }
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; background: #fff !important; overflow: hidden; }
      .no-print { display: none !important; }
      .modal {
        box-shadow: none;
        border-radius: 0;
        width: 210mm;
        max-width: 210mm;
        border: 0;
        overflow: hidden;
        align-items: center;
      }
      .receipt-root {
        display: flex;
        justify-content: center;
        width: 210mm;
        margin: 0 auto;
        padding: 0 !important;
      }
      .receipt-body,
      .receipt-a4-sheet {
        width: var(--a4-w);
        max-width: var(--a4-w);
        margin-left: auto !important;
        margin-right: auto !important;
        padding: 0 !important;
      }
      .receipt-a4-sheet {
        height: var(--a4-h);
        min-height: var(--a4-h);
        max-height: var(--a4-h);
        overflow: hidden;
        page-break-after: avoid;
        page-break-inside: avoid;
      }
      .receipt-a4-header { flex: 0 0 var(--header-h); height: var(--header-h); }
      .receipt-a4-footer { flex: 0 0 var(--footer-h); height: var(--footer-h); }
      .receipt-a4-header img,
      .receipt-a4-footer img { width: 100%; height: 100%; object-fit: fill; }
      .receipt-title { font-size: 18px; padding: 4px 14px; }
      .rrow { font-size: 10.5px; padding: 5px 8px; }
      .member-card { padding: 6px 10px; border-radius: 10px; }
      .receipt-signatures { margin-top: 10px !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="${bodyClass}">${shell}</div>
</body>
</html>`;
}

export async function openPolicyReceiptPrint(
  p: PolicyDetailForReceipt,
  imageUrls?: { headerImageUrl?: string; footerImageUrl?: string },
): Promise<boolean> {
  const html = buildReceiptDocumentHtml(p, { embedded: false, ...imageUrls });
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
