"use client";

/**
 * Client-side PDF download for the Receipt Preview iframe.
 *
 * The iframe (`iframe[title="Receipt Preview Frame"]`) is rendered with the
 * full receipt HTML via `srcDoc`. To get a faithful PDF we:
 *   1. Read the full HTML out of the iframe (or take it from `htmlOverride`).
 *   2. Parse it, extract every `<style>` plus the body's children.
 *   3. Render that into an off-screen container in the *main* document, sized
 *      to A4 width so the rasterizer captures the receipt at full quality.
 *   4. Feed the container to html2pdf.js (html2canvas + jsPDF) → real .pdf
 *      file download. No browser print dialog involved.
 *
 * Dynamic import keeps the ~200KB+ pdf bundle out of the main chunk; the
 * library is only loaded the first time the user clicks "Save as PDF".
 */
export async function downloadReceiptPreviewAsPdf(
  filename: string = "policy-receipt.pdf",
  htmlOverride?: string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const html = htmlOverride ?? readReceiptIframeHtml();
  if (!html) return false;

  const container = renderReceiptIntoHiddenContainer(html);
  document.body.appendChild(container);

  try {
    const mod = await import("html2pdf.js");
    const html2pdf = mod.default;
    await html2pdf()
      .set({
        filename,
        margin: 10,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: container.scrollWidth,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        enableLinks: true,
      })
      .from(container)
      .save();
    return true;
  } finally {
    container.remove();
  }
}

function readReceiptIframeHtml(): string | null {
  const frame = document.querySelector<HTMLIFrameElement>(
    'iframe[title="Receipt Preview Frame"]',
  );
  if (!frame) return null;
  if (frame.srcdoc) return frame.srcdoc;
  return frame.contentDocument?.documentElement?.outerHTML ?? null;
}

function renderReceiptIntoHiddenContainer(html: string): HTMLDivElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const styleTags = Array.from(doc.head.querySelectorAll("style"))
    .map((s) => s.outerHTML)
    .join("\n");
  const bodyHtml = doc.body.innerHTML;

  const container = document.createElement("div");
  // A4 width @ 96dpi ≈ 794px. Place far off-screen so we never flash content.
  container.style.cssText =
    "position:fixed; left:-99999px; top:0; width:794px; background:#ffffff; color:#000000;";
  container.innerHTML = `${styleTags}<div class="receipt-pdf-root">${bodyHtml}</div>`;
  return container;
}

/** Lightweight wrapper around the iframe's native print. */
export function printReceiptPreview(): boolean {
  if (typeof window === "undefined") return false;
  const frame = document.querySelector<HTMLIFrameElement>(
    'iframe[title="Receipt Preview Frame"]',
  );
  if (!frame?.contentWindow) return false;
  frame.contentWindow.focus();
  frame.contentWindow.print();
  return true;
}

/** Compose a polite filename: `receipt-<id>-<year>.pdf`, stripped of unsafe chars. */
export function buildReceiptFilename(
  parts: Array<string | null | undefined>,
): string {
  const safe = parts
    .map((p) => (p ?? "").toString().trim())
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "policy-receipt"}.pdf`;
}
