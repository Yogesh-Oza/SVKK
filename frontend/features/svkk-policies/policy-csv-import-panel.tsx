"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSvkkErrorMessage } from "@/lib/svkk/api-error";
import { backendApi } from "@/lib/svkk/api";
import { AlertTriangle, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type PolicyPreviewStatus = "READY" | "EXISTS" | "ERROR" | "CONFLICT";

type PolicyPreviewRow = {
  rowNumber: number;
  refNo: string;
  svkkId: string;
  policyNo: string;
  holderName: string;
  productType: string;
  village: string;
  status: PolicyPreviewStatus;
  errorMessage?: string;
};

type PolicyPreviewSummary = {
  totalRows: number;
  ready: number;
  alreadyExists: number;
  errors: number;
  conflicts: number;
};

type DuplicateImportInfo = {
  jobId: string;
  completedAt: string;
  fileName?: string;
};

type ImportResult = {
  jobId: string;
  created: number;
  failed: number;
  valid: number;
  invalid: number;
  durationMs: number;
  csvVersion?: string;
  warnings?: string[];
  errorReportUrl?: string;
};

const POLICY_IMPORT_MODE = "CREATE_ONLY" as const;

function statusBadge(status: PolicyPreviewStatus): { label: string; className: string } {
  if (status === "READY") return { label: "Ready", className: "text-emerald-600" };
  if (status === "EXISTS") return { label: "Exists", className: "text-amber-600" };
  if (status === "CONFLICT") return { label: "Conflict", className: "text-destructive" };
  return { label: "Error", className: "text-destructive" };
}

function formatImportTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function duplicateImportDescription(info: DuplicateImportInfo): string {
  const when = formatImportTimestamp(info.completedAt);
  const file = info.fileName ? ` (${info.fileName})` : "";
  return `This file was already imported on ${when}${file}. Job ${info.jobId.slice(0, 8)}…`;
}

type PolicyCsvImportInlineProps = {
  disabled?: boolean;
  onImported?: () => void;
  onDownloadSample?: () => void | Promise<void>;
  onDownloadErrorReport?: (jobId: string) => void | Promise<void>;
};

export function PolicyCsvImportInline({
  disabled = false,
  onImported,
  onDownloadSample,
  onDownloadErrorReport,
}: PolicyCsvImportInlineProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PolicyPreviewRow[]>([]);
  const [summary, setSummary] = useState<PolicyPreviewSummary | null>(null);
  const [headerWarnings, setHeaderWarnings] = useState<string[]>([]);
  const [duplicateImport, setDuplicateImport] = useState<DuplicateImportInfo | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [importMsg, setImportMsg] = useState("");

  const downloadSample = useCallback(async () => {
    if (onDownloadSample) {
      await onDownloadSample();
      return;
    }
    try {
      const res = await backendApi.get("/policies/export-sample.csv", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "policies-import-sample.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Download failed"));
    }
  }, [onDownloadSample]);

  const runPreview = useCallback(async () => {
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setPreviewBusy(true);
    setLastResult(null);
    setImportMsg("");
    setDuplicateImport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", POLICY_IMPORT_MODE);
      const { data } = await backendApi.post<{
        previewToken: string;
        previewRows: PolicyPreviewRow[];
        summary: PolicyPreviewSummary;
        warnings?: string[];
        duplicateImport?: DuplicateImportInfo | null;
      }>("/upload/policy-csv/preview", fd);
      setPreviewToken(data.previewToken);
      setPreviewRows(data.previewRows);
      setSummary(data.summary);
      setHeaderWarnings(data.warnings ?? []);
      setDuplicateImport(data.duplicateImport ?? null);
      setPreviewOpen(true);
      if (data.duplicateImport) {
        toast.warning("This file was imported before", {
          description: duplicateImportDescription(data.duplicateImport),
        });
      }
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Preview failed"));
    } finally {
      setPreviewBusy(false);
    }
  }, [file]);

  const confirmImport = useCallback(
    async (force = false) => {
      if (!previewToken) return;
      setConfirmBusy(true);
      try {
        const { data } = await backendApi.post<ImportResult>("/upload/policy-csv/confirm", {
          previewToken,
          force,
        });
        setLastResult(data);
        setDuplicateImport(null);
        setPreviewOpen(false);
        setFile(null);
        setImportMsg(
          `Import job ${data.jobId.slice(0, 8)}… — ${data.created} created, ${data.failed} failed (${data.durationMs} ms).`,
        );
        if (data.failed > 0) {
          toast.message("Import finished with errors", {
            description: `${data.failed} row(s) failed.`,
          });
        } else {
          toast.success(`Import complete: ${data.created} policy row(s) created`);
        }
        onImported?.();
      } catch (e) {
        toast.error(getSvkkErrorMessage(e, "Import failed"));
      } finally {
        setConfirmBusy(false);
      }
    },
    [onImported, previewToken],
  );

  const confirmDisabled =
    summary != null && (summary.errors > 0 || summary.conflicts > 0 || summary.alreadyExists > 0);

  const blockConfirm = Boolean(duplicateImport) && !confirmDisabled;

  return (
    <>
      <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
        Upload CSV
        <span className="text-muted-foreground ml-2 font-normal">
          Format v2 — create only (update/upsert in a later phase)
        </span>
      </Label>
      <div className="border-primary/20 bg-muted/20 rounded-xl border border-dashed p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <FileSpreadsheet className="text-muted-foreground size-5 shrink-0" />
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={disabled}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setLastResult(null);
                  setImportMsg("");
                  setDuplicateImport(null);
                }}
                className="text-foreground w-full cursor-pointer text-sm font-bold file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-xs file:font-bold disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Badge variant="secondary" className="shrink-0 font-bold">
              Create only
            </Badge>
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
            {lastResult.valid} valid · {lastResult.invalid} failed
            {lastResult.csvVersion ? ` (${lastResult.csvVersion})` : ""}
          </p>
          {lastResult.warnings?.length ? (
            <p className="text-amber-700 dark:text-amber-400">
              Warnings: {lastResult.warnings.slice(0, 3).join("; ")}
              {lastResult.warnings.length > 3 ? "…" : ""}
            </p>
          ) : null}
          {lastResult.errorReportUrl && lastResult.invalid > 0 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs font-bold"
              onClick={() =>
                onDownloadErrorReport
                  ? void onDownloadErrorReport(lastResult.jobId)
                  : undefined
              }
            >
              Download error CSV
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Policy import preview</DialogTitle>
            <DialogDescription>
              First {previewRows.length} row(s) shown. Review status before confirming create-only
              import.
            </DialogDescription>
          </DialogHeader>

          {duplicateImport ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle>File already imported</AlertTitle>
              <AlertDescription>{duplicateImportDescription(duplicateImport)}</AlertDescription>
            </Alert>
          ) : null}

          {headerWarnings.length > 0 ? (
            <p className="text-amber-700 text-xs dark:text-amber-400">
              Header warnings: {headerWarnings.join("; ")}
            </p>
          ) : null}

          {summary ? (
            <p className="text-muted-foreground text-sm">
              {summary.ready} ready · {summary.alreadyExists} already exist · {summary.errors} errors
              · {summary.conflicts} conflicts · {summary.totalRows} total rows
            </p>
          ) : null}

          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Policy no</TableHead>
                  <TableHead>SVKK ID</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => {
                  const badge = statusBadge(row.status);
                  return (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-xs">{row.rowNumber}</TableCell>
                      <TableCell className="font-mono text-xs">{row.policyNo || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.svkkId || "—"}</TableCell>
                      <TableCell className="text-xs">{row.holderName || "—"}</TableCell>
                      <TableCell className="text-xs">{row.productType || "—"}</TableCell>
                      <TableCell className={`text-xs font-bold ${badge.className}`}>
                        {badge.label}
                      </TableCell>
                      <TableCell className="text-destructive max-w-[200px] truncate text-xs">
                        {row.errorMessage ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {confirmDisabled ? (
            <p className="text-destructive text-xs">
              Create-only mode: fix error, conflict, or duplicate rows before importing.
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            {blockConfirm ? (
              <Button
                type="button"
                variant="outline"
                disabled={confirmBusy}
                onClick={() => void confirmImport(true)}
              >
                {confirmBusy ? "Importing…" : "Import anyway"}
              </Button>
            ) : null}
            <Button
              type="button"
              className="gap-1.5"
              disabled={confirmBusy || confirmDisabled || blockConfirm}
              onClick={() => void confirmImport(false)}
            >
              <Upload className="size-3.5" />
              {confirmBusy ? "Importing…" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
