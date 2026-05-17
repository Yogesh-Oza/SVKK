"use client";

/**
 * Receipt PDF via html2canvas + jsPDF.
 *
 * html2pdf.js clones the DOM into `document.body`, so html2canvas parses the
 * app theme (`globals.css` with `oklch()`). We capture inside the preview
 * iframe only and never move nodes to the parent page.
 */
export async function downloadReceiptPreviewAsPdf(
  filename: string = "policy-receipt.pdf",
  htmlOverride?: string,
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  let iframe: HTMLIFrameElement | null = null;
  let ownsIframe = false;

  try {
    const existing = document.querySelector<HTMLIFrameElement>(
      'iframe[title="Receipt Preview Frame"]',
    );

    if (!htmlOverride && existing?.contentDocument?.body) {
      iframe = existing;
    } else {
      const html = htmlOverride ?? readReceiptIframeHtml();
      if (!html) return false;
      iframe = await mountReceiptCaptureIframe(html);
      ownsIframe = true;
    }

    const target = await resolveReceiptCaptureTarget(iframe);
    if (!target) return false;

    const canvas = await captureReceiptCanvas(target);
    await saveCanvasAsPdf(canvas, filename);
    return true;
  } catch (err) {
    console.error("[receipt-pdf]", err);
    return false;
  } finally {
    if (ownsIframe && iframe) {
      iframe.remove();
    }
  }
}

async function captureReceiptCanvas(target: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;

  const width = Math.ceil(target.offsetWidth || target.scrollWidth || 794);
  const height = Math.ceil(target.offsetHeight || target.scrollHeight || 1123);

  return html2canvas(target, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    scrollX: 0,
    scrollY: 0,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    onclone: (clonedDoc) => {
      stripUnsupportedColorFunctions(clonedDoc);
    },
  });
}

/** Always one A4 page — scale receipt down if capture is slightly taller than printable area. */
async function saveCanvasAsPdf(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const imgData = canvas.toDataURL("image/jpeg", 0.98);

  // Receipt layout is 190×277mm; fit inside A4 (210×297mm) with a small margin.
  const marginMm = 5;
  const maxW = pageW - marginMm * 2;
  const maxH = pageH - marginMm * 2;

  let drawW = maxW;
  let drawH = (canvas.height * drawW) / canvas.width;

  if (drawH > maxH) {
    drawH = maxH;
    drawW = (canvas.width * drawH) / canvas.height;
  }

  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;

  pdf.addImage(imgData, "JPEG", x, y, drawW, drawH);
  pdf.save(filename);
}

/** Remove oklch/lab/etc. from inline stylesheets in the cloned tree. */
function stripUnsupportedColorFunctions(doc: Document): void {
  doc.querySelectorAll("style").forEach((node) => {
    const text = node.textContent;
    if (!text || !/oklch|lab\(|lch\(/i.test(text)) return;
    node.textContent = text
      .replace(/oklch\([^)]+\)/gi, "#0f172a")
      .replace(/lab\([^)]+\)/gi, "#0f172a")
      .replace(/lch\([^)]+\)/gi, "#0f172a");
  });

  doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (href.includes("_next") || href.includes("globals") || href.includes("layout")) {
      link.remove();
    }
  });

  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const style = el.getAttribute("style");
    if (!style || !/oklch|lab\(|lch\(/i.test(style)) return;
    el.setAttribute(
      "style",
      style
        .replace(/oklch\([^)]+\)/gi, "#0f172a")
        .replace(/lab\([^)]+\)/gi, "#0f172a")
        .replace(/lch\([^)]+\)/gi, "#0f172a"),
    );
  });
}

function readReceiptIframeHtml(): string | null {
  const frame = document.querySelector<HTMLIFrameElement>(
    'iframe[title="Receipt Preview Frame"]',
  );
  if (!frame) return null;
  if (frame.srcdoc) return frame.srcdoc;
  return frame.contentDocument?.documentElement?.outerHTML ?? null;
}

async function mountReceiptCaptureIframe(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Receipt PDF Capture");
  iframe.style.cssText =
    "position:fixed;left:-99999px;top:0;width:794px;height:1200px;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("Receipt iframe failed to load"));
    iframe.srcdoc = html;
  });

  return iframe;
}

async function resolveReceiptCaptureTarget(
  iframe: HTMLIFrameElement,
): Promise<HTMLElement | null> {
  const doc = iframe.contentDocument;
  if (!doc?.body) return null;

  if (doc.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
    });
  }

  await waitForImages(doc);

  return (
    doc.querySelector<HTMLElement>(".receipt-a4-sheet") ??
    doc.querySelector<HTMLElement>(".receipt-body") ??
    doc.body
  );
}

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
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
