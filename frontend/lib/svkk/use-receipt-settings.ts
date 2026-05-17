import { useEffect, useState } from "react";
import { svkkJson } from "./api";
import type { ReceiptImageSettings } from "./receipt-image-resolve";

export type ReceiptImageUrls = ReceiptImageSettings;

let cache: ReceiptImageSettings | null = null;

export function invalidateReceiptSettingsCache(): void {
  cache = null;
}

export function useReceiptSettings(): ReceiptImageSettings {
  const [settings, setSettings] = useState<ReceiptImageSettings>(cache ?? {});

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await svkkJson<Record<string, string>>("/settings");
        const result: ReceiptImageSettings = {};
        if (rows.receipt_header_image) result.headerImageUrl = rows.receipt_header_image;
        if (rows.receipt_footer_image) result.footerImageUrl = rows.receipt_footer_image;
        if (rows.receipt_header_file_id) result.headerFileId = rows.receipt_header_file_id;
        if (rows.receipt_footer_file_id) result.footerFileId = rows.receipt_footer_file_id;
        cache = result;
        if (!cancelled) setSettings(result);
      } catch {
        /* settings not configured yet, use defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
