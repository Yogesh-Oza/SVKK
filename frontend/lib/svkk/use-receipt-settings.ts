import { useEffect, useState } from "react";
import { svkkJson } from "./api";

export type ReceiptImageUrls = {
  headerImageUrl?: string;
  footerImageUrl?: string;
};

let cache: ReceiptImageUrls | null = null;

export function useReceiptSettings(): ReceiptImageUrls {
  const [urls, setUrls] = useState<ReceiptImageUrls>(cache ?? {});

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await svkkJson<Record<string, string>>("/settings");
        const result: ReceiptImageUrls = {};
        if (settings.receipt_header_image) result.headerImageUrl = settings.receipt_header_image;
        if (settings.receipt_footer_image) result.footerImageUrl = settings.receipt_footer_image;
        cache = result;
        if (!cancelled) setUrls(result);
      } catch {
        /* settings not configured yet, use defaults */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return urls;
}
