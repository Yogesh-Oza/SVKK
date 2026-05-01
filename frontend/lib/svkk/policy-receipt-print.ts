/**
 * Legacy-style “computer generated receipt” for browser print (no server PDF).
 * Accepts the JSON shape returned by `GET /policies/:id` (or a compatible subset).
 */

export type PolicyDetailForReceipt = {
  id?: string;
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
    amountReceived?: string | number | { toString(): string } | null;
    bankName: string | null;
    utrRef?: string | null;
    yearRemarks?: string | null;
    members?: unknown[];
    receipts?: Array<{ receiptNo: string }>;
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

function payStatus(pay: NonNullable<PolicyDetailForReceipt["years"][0]["payments"]>[0] | null): string {
  const s = pay?.cheque?.status;
  if (!s) return "—";
  return String(s)
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
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

function personsCount(p: PolicyDetailForReceipt, y0: PolicyDetailForReceipt["years"][0] | undefined): string {
  if (p.personsInsuredCount != null && p.personsInsuredCount >= 0) {
    return String(p.personsInsuredCount);
  }
  const m = y0?.members?.length ?? 0;
  return m > 0 ? String(m + 1) : "—";
}

function remarkLine(p: PolicyDetailForReceipt, y0: PolicyDetailForReceipt["years"][0] | undefined): string {
  const a = (p.remarks ?? "").trim();
  if (a) return a;
  const b = (y0?.yearRemarks ?? "").trim();
  return b || "—";
}

/** Public asset; resolves in iframe srcDoc to the app origin. */
const RECEIPT_HEADER_IMAGE = "/reciept_full_logo.png";

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
  options?: { issuedDate?: Date; embedded?: boolean },
): string {
  const y0 = p.years[0];
  const dateStr = displayDate(options?.issuedDate ?? new Date());
  const receiptNo = receiptNoFor(p, y0);
  const ref = (p.referenceNo ?? "").trim() || "—";
  const sumInsured = y0 ? rs(y0.sumInsured) : "0";
  const vkk = y0 ? rs(y0.vkkPremium) : "0";
  const recvRaw = y0?.amountReceived != null && String(y0.amountReceived).trim() !== "" ? y0.amountReceived : y0?.vkkPremium;
  const recv = y0 ? rs(recvRaw) : "0";
  const { no: chNo } = y0 ? chequeInfo(y0) : { no: "—" };
  const pay0 = pickPayment(y0);
  const yearLabel = y0?.yearLabel ?? p.periodYearText ?? "—";
  const paymentMode = payMode(pay0);
  const transactionDetail =
    (pay0?.transactionDetail ?? "").trim() || chNo || (y0?.utrRef ?? "").trim() || "—";
  const payOrChqDate = pay0?.cheque?.chequeDate ?? pay0?.transactionDate ?? pay0?.createdAt;
  const chqDateStr = displayDate(payOrChqDate);
  const txnDateStr = displayDate(pay0?.transactionDate ?? pay0?.createdAt ?? payOrChqDate);
  const paymentStatus = pay0?.cheque ? payStatus(pay0) : pay0 ? "—" : "—";
  const cat = p.category?.key ?? p.category?.name ?? "—";
  const amountNum = Number(String(recvRaw).replace(/[^\d.-]/g, "")) || 0;
  const amountInWords = amountToWordsIndian(amountNum);

  const rows: [string, string][] = [
    ["Receipt No.", receiptNo],
    ["Date", dateStr],
    ["SVKK ID", p.insuredParty.svkkPublicId],
    ["Customer ID", p.insuredParty.customerId ?? "—"],
    ["Reference No.", ref],
    ["Policy No.", p.policyNo ?? "—"],
    ["Policy Holder Name", p.insuredParty.name],
    ["Policy Type", policyTypeLabel(p)],
    ["Category", cat],
    ["Sum Insured", `₹ ${sumInsured}`],
    ["No. of Persons", personsCount(p, y0)],
    ["Village", p.village ?? "—"],
    ["Area", p.area ?? "—"],
    ["Year", yearLabel],
    ["Premium Amount", `₹ ${vkk}`],
    ["Amount Received", `₹ ${recv}`],
    ["Date of Payment / CHQ Date", chqDateStr],
    ["Mode of Payment", paymentMode],
    ["Transaction Detail", transactionDetail],
    ["Transaction Date", txnDateStr],
    ["Status", paymentStatus],
    ["Remark", remarkLine(p, y0)],
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
  const bodyPad = embedded ? "padding:16px 24px 24px" : "padding:24px";
  const bodyClass = embedded ? "receipt-root receipt-embedded" : "receipt-root";

  const inner = `
    <div class="receipt-body" style="max-width:1200px;margin:0 auto;${bodyPad}">
      <div style="border-bottom:2px solid #e5e7eb;padding-bottom:14px"><img src="${RECEIPT_HEADER_IMAGE}" alt="Receipt Header" style="width:100%;height:auto;display:block" onerror="this.style.display='none'"></div>
      <div style="text-align:center;margin-top:20px"><div style="display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:10px 22px;font-size:28px;font-weight:900;letter-spacing:.18em">RECEIPT</div></div>
      <div class="receipt-grid" style="margin-top:20px">
        <div class="rcol">${colHtml(left)}</div>
        <div class="rcol">${colHtml(right)}</div>
      </div>
      <div class="receipt-tail">
      <div class="member-card" style="margin-top:14px"><div style="font-weight:800;color:#334155">Amount in Words</div><div style="margin-top:8px;font-weight:700">${escapeHtml(amountInWords)}</div></div>
      <div class="member-card" style="margin-top:14px">Received with thanks the above amount towards mediclaim premium.</div>
      <div class="receipt-signatures" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:40px">
        <div><div style="border-top:2px solid #cbd5e1;padding-top:10px;font-weight:800;color:#475569">Receiver</div></div>
        <div><div style="border-top:2px solid #cbd5e1;padding-top:10px;font-weight:800;color:#475569">Authorized Signatory</div></div>
      </div>
      </div>
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
    :root { --line: #d1d5db; --text: #0f172a; --muted: #475569; --dark: #0f172a; --soft: #f8fafc; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: ${embedded ? "#fff" : "#f3f4f6"}; color: var(--text); }
    .receipt-embedded { background: #fff; }
    .modal { width: min(100%, 1000px); margin: 0 auto; background: #fff; border-radius: 28px; box-shadow: 0 20px 40px rgba(0,0,0,.12); overflow: hidden; border: 1px solid #e5e7eb; }
    .modal-h { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .btns { display: flex; flex-wrap: wrap; gap: 10px; }
    .btn { border: 1px solid var(--line); border-radius: 16px; padding: 11px 16px; background: #fff; font-size: 14px; font-weight: 800; cursor: pointer; }
    .btn.primary { background: var(--dark); color: #fff; border-color: var(--dark); }
    .member-card { padding: 16px; border: 1px solid #e5e7eb; border-radius: 22px; background: var(--soft); }
    .receipt-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); border-radius: 20px; overflow: hidden; }
    .rrow { display: grid; grid-template-columns: minmax(120px, 38%) minmax(0, 1fr); padding: 11px 14px; border-bottom: 1px solid #e5e7eb; font-size: 14px; align-items: start; column-gap: 10px; }
    .rrow > div:first-child { font-weight: 800; color: #334155; }
    .rrow > div:last-child {
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
      hyphens: auto;
    }
    .rcol:first-child { border-right: 1px solid #e5e7eb; }
    .receipt-tail { break-inside: avoid; page-break-inside: avoid; }
    .receipt-signatures { break-inside: avoid; page-break-inside: avoid; }
    @media (max-width: 700px) {
      .receipt-grid { grid-template-columns: 1fr; }
      .rcol:first-child { border-right: none; }
      .rrow { grid-template-columns: minmax(100px, 42%) minmax(0, 1fr); }
    }
    @media print {
      @page { size: A4; margin: 12mm; }
      body { background: #fff !important; margin: 0; }
      .no-print { display: none !important; }
      .modal { box-shadow: none; border-radius: 0; width: 100%; max-width: none; border: 0; overflow: visible; }
      .receipt-body { max-width: none !important; width: 100%; padding: 0 !important; margin: 0; }
      .receipt-grid {
        overflow: visible;
        border-radius: 12px;
        page-break-inside: auto;
      }
      .rcol { min-width: 0; }
      .rrow {
        grid-template-columns: minmax(100px, 36%) minmax(0, 1fr);
        font-size: 12px;
        padding: 8px 10px;
      }
      .member-card { break-inside: avoid; page-break-inside: avoid; border-radius: 12px; }
      .receipt-tail { break-inside: avoid; page-break-inside: avoid; }
      .receipt-signatures { break-inside: avoid; page-break-inside: avoid; margin-top: 28px !important; }
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
): Promise<boolean> {
  const html = buildReceiptDocumentHtml(p, { embedded: false });
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}
