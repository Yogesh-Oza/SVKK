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
import { Input } from "@/components/ui/input";
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
import { AlertTriangle, Download, FileSpreadsheet, Search, Upload } from "lucide-react";
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

type PreviewFilter = "all" | "attention" | "ready" | "exists" | "error" | "conflict";

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
  status?: string;
  async?: boolean;
  progressPercent?: number;
};

type JobPollResult = {
  id: string;
  status: string;
  createdCount?: number | null;
  updatedCount?: number | null;
  failCount?: number | null;
  successCount?: number | null;
  durationMs?: number | null;
  csvVersion?: string | null;
  warningsJson?: string | null;
  errorReportUrl?: string;
  progressPercent?: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPolicyImportJob(jobId: string): Promise<ImportResult> {
  const started = Date.now();
  const maxWaitMs = 15 * 60 * 1000;
  for (;;) {
    const { data } = await backendApi.get<JobPollResult>(`/upload/csv/${jobId}`);
    if (data.status === "COMPLETED" || data.status === "FAILED") {
      let warnings: string[] | undefined;
      if (data.warningsJson) {
        try {
          warnings = JSON.parse(data.warningsJson) as string[];
        } catch {
          warnings = [data.warningsJson];
        }
      }
      const created = data.createdCount ?? 0;
      const updated = data.updatedCount ?? 0;
      const failed = data.failCount ?? 0;
      return {
        jobId: data.id,
        created,
        updated,
        failed,
        valid: data.successCount ?? created + updated,
        invalid: failed,
        durationMs: data.durationMs ?? Date.now() - started,
        csvVersion: data.csvVersion ?? undefined,
        warnings,
        errorReportUrl: data.errorReportUrl,
        status: data.status,
        progressPercent: data.progressPercent ?? 100,
      };
    }
    if (Date.now() - started > maxWaitMs) {
      throw new Error("Import is still running after 15 minutes. Check Jobs / try again shortly.");
    }
    await sleep(1500);
  }
}

type PolicyCsvImportMode = "CREATE_ONLY" | "UPDATE_POLICY";

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
  UPDATE_POLICY: {
    importMode: "UPDATE_ONLY",
    updateMode: "FULL",
    label: "Update policy",
    badge: "Update",
    subtitle: "Match by ref no — columns match Sample CSV",
  },
};

function statusBadge(status: PolicyPreviewStatus): { label: string; className: string } {
  if (status === "READY") return { label: "Will update", className: "text-sky-700" };
  if (status === "EXISTS") return { label: "Already exists", className: "text-amber-600" };
  if (status === "CONFLICT") return { label: "Conflict", className: "text-amber-600" };
  return { label: "Error", className: "text-destructive" };
}

function createStatusBadge(status: PolicyPreviewStatus): { label: string; className: string } {
  if (status === "READY") return { label: "Will create", className: "text-emerald-600" };
  if (status === "EXISTS") return { label: "Already exists", className: "text-amber-600" };
  if (status === "CONFLICT") return { label: "Conflict", className: "text-amber-600" };
  return { label: "Error", className: "text-destructive" };
}

