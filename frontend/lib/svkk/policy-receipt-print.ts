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
    sumInsured: string | number | { toString(): string } | null;
    vkkPremium: string | number | { toString(): string } | null;
    bankName: string | null;
    payments?: Array<{
      cheque: {
        number: string;
        bankName: string;
      } | null;
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
  const cat = p.category?.key ?? p.category?.name ?? "—";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${ref}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; line-height: 1.5; }
    h1 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .meta { color: #444; font-size: 0.9rem; margin-bottom: 1rem; }
    dl { display: grid; grid-template-columns: 11rem 1fr; gap: 0.25rem 0.5rem; margin: 0; font-size: 0.95rem; }
    dt { color: #555; }
    dd { margin: 0; }
    .foot { margin-top: 1.5rem; font-size: 0.85rem; color: #333; }
  </style>
</head>
<body>
  <h1>Receipt</h1>
  <p class="meta">Receipt no: <strong>${ref}</strong> &nbsp;|&nbsp; Date: <strong>${dateStr}</strong></p>
  <dl>
    <dt>SVKK ID</dt><dd>${p.insuredParty.svkkPublicId}</dd>
    <dt>Policy holder</dt><dd>${p.insuredParty.name}</dd>
    <dt>Policy type</dt><dd>${policyTypeLabel(p)}</dd>
    <dt>Customer ID</dt><dd>${p.insuredParty.customerId ?? "—"}</dd>
    <dt>Pan No</dt><dd>${p.insuredParty.pan ?? "—"}</dd>
    <dt>Area</dt><dd>${p.area ?? "—"}</dd>
    <dt>Village</dt><dd>${p.village ?? "—"}</dd>
    <dt>Policy No</dt><dd>${p.policyNo ?? "—"}</dd>
    <dt>Persons</dt><dd>${p.personsInsuredCount ?? "—"}</dd>
    <dt>Category</dt><dd>${cat}</dd>
    <dt>Sum insured</dt><dd>${sumInsured}</dd>
    <dt>Cheque No</dt><dd>${chNo}</dd>
    <dt>Premium</dt><dd>${premium}</dd>
    <dt>Bank name</dt><dd>${chBank}</dd>
    <dt>Remark</dt><dd>${(p.remarks ?? "").trim() || "—"}</dd>
  </dl>
  <p class="foot">This is a computer-generated receipt and does not require a physical signature or seal.</p>
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
  w.print();
  return true;
}
