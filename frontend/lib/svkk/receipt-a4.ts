/** A4 @ 96dpi — used for receipt print layout and upload guidance. */
export const RECEIPT_A4 = {
  widthMm: 210,
  heightMm: 297,
  widthPx: 794,
  heightPx: 1123,
  /** Fixed print slots (mm) — images are scaled/cropped to these heights. */
  headerSlotMm: 32,
  footerSlotMm: 26,
  /** Rough pixel equivalents @ 96dpi for upload guidance. */
  recommendedHeaderMaxPx: 121,
  recommendedFooterMaxPx: 98,
  /** Printable area after typical 12mm margins on each side. */
  printableWidthMm: 186,
  printableHeightMm: 273,
} as const;

export type ImageDimensions = { width: number; height: number };

export function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

export function formatDimensionHint(d: ImageDimensions, role: "header" | "footer"): string {
  const max =
    role === "header" ? RECEIPT_A4.recommendedHeaderMaxPx : RECEIPT_A4.recommendedFooterMaxPx;
  const ok = d.height <= max;
  const status = ok ? "OK for single-page A4" : `Tall — keep under ~${max}px height for one page`;
  return `${d.width} × ${d.height} px · ${status}`;
}
