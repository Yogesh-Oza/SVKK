"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkFetch } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useState } from "react";

const MODES = ["POD_ONLY", "POLICY_ONLY", "FULL"] as const;

export default function SvkkUploadPage() {
  const { user } = useSvkkAuth();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<(typeof MODES)[number]>("POD_ONLY");
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const missingUrl = !getSvkkApiBase();

  if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return <p className="text-muted-foreground text-sm">You do not have access to CSV upload.</p>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    if (!file) {
      setErr("Choose a file.");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("updateMode", mode);
      fd.append("dryRun", dryRun ? "true" : "false");
      fd.append("force", "false");
      const res = await svkkFetch("/upload/csv", { method: "POST", body: fd });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || res.statusText);
      }
      setResult(text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPending(false);
    }
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">CSV upload</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>File</Label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <Label>Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as (typeof MODES)[number])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry run (validate only)
        </label>
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
      </form>
      {result ? (
        <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">{result}</pre>
      ) : null}
    </div>
  );
}
