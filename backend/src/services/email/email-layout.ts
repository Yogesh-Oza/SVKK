/** Fixed SVKK email chrome — only the inner body is editable in admin. */
export const EMAIL_LAYOUT_FOOTER = `<p class="muted">SVKK MediClaim</p>`;

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

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) {
    return bodyMatch[1]
      .replace(/<p class="muted">\s*SVKK MediClaim\s*<\/p>/gi, "")
      .replace(/^<div class="card">/i, "")
      .replace(/<\/div>\s*$/i, "")
      .trim();
  }

  return html;
}
