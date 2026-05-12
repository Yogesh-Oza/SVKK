"use client";

import { Button } from "@/components/ui/button";
import { backendApi } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { AxiosError } from "axios";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type PolicyDriveUploadButtonProps = {
  policyId?: string;
  expectedUpdatedAt?: string;
  /** Called once after all files finish uploading with the successfully uploaded URLs. */
  onUploaded: (urls: string[], meta?: { updatedAt?: string }) => void;
  disabled?: boolean;
  /** How many more files can be uploaded (defaults to 5). */
  maxFiles?: number;
};

type UploadResult = {
  webViewLink: string;
  policyUrl: string;
  updatedAt?: string;
  policyUpdated?: boolean;
};

async function uploadSingleFile(
  file: File,
  policyId?: string,
  expectedUpdatedAt?: string,
): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (policyId) fd.append("policyId", policyId);
  if (expectedUpdatedAt) fd.append("expectedUpdatedAt", expectedUpdatedAt);
  const { data } = await backendApi.post<UploadResult>("/upload/one-drive", fd);
  return data;
}

export function PolicyDriveUploadButton({
  policyId,
  expectedUpdatedAt,
  onUploaded,
  disabled,
  maxFiles = 5,
}: PolicyDriveUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    // Snapshot into a plain array BEFORE clearing the input,
    // because resetting .value empties the live FileList reference.
    const allFiles = Array.from(selected);
    e.target.value = "";

    if (!getSvkkApiBase()) {
      toast.error("NEXT_PUBLIC_API_URL is not set.");
      return;
    }

    const files = allFiles.slice(0, maxFiles);
    if (allFiles.length > maxFiles) {
      toast.warning(`Only the first ${maxFiles} file(s) will be uploaded (limit ${maxFiles}).`);
    }

    setBusy(true);
    setProgress({ done: 0, total: files.length });

    const urls: string[] = [];
    let lastMeta: { updatedAt?: string } | undefined;
    let failed = 0;

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const data = await uploadSingleFile(file, policyId, expectedUpdatedAt);
        const url = data.policyUrl || data.webViewLink;
        if (data.updatedAt) lastMeta = { updatedAt: data.updatedAt };
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        return url;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        urls.push(r.value);
      } else {
        failed++;
        let msg = "Upload failed";
        const err = r.reason;
        if (err instanceof AxiosError && err.response?.data) {
          const body = err.response.data as { message?: string };
          if (typeof body?.message === "string" && body.message) msg = body.message;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        toast.error(msg);
      }
    }

    if (urls.length > 0) {
      onUploaded(urls, lastMeta);
      toast.success(
        urls.length === 1
          ? "File uploaded successfully."
          : `${urls.length} file(s) uploaded successfully.`,
      );
    }

    setBusy(false);
    setProgress({ done: 0, total: 0 });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,image/*,.doc,.docx"
        multiple={maxFiles > 1}
        onChange={(e) => void onFiles(e)}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="mr-2 size-4" aria-hidden />
        )}
        {busy
          ? `Uploading ${progress.done}/${progress.total}…`
          : "Upload to OneDrive"}
      </Button>
    </>
  );
}
