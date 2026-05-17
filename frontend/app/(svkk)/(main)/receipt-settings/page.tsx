"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReceiptImagePreview } from "@/features/svkk-policies/receipt-image-preview";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import {
  DEFAULT_RECEIPT_FOOTER_IMAGE,
  DEFAULT_RECEIPT_HEADER_IMAGE,
} from "@/lib/svkk/receipt-image-resolve";
import {
  formatDimensionHint,
  readImageDimensions,
  RECEIPT_A4,
  type ImageDimensions,
} from "@/lib/svkk/receipt-a4";
import { invalidateReceiptSettingsCache } from "@/lib/svkk/use-receipt-settings";
import { toast } from "sonner";

export default function ReceiptSettingsPage() {
  const [headerUrl, setHeaderUrl] = useState("");
  const [footerUrl, setFooterUrl] = useState("");
  const [headerFileId, setHeaderFileId] = useState("");
  const [footerFileId, setFooterFileId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingFooter, setUploadingFooter] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);
  const [headerDims, setHeaderDims] = useState<ImageDimensions | null>(null);
  const [footerDims, setFooterDims] = useState<ImageDimensions | null>(null);
  const [headerPickHint, setHeaderPickHint] = useState<string | null>(null);
  const [footerPickHint, setFooterPickHint] = useState<string | null>(null);
  const [headerLocalPreview, setHeaderLocalPreview] = useState<string | null>(null);
  const [footerLocalPreview, setFooterLocalPreview] = useState<string | null>(null);

  const hasCustomHeader = Boolean(headerFileId.trim() || headerUrl.trim());
  const hasCustomFooter = Boolean(footerFileId.trim() || footerUrl.trim());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await svkkJson<Record<string, string>>("/settings");
        if (cancelled) return;
        setHeaderUrl(settings.receipt_header_image ?? "");
        setFooterUrl(settings.receipt_footer_image ?? "");
        setHeaderFileId(settings.receipt_header_file_id ?? "");
        setFooterFileId(settings.receipt_footer_file_id ?? "");
      } catch {
        /* settings not configured yet */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadToOneDrive = useCallback(
    async (file: File): Promise<{ webViewLink: string; fileId: string } | null> => {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const { data } = await backendApi.post<{ webViewLink: string; fileId: string }>(
          "/upload/one-drive",
          fd,
        );
        return data;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return null;
      }
    },
    [],
  );

  const saveSetting = useCallback(async (key: string, value: string) => {
    await backendApi.put(`/settings/${key}`, { value });
  }, []);

  async function handleHeaderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setHeaderLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return localUrl;
    });
    try {
      const d = await readImageDimensions(file);
      setHeaderDims(d);
      setHeaderPickHint(formatDimensionHint(d, "header"));
    } catch {
      setHeaderPickHint("Could not read image size");
    }
    setUploadingHeader(true);
    const uploaded = await uploadToOneDrive(file);
    if (uploaded) {
      setHeaderUrl(uploaded.webViewLink);
      setHeaderFileId(uploaded.fileId);
      setSavingHeader(true);
      try {
        await saveSetting("receipt_header_image", uploaded.webViewLink);
        await saveSetting("receipt_header_file_id", uploaded.fileId);
        invalidateReceiptSettingsCache();
        toast.success("Header image saved.");
      } catch {
        toast.error("Failed to save header setting.");
      } finally {
        setSavingHeader(false);
      }
    }
    setHeaderLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadingHeader(false);
  }

  async function handleFooterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setFooterLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return localUrl;
    });
    try {
      const d = await readImageDimensions(file);
      setFooterDims(d);
      setFooterPickHint(formatDimensionHint(d, "footer"));
    } catch {
      setFooterPickHint("Could not read image size");
    }
    setUploadingFooter(true);
    const uploaded = await uploadToOneDrive(file);
    if (uploaded) {
      setFooterUrl(uploaded.webViewLink);
      setFooterFileId(uploaded.fileId);
      setSavingFooter(true);
      try {
        await saveSetting("receipt_footer_image", uploaded.webViewLink);
        await saveSetting("receipt_footer_file_id", uploaded.fileId);
        invalidateReceiptSettingsCache();
        toast.success("Footer image saved.");
      } catch {
        toast.error("Failed to save footer setting.");
      } finally {
        setSavingFooter(false);
      }
    }
    setFooterLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUploadingFooter(false);
  }

  useEffect(() => {
    return () => {
      if (headerLocalPreview) URL.revokeObjectURL(headerLocalPreview);
      if (footerLocalPreview) URL.revokeObjectURL(footerLocalPreview);
    };
  }, [headerLocalPreview, footerLocalPreview]);

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Receipt Settings</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Manage receipt header and footer images. Receipts print on one A4 page with your header and footer.
          OneDrive links are loaded through the server so they display correctly on receipts.
        </p>
      </div>

      <Card className="rounded-3xl border border-[#d9e3ee]/90 bg-[#f8fbff]/95">
        <CardContent className="space-y-2 p-5 text-sm text-[#334155]">
          <p className="font-semibold text-[#0b1728]">A4 print size</p>
          <p>
            Page: {RECEIPT_A4.widthMm} × {RECEIPT_A4.heightMm} mm (
            {RECEIPT_A4.widthPx} × {RECEIPT_A4.heightPx} px at 96 dpi). Printable area with margins: about{" "}
            {RECEIPT_A4.printableWidthMm} × {RECEIPT_A4.printableHeightMm} mm.
          </p>
          <p className="text-xs text-[#66798f]">
            Header and footer use fixed print slots ({RECEIPT_A4.headerSlotMm}mm and{" "}
            {RECEIPT_A4.footerSlotMm}mm tall); uploaded images are stretched to fill those areas.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-3xl border border-[#d9e3ee]/90 bg-white/95 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur">
        <CardContent className="space-y-6 p-6">
          <h2 className="text-lg font-bold tracking-tight text-[#0b1728]">Receipt Images</h2>

          <div className="rounded-[18px] border border-[#e1e9f2] bg-linear-to-b from-white to-[#f8fbff] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="size-5 text-[#174ea6]" />
              <h3 className="text-base font-extrabold tracking-tight text-[#0b1728]">Receipt Header Image</h3>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#66798f]">
              Upload a wide banner image. It is scaled to a fixed {RECEIPT_A4.headerSlotMm}mm-tall header band.
            </p>
            {headerPickHint ? (
              <p className="mb-2 text-xs font-medium text-[#174ea6]">Selected file: {headerPickHint}</p>
            ) : null}
            <div className="mb-3">
              <ReceiptImagePreview
                fileId={headerFileId}
                shareUrl={headerUrl}
                defaultPath={DEFAULT_RECEIPT_HEADER_IMAGE}
                overrideSrc={headerLocalPreview}
                alt="Receipt header preview"
                className="max-h-36 w-full object-contain"
                caption={
                  hasCustomHeader
                    ? "Custom header — prints on every receipt"
                    : `Default header (${DEFAULT_RECEIPT_HEADER_IMAGE}) — upload to replace`
                }
              />
              {hasCustomHeader ? (
                <p className="mt-1 truncate text-xs text-[#66798f]">
                  {headerFileId ? `OneDrive file · ${headerFileId.slice(0, 12)}…` : headerUrl}
                </p>
              ) : null}
            </div>
            <input
              ref={headerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleHeaderUpload(e)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadingHeader || savingHeader}
              onClick={() => headerInputRef.current?.click()}
            >
              {uploadingHeader ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              {uploadingHeader ? "Uploading…" : savingHeader ? "Saving…" : "Upload Header Image"}
            </Button>
          </div>

          <div className="rounded-[18px] border border-[#e1e9f2] bg-linear-to-b from-white to-[#f8fbff] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="size-5 text-[#174ea6]" />
              <h3 className="text-base font-extrabold tracking-tight text-[#0b1728]">Receipt Footer Image</h3>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#66798f]">
              Upload a footer banner. It is scaled to a fixed {RECEIPT_A4.footerSlotMm}mm-tall footer band.
            </p>
            {footerPickHint ? (
              <p className="mb-2 text-xs font-medium text-[#174ea6]">Selected file: {footerPickHint}</p>
            ) : null}
            <div className="mb-3">
              <ReceiptImagePreview
                fileId={footerFileId}
                shareUrl={footerUrl}
                defaultPath={DEFAULT_RECEIPT_FOOTER_IMAGE}
                overrideSrc={footerLocalPreview}
                alt="Receipt footer preview"
                className="max-h-36 w-full object-contain"
                caption={
                  hasCustomFooter
                    ? "Custom footer — prints on every receipt"
                    : `Default footer (${DEFAULT_RECEIPT_FOOTER_IMAGE}) — upload to replace`
                }
              />
              {hasCustomFooter ? (
                <p className="mt-1 truncate text-xs text-[#66798f]">
                  {footerFileId ? `OneDrive file · ${footerFileId.slice(0, 12)}…` : footerUrl}
                </p>
              ) : null}
            </div>
            <input
              ref={footerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFooterUpload(e)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploadingFooter || savingFooter}
              onClick={() => footerInputRef.current?.click()}
            >
              {uploadingFooter ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              {uploadingFooter ? "Uploading…" : savingFooter ? "Saving…" : "Upload Footer Image"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