/** Explain outcome and how to fix errors/conflicts (claims-style guidance). */
function statusExplain(row: PolicyPreviewRow, isUpdateMode: boolean): string {
  const msg = (row.errorMessage ?? "").trim();
  const lower = msg.toLowerCase();

  if (row.status === "READY") {
    if (isUpdateMode) {
      const n = row.updateFields?.length ?? 0;
      return n > 0
        ? `Matched by ref no. ${n} field${n === 1 ? "" : "s"} will be written to the policy.`
        : "Matched by ref no. No non-empty updatable fields in this row.";
    }
    return "Identifiers are free. This row will create a new policy.";
  }

  if (row.status === "EXISTS") {
    return "A live policy already matches these identifiers. Switch to Update policy, or remove this row from the create file.";
  }

  if (row.status === "CONFLICT") {
    if (lower.includes("svkk id does not match")) {
      return `${msg} Fix: use the SVKK ID already on that ref no, or correct the ref no.`;
    }
    if (lower.includes("year") && lower.includes("does not match")) {
      return `${msg} Fix: set Year to the policy’s period year, or clear Year so only ref no is used.`;
    }
    if (lower.includes("policy no already belongs")) {
      return `${msg} Fix: use a unique policy no, or keep the existing policy no for this ref no.`;
    }
    if (lower.includes("conflicting identifiers")) {
      return `${msg} Fix: make ref no, SVKK ID, and policy no point to the same policy.`;
    }
    if (lower.includes("multiple policies")) {
      return `${msg} Fix: add a unique ref no (and year if needed) so only one policy matches.`;
    }
    return msg
      ? `${msg} Fix the conflicting columns in the CSV, then preview again.`
      : "Identifiers match more than one policy. Disambiguate with ref no / year / policy no.";
  }

  // ERROR
  if (lower.includes("not found") && lower.includes("ref no")) {
    return `${msg} Fix: use an existing Reference No from the policy register, or create the policy first.`;
  }
  if (lower.includes("ref no is required")) {
    return "Ref no is required for updates. Add the Reference No column and fill every row.";
  }
  if (lower.includes("product type") || lower.includes("invalid product")) {
    return `${msg} Fix: use a Product Type from the sample CSV / allowed list.`;
  }
  if (lower.includes("required") || lower.includes("missing") || lower.includes("invalid")) {
    return msg
      ? `${msg} Fix the highlighted field in the CSV, then preview again.`
      : "Validation failed. Compare this row to the sample CSV and fix required fields.";
  }
  return msg || "This row failed validation. Fix the CSV and preview again.";
}

function rowNeedsAttention(row: PolicyPreviewRow): boolean {
  return row.status === "ERROR" || row.status === "CONFLICT" || row.status === "EXISTS";
}

function rowMatchesFilter(row: PolicyPreviewRow, filter: PreviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return rowNeedsAttention(row);
  if (filter === "ready") return row.status === "READY";
  if (filter === "exists") return row.status === "EXISTS";
  if (filter === "error") return row.status === "ERROR";
  if (filter === "conflict") return row.status === "CONFLICT";
  return true;
}

