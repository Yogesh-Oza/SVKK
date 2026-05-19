/** Fixed SVKK email chrome — only the inner body is editable in admin. */
export const EMAIL_LAYOUT_FOOTER = `<p class="muted">SVKK MediClaim</p>`;

/** Mediclaim-branded footer (TEAM MEDICLAIM / Shree Vagad Kala Kendra). */
export const MEDICLAIM_LAYOUT_FOOTER = `<div class="mediclaim-sig">
<p><strong>Thank you,</strong></p>
<p><strong>TEAM MEDICLAIM</strong><br/>
Shree Vagad Kala Kendra<br/>
69, S.K.Bole Road, Stone Lodge, Opp. Ajanta Plywood, Dadar-W,<br/>
Mumbai-400028<br/>
Phone Number - 24371818-1515 | +91 93243 71212</p>
</div>`;

const MEDICLAIM_EXTRA_STYLES = `
.brand-bar{background:linear-gradient(135deg,#0b3d6e,#174ea6);color:#fff;padding:14px 18px;border-radius:8px;margin:0 0 20px}
.brand-bar .brand-title{margin:0;font-size:15px;font-weight:600;letter-spacing:.03em}
.brand-bar .brand-sub{margin:4px 0 0;font-size:12px;opacity:.92}
.mediclaim-sig{margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.65;color:#334155}
.mediclaim-sig strong{color:#0d4a8f}
.receipt-box{background:#f8fafc;border:1px solid #d9e3ee;border-radius:8px;padding:14px 16px;margin:16px 0}
.receipt-box table{width:100%;border-collapse:collapse;font-size:13px}
.receipt-box td{padding:7px 10px;border-bottom:1px solid #e8eef4;vertical-align:top}
.receipt-box td:first-child{color:#64748b;width:40%;font-weight:500}
.receipt-box tr:last-child td{border-bottom:none}
.alert-box{padding:12px 16px;border-radius:8px;margin:16px 0;font-size:14px;line-height:1.55}
.alert-warning{background:#fffbeb;border-left:4px solid #d97706;color:#92400e}
.alert-success{background:#ecfdf5;border-left:4px solid #059669;color:#065f46}
.policy-block{background:#f1f5f9;border:1px solid #d9e3ee;border-radius:8px;padding:14px 16px;margin:16px 0}
.policy-block p{margin:6px 0;font-size:14px}
.policy-block .label{color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.note-str{color:#b45309;font-weight:600}
`;

/** Mediclaim templates: richer styling + organisation signature block. */
export function wrapMediclaimEmailBody(body: string): string {
  const inner = body.trim();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
body{font-family:Segoe UI,Arial,sans-serif;line-height:1.55;color:#0b1728;margin:0;padding:24px;background:#eef2f7}
.card{max-width:600px;margin:0 auto;background:#fff;border:1px solid #d9e3ee;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(11,23,40,.06)}
h1{font-size:17px;margin:0 0 14px;color:#0d4a8f}
p{margin:0 0 12px}
.muted{color:#66798f;font-size:13px}
.btn{display:inline-block;margin-top:12px;padding:10px 18px;background:#174ea6;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600}
${MEDICLAIM_EXTRA_STYLES}
</style></head><body><div class="card">
<div class="brand-bar"><p class="brand-title">TEAM MEDICLAIM</p><p class="brand-sub">Shree Vagad Kala Kendra</p></div>
${inner}${MEDICLAIM_LAYOUT_FOOTER}
</div></body></html>`;
}

export function wrapEmailBody(body: string): string {
  const inner = body.trim();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
body{font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#0b1728;margin:0;padding:24px;background:#f4f7fb}
.card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9e3ee;border-radius:12px;padding:24px}
h1{font-size:18px;margin:0 0 12px}
.muted{color:#66798f;font-size:13px}
.btn{display:inline-block;margin-top:16px;padding:10px 18px;background:#174ea6;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px}
</style></head><body><div class="card">${inner}${EMAIL_LAYOUT_FOOTER}</div></body></html>`;
}

/** Strip layout wrapper so admins edit content only. */
export function extractEmailBody(stored: string): string {
  const html = stored.trim();
  if (!html) return "";

  if (!/^<!DOCTYPE/i.test(html) && !/^<html/i.test(html)) {
    return html;
  }

  const cardMatch = html.match(
    /<div class="card">([\s\S]*?)<p class="muted">\s*SVKK MediClaim\s*<\/p>\s*<\/div>/i,
  );
  if (cardMatch?.[1]) {
    return cardMatch[1].trim();
  }

  const mediclaimMatch = html.match(
    /<div class="card">\s*<div class="brand-bar">[\s\S]*?<\/div>\s*([\s\S]*?)<div class="mediclaim-sig">/i,
  );
  if (mediclaimMatch?.[1]) {
    return mediclaimMatch[1].trim();
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) {
    return bodyMatch[1]
      .replace(/<p class="muted">\s*SVKK MediClaim\s*<\/p>/gi, "")
      .replace(/<div class="mediclaim-sig">[\s\S]*$/gi, "")
      .replace(/<div class="brand-bar">[\s\S]*?<\/div>\s*/gi, "")
      .replace(/^<div class="card">/i, "")
      .replace(/<\/div>\s*$/i, "")
      .trim();
  }

  return html;
}
