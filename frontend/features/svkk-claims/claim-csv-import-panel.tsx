"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { backendApi } from "@/lib/svkk/api";
import { Download, FileSpreadsheet } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type MatchStatus = "MATCHED_EXACT" | "UNLINKED" | "CONFLICT";

type PreviewRow = {
  rowNumber: number;
  claimNo: string;
  policyNo: string;
  matchStatus: MatchStatus;
  verificationWarnings?: string[];
  policyHolderName?: string;
  claimAmount?: number | null;
};

type MatchSummary = {
  totalRows: number;
  matchedExact: number;
  unlinked: number;
  conflicts: number;
  verificationWarnings: number;
};

type ImportResult = {
  jobId: string;
  created: number;
  updated: number;
  failed: number;
  matchStats: MatchSummary;
  errorReportUrl?: string;
};

function matchBadge(status: MatchStatus): { label: string; className: string } {
  if (status === "MATCHED_EXACT") {
    return { label: "Matched", className: "text-emerald-600" };
  }
  if (status === "CONFLICT") {
    return { label: "Conflict", className: "text-amber-600" };
  }
  return { label: "Not found", className: "text-destructive" };
}

const CLAIM_IMPORT_MODE = "CREATE_ONLY" as const;

type ClaimCsvImportInlineProps = {
  disabled?: boolean;
  onImported?: () => void;
};

export function ClaimCsvImportInline({ disabled = false, onImported }: ClaimCsvImportInlineProps) {
  const [file, setFile] = useState<File | null>(null);
  const [linkMode, setLinkMode] = useState<"STRICT_MATCH" | "ALLOW_UNLINKED">("STRICT_MATCH");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [importMsg, setImportMsg] = useState("");

  const downloadSample = useCallback(async () => {
    try {
      const res = await backendApi.get("/claims/export-sample.csv", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "claim-import-sample.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }, []);

  const runPreview = useCallback(async () => {
    if (!file) {
      toast.error("Choose a CSV or XLSX file first");
      return;
    }
    setPreviewBusy(true);
    setLastResult(null);
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("linkMode", linkMode);
      fd.append("importMode", CLAIM_IMPORT_MODE);
      const { data } = await backendApi.post<{
        previewToken: string;
        previewRows: PreviewRow[];
        summary: MatchSummary;
      }>("/upload/claim-csv/preview", fd);
      setPreviewToken(data.previewToken);
      setPreviewRows(data.previewRows);
      setSummary(data.summary);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  }, [file, linkMode]);

  const confirmImport = useCallback(async () => {
    if (!previewToken) return;
    setConfirmBusy(true);
    try {
      const { data } = await backendApi.post<ImportResult>("/upload/claim-csv/confirm", {
        previewToken,
      });
      setLastResult(data);
      setPreviewOpen(false);
      setImportMsg(
        `Import job ${data.jobId.slice(0, 8)}… — ${data.created} created, ${data.failed} failed`,
      );
      toast.success(`Import complete: ${data.created} claim(s) created`);
      onImported?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setConfirmBusy(false);
    }
  }, [onImported, previewToken]);

  const confirmDisabled =
    linkMode === "STRICT_MATCH" && summary != null && (summary.conflicts > 0 || summary.unlinked > 0);

  return (
    <>
      <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
        Upload CSV / XLSX
        <span className="text-muted-foreground ml-2 font-normal">
          Create only (update/upsert in a later phase)
        </span>
      </Label>
      <div className="border-primary/20 bg-muted/20 rounded-xl border border-dashed p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FileSpreadsheet className="text-muted-foreground size-5 shrink-0" />
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                disabled={disabled}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setLastResult(null);
                  setImportMsg("");
                }}
                className="text-foreground w-full cursor-pointer text-sm font-bold file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-xs file:font-bold disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Badge variant="secondary" className="shrink-0 font-bold">
              Create only
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Link mode</Label>
              <Select
                value={linkMode}
                disabled={disabled}
                onValueChange={(v) => setLinkMode(v as typeof linkMode)}
              >
                <SelectTrigger className="h-9 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STRICT_MATCH">Strict match</SelectItem>
                  <SelectItem value="ALLOW_UNLINKED">Allow unlinked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 font-bold"
              disabled={disabled}
              onClick={() => void downloadSample()}
            >
              <Download className="size-3.5" />
              Sample CSV
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 font-bold"
              disabled={disabled || !file || previewBusy}
              onClick={() => void runPreview()}
            >
              {previewBusy ? "Analyzing…" : "Preview import"}
            </Button>
          </div>
        </div>
      </div>
      {importMsg ? <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{importMsg}</p> : null}
      {lastResult ? (
        <div className="text-muted-foreground mt-2 space-y-1 text-xs leading-relaxed">
          <p>
            Matched {lastResult.matchStats.matchedExact} · Unlinked {lastResult.matchStats.unlinked} ·
            Conflicts {lastResult.matchStats.conflicts}
          </p>
          {lastResult.errorReportUrl ? (
            <a className="text-primary font-bold underline" href={lastResult.errorReportUrl}>
              Download error report
            </a>
          ) : null}
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
            <DialogDescription>
              First 20 rows shown. Review match status before confirming.
            </DialogDescription>
          </DialogHeader>

          {summary ? (
            <p className="text-muted-foreground text-sm">
              {summary.matchedExact} matched · {summary.unlinked} unlinked · {summary.conflicts}{" "}
              conflicts · {summary.verificationWarnings} verification warnings · {summary.totalRows}{" "}
              total rows
            </p>
          ) : null}

          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim #</TableHead>
                  <TableHead>Policy #</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => {
                  const badge = matchBadge(row.matchStatus);
                  return (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="font-mono text-xs">{row.claimNo}</TableCell>
                      <TableCell className="font-mono text-xs">{row.policyNo || "—"}</TableCell>
                      <TableCell className={badge.className}>{badge.label}</TableCell>
                      <TableCell className="text-xs">
                        {row.verificationWarnings?.length
                          ? row.verificationWarnings.join(", ")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {confirmDisabled ? (
            <p className="text-destructive text-xs">
              Strict match mode: resolve unlinked/conflict rows or switch to Allow unlinked before
              importing.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={confirmBusy || confirmDisabled}
              onClick={() => void confirmImport()}
            >
              {confirmBusy ? "Importing…" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** @deprecated Use ClaimCsvImportInline inside the filters card. */
export function ClaimCsvImportPanel({ onImported }: { onImported?: () => void }) {
  return (
    <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Import claims (CSV / XLSX)</h2>
      <ClaimCsvImportInline onImported={onImported} />
    </div>
  );
}
