"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { toast } from "sonner";

export default function SettingsPage() {
  const [headerUrl, setHeaderUrl] = useState("");
  const [footerUrl, setFooterUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingFooter, setUploadingFooter] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await svkkJson<Record<string, string>>("/settings");
        if (cancelled) return;
        setHeaderUrl(settings.receipt_header_image ?? "");
        setFooterUrl(settings.receipt_footer_image ?? "");
      } catch {
        /* settings not configured yet */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const uploadToOneDrive = useCallback(async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await backendApi.post<{ webViewLink: string }>("/upload/one-drive", fd);
      return data.webViewLink;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      return null;
    }
  }, []);

  const saveSetting = useCallback(async (key: string, value: string) => {
    await backendApi.put(`/settings/${key}`, { value });
  }, []);

  async function handleHeaderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingHeader(true);
    const url = await uploadToOneDrive(file);
    if (url) {
      setHeaderUrl(url);
      setSavingHeader(true);
      try {
        await saveSetting("receipt_header_image", url);
        toast.success("Header image saved.");
      } catch { toast.error("Failed to save header setting."); }
      finally { setSavingHeader(false); }
    }
    setUploadingHeader(false);
  }

  async function handleFooterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingFooter(true);
    const url = await uploadToOneDrive(file);
    if (url) {
      setFooterUrl(url);
      setSavingFooter(true);
      try {
        await saveSetting("receipt_footer_image", url);
        toast.success("Footer image saved.");
      } catch { toast.error("Failed to save footer setting."); }
      finally { setSavingFooter(false); }
    }
    setUploadingFooter(false);
  }

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
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Manage receipt images and other application-wide settings.
        </p>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-[#d9e3ee]/90 bg-white/95 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur">
        <CardContent className="space-y-6 p-6">
          <h2 className="text-lg font-bold tracking-tight text-[#0b1728]">Receipt Images</h2>

          <div className="rounded-[18px] border border-[#e1e9f2] bg-linear-to-b from-white to-[#f8fbff] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="size-5 text-[#174ea6]" />
              <h3 className="text-base font-extrabold tracking-tight text-[#0b1728]">Receipt Header Image</h3>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#66798f]">
              This image appears at the top of every receipt. Upload a new image to replace the current one. The image is uploaded to OneDrive and the public link is stored.
            </p>
            {headerUrl ? (
              <div className="mb-3 overflow-hidden rounded-lg border border-[#d9e3ee] bg-white p-2">
                <img src={headerUrl} alt="Receipt header preview" className="max-h-32 w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <p className="mt-1 truncate text-xs text-[#66798f]">{headerUrl}</p>
              </div>
            ) : (
              <p className="mb-3 text-sm text-[#66798f]">No custom header set. Using default <code>/Header_Receipt.png</code>.</p>
            )}
            <input ref={headerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleHeaderUpload(e)} />
            <Button type="button" variant="outline" disabled={uploadingHeader || savingHeader} onClick={() => headerInputRef.current?.click()}>
              {uploadingHeader ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              {uploadingHeader ? "Uploading…" : savingHeader ? "Saving…" : "Upload Header Image"}
            </Button>
          </div>

          <div className="rounded-[18px] border border-[#e1e9f2] bg-linear-to-b from-white to-[#f8fbff] p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="size-5 text-[#174ea6]" />
              <h3 className="text-base font-extrabold tracking-tight text-[#0b1728]">Receipt Footer Image</h3>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#66798f]">
              This image appears at the bottom of every receipt, after the Authorized Signatory section.
            </p>
            {footerUrl ? (
              <div className="mb-3 overflow-hidden rounded-lg border border-[#d9e3ee] bg-white p-2">
                <img src={footerUrl} alt="Receipt footer preview" className="max-h-32 w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <p className="mt-1 truncate text-xs text-[#66798f]">{footerUrl}</p>
              </div>
            ) : (
              <p className="mb-3 text-sm text-[#66798f]">No custom footer set. Using default <code>/Footer_Receipt.png</code>.</p>
            )}
            <input ref={footerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFooterUpload(e)} />
            <Button type="button" variant="outline" disabled={uploadingFooter || savingFooter} onClick={() => footerInputRef.current?.click()}>
              {uploadingFooter ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              {uploadingFooter ? "Uploading…" : savingFooter ? "Saving…" : "Upload Footer Image"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
