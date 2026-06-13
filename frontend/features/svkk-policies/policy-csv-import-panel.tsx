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
  detailMessage?: string;
  updateFields?: Array<{ field: string; value: string }>;
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
  updated: number;
  failed: number;
  valid: number;
  invalid: number;
  durationMs: number;
  csvVersion?: string;
  warnings?: string[];
  errorReportUrl?: string;
};

type PolicyCsvImportMode = "CREATE_ONLY" | "UPDATE_POLICY_COURIER";

const IMPORT_MODE_CONFIG: Record<
  PolicyCsvImportMode,
  { importMode: string; updateMode?: string; label: string; badge: string; subtitle: string }
> = {
  CREATE_ONLY: {
    importMode: "CREATE_ONLY",
    label: "Create only",
    badge: "Create only",
    subtitle: "Format v2 — create new policies",
  },
  UPDATE_POLICY_COURIER: {
    importMode: "UPDATE_ONLY",
    updateMode: "POLICY_COURIER",
    label: "Update policy + courier",
    badge: "Update",
    subtitle: "Match by ref no — policy no, dates, courier",
  },
};

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
  const file = info.fileName ? ` (saved as ${info.fileName})` : "";
  return `The same CSV contents were already imported on ${when}${file}. Duplicate detection uses file data, not the filename — if you changed the CSV and still see this, save the file and upload again. Job ${info.jobId.slice(0, 8)}…. Click Import anyway to re-run, or edit the CSV data first.`;
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
  const [importMode, setImportMode] = useState<PolicyCsvImportMode>("CREATE_ONLY");
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

  const modeConfig = IMPORT_MODE_CONFIG[importMode];
  const isUpdateMode = importMode === "UPDATE_POLICY_COURIER";

  const downloadSample = useCallback(async () => {
    if (importMode === "CREATE_ONLY" && onDownloadSample) {
      await onDownloadSample();
      return;
    }
    try {
      const path =
        importMode === "UPDATE_POLICY_COURIER"
          ? "/policies/export-sample-policy-update.csv"
          : "/policies/export-sample.csv";
      const filename =
        importMode === "UPDATE_POLICY_COURIER"
          ? "policies-update-policy-courier-sample.csv"
          : "policies-import-sample.csv";
      const res = await backendApi.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Download failed"));
    }
  }, [importMode, onDownloadSample]);

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
      fd.append("mode", modeConfig.importMode);
      if (modeConfig.updateMode) {
        fd.append("updateMode", modeConfig.updateMode);
      }
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
  }, [file, modeConfig.importMode, modeConfig.updateMode]);

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
        const actionSummary = isUpdateMode
          ? `${data.updated} updated, ${data.failed} failed`
          : `${data.created} created, ${data.failed} failed`;
        setImportMsg(
          `Import job ${data.jobId.slice(0, 8)}… — ${actionSummary} (${data.durationMs} ms).`,
        );
        if (data.failed > 0) {
          toast.message("Import finished with errors", {
            description: `${data.failed} row(s) failed.`,
          });
        } else if (isUpdateMode) {
          toast.success(`Update complete: ${data.updated} policy row(s) updated`);
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
    [isUpdateMode, onImported, previewToken],
  );

  const confirmDisabled = isUpdateMode
    ? summary != null && (summary.errors > 0 || summary.conflicts > 0)
    : summary != null &&
      (summary.errors > 0 || summary.conflicts > 0 || summary.alreadyExists > 0);

  const blockConfirm = Boolean(duplicateImport) && !confirmDisabled;

  return (
    <>
      <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">
        Upload CSV
        <span className="text-muted-foreground ml-2 font-normal">{modeConfig.subtitle}</span>
      </Label>
      <div className="border-primary/20 bg-muted/20 rounded-xl border border-dashed p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={importMode}
              disabled={disabled}
              onValueChange={(value) => {
                setImportMode(value as PolicyCsvImportMode);
                setFile(null);
                setLastResult(null);
                setImportMsg("");
                setDuplicateImport(null);
              }}
            >
              <SelectTrigger className="w-full sm:w-56 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CREATE_ONLY">Create only</SelectItem>
                <SelectItem value="UPDATE_POLICY_COURIER">Update policy + courier</SelectItem>
              </SelectContent>
            </Select>
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
              {modeConfig.badge}
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
        <DialogContent className={isUpdateMode ? "max-w-5xl" : "max-w-4xl"}>
          <DialogHeader>
            <DialogTitle>Policy import preview</DialogTitle>
            <DialogDescription>
              First {previewRows.length} row(s) shown. Review status before confirming{" "}
              {isUpdateMode ? "policy + courier update" : "create-only import"}.
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
              {summary.ready} ready
              {!isUpdateMode ? ` · ${summary.alreadyExists} already exist` : ""} · {summary.errors}{" "}
              errors · {summary.conflicts} conflicts · {summary.totalRows} total rows
            </p>
          ) : null}

          <div className="max-h-96 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Ref no</TableHead>
                  {!isUpdateMode ? <TableHead>Policy no</TableHead> : null}
                  {!isUpdateMode ? <TableHead>SVKK ID</TableHead> : null}
                  {!isUpdateMode ? <TableHead>Holder</TableHead> : null}
                  {!isUpdateMode ? <TableHead>Product</TableHead> : null}
                  <TableHead>Status</TableHead>
                  {isUpdateMode ? (
                    <>
                      <TableHead>Field</TableHead>
                      <TableHead>New value</TableHead>
                    </>
                  ) : (
                    <TableHead>Detail</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.flatMap((row) => {
                  const badge = statusBadge(row.status);
                  const updateFields =
                    row.updateFields && row.updateFields.length > 0
                      ? row.updateFields
                      : isUpdateMode && row.status === "READY"
                        ? [{ field: "—", value: "No updatable fields" }]
                        : [{ field: "—", value: "—" }];

                  if (!isUpdateMode) {
                    return (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="text-xs">{row.rowNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{row.refNo || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.policyNo || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{row.svkkId || "—"}</TableCell>
                        <TableCell className="text-xs">{row.holderName || "—"}</TableCell>
                        <TableCell className="text-xs">{row.productType || "—"}</TableCell>
                        <TableCell className={`text-xs font-bold ${badge.className}`}>
                          {badge.label}
                        </TableCell>
                        <TableCell
                          className={`max-w-[280px] truncate text-xs ${
                            row.errorMessage ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {row.errorMessage ?? row.detailMessage ?? (row.status === "READY" ? "OK" : "—")}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (row.errorMessage || row.status !== "READY") {
                    return (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="text-xs">{row.rowNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{row.refNo || "—"}</TableCell>
                        <TableCell className={`text-xs font-bold ${badge.className}`}>
                          {badge.label}
                        </TableCell>
                        <TableCell colSpan={2} className="text-destructive text-xs">
                          {row.errorMessage ?? row.detailMessage ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return updateFields.map((entry, index) => (
                    <TableRow key={`${row.rowNumber}-${entry.field}-${index}`}>
                      {index === 0 ? (
                        <>
                          <TableCell className="text-xs align-top" rowSpan={updateFields.length}>
                            {row.rowNumber}
                          </TableCell>
                          <TableCell
                            className="font-mono text-xs align-top"
                            rowSpan={updateFields.length}
                          >
                            {row.refNo || "—"}
                          </TableCell>
                          <TableCell
                            className={`text-xs font-bold align-top ${badge.className}`}
                            rowSpan={updateFields.length}
                          >
                            {badge.label}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell className="text-xs">{entry.field}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-normal break-words">
                        {entry.value}
                      </TableCell>
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          </div>

          {confirmDisabled ? (
            <p className="text-destructive text-xs">
              {isUpdateMode
                ? "Update mode: fix error or conflict rows before importing."
                : "Create-only mode: fix error, conflict, or duplicate rows before importing."}
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
              {confirmBusy ? "Importing…" : isUpdateMode ? "Confirm update" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
