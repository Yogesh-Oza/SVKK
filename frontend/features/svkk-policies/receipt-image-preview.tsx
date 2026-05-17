"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  resolveReceiptImageSource,
  type ReceiptImageSource,
} from "@/lib/svkk/receipt-image-resolve";

type ReceiptImagePreviewProps = ReceiptImageSource & {
  alt: string;
  className?: string;
  /** Instant preview while uploading (local object URL). */
  overrideSrc?: string | null;
  caption?: string;
};

export function ReceiptImagePreview({
  fileId,
  shareUrl,
  defaultPath,
  alt,
  className,
  overrideSrc,
  caption,
}: ReceiptImagePreviewProps) {
  const hasCustom = Boolean(fileId?.trim() || shareUrl?.trim());
  const [src, setSrc] = useState<string | null>(
    overrideSrc ?? (hasCustom ? null : defaultPath),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (overrideSrc) {
      setSrc(overrideSrc);
      setFailed(false);
      return;
    }

    if (!hasCustom) {
      setSrc(defaultPath);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void resolveReceiptImageSource({ fileId, shareUrl, defaultPath }).then((url) => {
      if (cancelled) return;
      setSrc(url);
      setFailed(hasCustom && url === defaultPath);
    });
    return () => {
      cancelled = true;
    };
  }, [overrideSrc, fileId, shareUrl, defaultPath, hasCustom]);

  return (
    <div className="space-y-1">
      {caption ? <p className="text-muted-foreground text-xs">{caption}</p> : null}
      {!src ? (
        <div className="text-muted-foreground flex h-28 items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading preview…
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white p-2">
          <img src={src} alt={alt} className={className ?? "max-h-36 w-full object-contain"} onError={() => setFailed(true)} />
        </div>
      )}
      {failed ? (
        <p className="text-destructive text-xs">
          Could not load the saved image from OneDrive. Upload the file again.
        </p>
      ) : null}
    </div>
  );
}
