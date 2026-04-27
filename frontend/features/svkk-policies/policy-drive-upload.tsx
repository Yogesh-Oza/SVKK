"use client";

import { Button } from "@/components/ui/button";
import { backendApi } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { AxiosError } from "axios";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type PolicyDriveUploadButtonProps = {
  policyId?: string;
  expectedUpdatedAt?: string;
  onUploaded: (url: string, meta?: { updatedAt?: string }) => void;
  disabled?: boolean;
};

export function PolicyDriveUploadButton({
  policyId,
  expectedUpdatedAt,
  onUploaded,
  disabled,
}: PolicyDriveUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!getSvkkApiBase()) {
      toast.error("NEXT_PUBLIC_API_URL is not set.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (policyId) fd.append("policyId", policyId);
      if (expectedUpdatedAt) fd.append("expectedUpdatedAt", expectedUpdatedAt);
      const { data } = await backendApi.post<{
        webViewLink: string;
        policyUrl: string;
        updatedAt?: string;
        policyUpdated?: boolean;
      }>("/upload/google-drive", fd);
      const url = data.policyUrl || data.webViewLink;
      onUploaded(url, data.updatedAt ? { updatedAt: data.updatedAt } : undefined);
      toast.success(
        policyId && data.policyUpdated ? "Uploaded and policy link saved." : "Link ready — filled in below.",
      );
    } catch (err) {
      let msg = "Upload failed";
      if (err instanceof AxiosError && err.response?.data) {
        const body = err.response.data as { message?: string };
        if (typeof body?.message === "string" && body.message) msg = body.message;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,image/*,.doc,.docx"
        onChange={(e) => void onFile(e)}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-2 size-4" aria-hidden />
        {busy ? "Uploading…" : "Upload to Drive"}
      </Button>
    </>
  );
}