function rowSearchHaystack(row: PolicyPreviewRow): string {
  return [
    row.refNo,
    row.policyNo,
    row.svkkId,
    row.holderName,
    row.productType,
    row.village,
    row.errorMessage,
    row.detailMessage,
    ...(row.updateFields?.flatMap((f) => [f.field, f.value]) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

type PolicyCsvWalletImpact = {
  currentBalance: string;
  projectedDebit: string;
  resultingBalance: string;
  wouldGoNegative: boolean;
};

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
  const [walletImpact, setWalletImpact] = useState<PolicyCsvWalletImpact | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [previewSearch, setPreviewSearch] = useState("");

  const modeConfig = IMPORT_MODE_CONFIG[importMode];
  const isUpdateMode = importMode === "UPDATE_POLICY";

  const downloadSample = useCallback(async () => {
    if (onDownloadSample) {
      await onDownloadSample();
      return;
    }
    try {
      const res = await backendApi.get("/policies/export-sample.csv", { responseType: "blob" });
      const filename =
        importMode === "UPDATE_POLICY"
          ? "policies-update-sample.csv"
          : "policies-import-sample.csv";
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
    setWalletImpact(null);
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
        walletImpact?: PolicyCsvWalletImpact | null;
      }>("/upload/policy-csv/preview", fd);
      setPreviewToken(data.previewToken);
      setPreviewRows(data.previewRows);
      setSummary(data.summary);
      setHeaderWarnings(data.warnings ?? []);
      setDuplicateImport(data.duplicateImport ?? null);
      setWalletImpact(data.walletImpact ?? null);
      setPreviewFilter("all");
      setPreviewSearch("");
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
        const { data: started } = await backendApi.post<ImportResult>("/upload/policy-csv/confirm", {
          previewToken,
          force,
          allowNegativeWallet: walletImpact?.wouldGoNegative === true ? true : undefined,
        });
        const data =
          started.async || started.status === "PROCESSING" || started.status === "PENDING"
            ? await waitForPolicyImportJob(started.jobId)
            : started;
        setLastResult(data);
        setDuplicateImport(null);
        setWalletImpact(null);
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
            description: `${data.failed} row(s) failed.${data.errorReportUrl ? " Download the error CSV for details." : ""}`,
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
    [isUpdateMode, onImported, previewToken, walletImpact?.wouldGoNegative],
  );

  const confirmDisabled = isUpdateMode
    ? summary != null && (summary.errors > 0 || summary.conflicts > 0)
    : summary != null &&
      (summary.errors > 0 || summary.conflicts > 0 || summary.alreadyExists > 0);

  const blockConfirm = Boolean(duplicateImport) && !confirmDisabled;

  const attentionCount = previewRows.filter(rowNeedsAttention).length;
  const searchNeedle = previewSearch.trim().toLowerCase();
  const visibleRows = previewRows.filter((row) => {
    if (!rowMatchesFilter(row, previewFilter)) return false;
    if (!searchNeedle) return true;
    return rowSearchHaystack(row).includes(searchNeedle);
  });

  const filterChips: { id: PreviewFilter; label: string; count: number }[] = [
    { id: "all", label: "All rows", count: summary?.totalRows ?? previewRows.length },
    { id: "attention", label: "Needs attention", count: attentionCount },
    {
      id: "ready",
      label: isUpdateMode ? "Will update" : "Will create",
      count: summary?.ready ?? 0,
    },
    ...(!isUpdateMode
      ? [{ id: "exists" as const, label: "Already exist", count: summary?.alreadyExists ?? 0 }]
      : []),
    { id: "error", label: "Errors", count: summary?.errors ?? 0 },
    { id: "conflict", label: "Conflicts", count: summary?.conflicts ?? 0 },
  ];

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
                <SelectItem value="UPDATE_POLICY">Update policy</SelectItem>
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
                onDownloadErrorReport ? void onDownloadErrorReport(lastResult.jobId) : undefined
              }
            >
              Download error CSV
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex h-[min(92vh,920px)] max-h-[92vh] w-[min(98vw,1280px)] max-w-[min(98vw,1280px)] flex-col gap-3 overflow-hidden sm:max-w-[min(98vw,1280px)]">
          <DialogHeader>
            <DialogTitle>
              {isUpdateMode ? "Policy update preview" : "Policy import preview"}
            </DialogTitle>
            <DialogDescription>
              {summary
                ? `${summary.totalRows.toLocaleString("en-IN")} CSV rows · ${summary.ready} ${isUpdateMode ? "update" : "create"} · ${!isUpdateMode ? `${summary.alreadyExists} already exist · ` : ""}${summary.errors} errors · ${summary.conflicts} conflicts.`
                : `${previewRows.length.toLocaleString("en-IN")} rows from the file.`}{" "}
              {isUpdateMode
                ? "Rows match by Reference No. Fix every Error and Conflict before confirming."
                : "Create-only blocks on Errors, Conflicts, and rows that already exist."}
            </DialogDescription>
          </DialogHeader>

          {duplicateImport ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle>File already imported</AlertTitle>
              <AlertDescription>{duplicateImportDescription(duplicateImport)}</AlertDescription>
            </Alert>
          ) : null}

          {walletImpact?.wouldGoNegative ? (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle>Wallet will go negative</AlertTitle>
              <AlertDescription>
                Projected CD debit {walletImpact.projectedDebit} would leave balance{" "}
                {walletImpact.resultingBalance} (current {walletImpact.currentBalance}). Confirming
                will allow a negative wallet balance.
              </AlertDescription>
            </Alert>
          ) : null}

          {headerWarnings.length > 0 ? (
            <p className="text-amber-700 text-xs dark:text-amber-400">
              Header warnings: {headerWarnings.join("; ")}
            </p>
          ) : null}

          {summary ? (
            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <Button
                  key={chip.id}
                  type="button"
                  size="sm"
                  variant={previewFilter === chip.id ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs font-bold"
                  onClick={() => setPreviewFilter(chip.id)}
                >
                  {chip.label} {chip.count}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search ref no, policy no, SVKK ID, holder, village, field values…"
              className="h-8 pl-8 text-sm"
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Showing {visibleRows.length.toLocaleString("en-IN")} of{" "}
            {previewRows.length.toLocaleString("en-IN")} CSV rows
            {previewFilter !== "all" ? ` · filter: ${previewFilter}` : ""}
          </p>

          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <Table>
              <TableHeader className="bg-background sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-12">Row</TableHead>
                  <TableHead>Ref / Holder</TableHead>
                  <TableHead>Policy / SVKK</TableHead>
                  <TableHead>Product / Village</TableHead>
                  <TableHead>What happens</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>{isUpdateMode ? "Changes" : "Detail"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
                      No policies match this filter or search.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => {
                    const badge = isUpdateMode
                      ? statusBadge(row.status)
                      : createStatusBadge(row.status);
                    const updateFields = row.updateFields ?? [];
                    return (
                      <TableRow
                        key={row.rowNumber}
                        className="[content-visibility:auto] [contain-intrinsic-size:auto_64px]"
                      >
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {row.rowNumber}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{row.refNo || "—"}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {row.holderName || "No holder name"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{row.policyNo || "—"}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {row.svkkId || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[140px] text-xs">
                          <div className="truncate" title={row.productType || undefined}>
                            {row.productType || "—"}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {row.village || "—"}
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs font-semibold ${badge.className}`}>
                          {badge.label}
                        </TableCell>
                        <TableCell
                          className={`max-w-[320px] text-xs whitespace-normal ${
                            row.status === "ERROR" || row.status === "CONFLICT"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {statusExplain(row, isUpdateMode)}
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs">
                          {isUpdateMode && row.status === "READY" && updateFields.length > 0 ? (
                            <ul className="space-y-0.5">
                              {updateFields.map((entry) => (
                                <li key={`${row.rowNumber}-${entry.field}`} className="leading-snug">
                                  <span className="text-muted-foreground">{entry.field}</span>
                                  <span className="text-muted-foreground"> → </span>
                                  <span className="font-mono break-all">{entry.value}</span>
                                </li>
                              ))}
                            </ul>
                          ) : isUpdateMode && row.status === "READY" ? (
                            <span className="text-muted-foreground">No updatable fields</span>
                          ) : row.errorMessage &&
                            (row.status === "ERROR" || row.status === "CONFLICT") ? (
                            <span className="text-destructive font-mono text-[11px] break-all">
                              {row.errorMessage}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {row.detailMessage ?? (row.status === "READY" ? "OK" : "—")}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {confirmDisabled ? (
            <p className="text-destructive text-xs">
              {isUpdateMode
                ? `Update blocked: fix ${summary?.errors ?? 0} error${(summary?.errors ?? 0) === 1 ? "" : "s"} and ${summary?.conflicts ?? 0} conflict${(summary?.conflicts ?? 0) === 1 ? "" : "s"} in the CSV, then preview again. Use the Errors / Conflicts chips to find them.`
                : `Create blocked: fix errors, conflicts, and ${summary?.alreadyExists ?? 0} already-existing row${(summary?.alreadyExists ?? 0) === 1 ? "" : "s"} first. Use Needs attention to list them.`}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {isUpdateMode
                ? "Ready rows update the matched policy by Reference No. Only non-empty CSV columns are applied."
                : "Ready rows will create new policies. Identifiers must not already exist."}
            </p>
          )}

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
